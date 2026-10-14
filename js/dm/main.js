import { C, clamp } from "./config.js";
import { Network, openPeer, parseRoom } from "./network.js";
import { Controls } from "./controls.js";
import { mobileControls } from "./mobileControls.js";
import { TouchLayout } from "./touchLayout.js";
import { assist } from "./aimAssist.js";
import { move } from "./player.js";
import { setMap } from "./world.js";
import { MAPS } from "./maps.js";
import { Renderer } from "./renderer.js";
import { AudioFX } from "./weapon.js";
import { UI, $ } from "./ui.js";
const settings = {
  quality: "auto",
  sensitivity: 1,
  aimEnabled: true,
  aimStrength: 0.7,
  volume: 0.35,
};
try {
  Object.assign(
    settings,
    JSON.parse(localStorage.getItem("arena-settings") || "{}"),
  );
  $("name").value = localStorage.getItem("arena-name") || "Rookie";
} catch {}
const ui = new UI(),
  network = new Network(),
  audio = new AudioFX(settings);
let render;
try {
  render = new Renderer($("game"), settings);
} catch (e) {
  $("bootError").textContent =
    "WebGL could not start. Enable hardware acceleration or try another browser.";
  throw e;
}
let state = null,
  local = null,
  pending = [],
  seq = 0,
  round = -1,
  epoch = -1,
  operation = null,
  previousView = "menu",
  stateAt = performance.now(),
  recoveryReset = false,
  attempt = 0;
const controls = new Controls($("game"), pause, showScores, toggleLoadout);
controls.mobile =
  matchMedia("(pointer:coarse)").matches && navigator.maxTouchPoints > 0;
document.body.classList.toggle("touchDevice", controls.mobile);
const layout = new TouchLayout();
mobileControls(controls, () => audio.unlock());
const inMatch = () => state?.phase === "playing";
function rotate() {
  $("rotate").hidden = !(
    controls.mobile &&
    innerHeight > innerWidth &&
    inMatch() &&
    !layout.editing
  );
}
addEventListener("resize", rotate);
function suspend() {
  controls.active = false;
  controls.clear();
  document.exitPointerLock?.();
}
function pause() {
  if (
    !inMatch() ||
    layout.editing ||
    ["results", "menu", "connecting", "loadout", "settings"].includes(ui.view)
  )
    return;
  suspend();
  ui.show("pause");
}
function resume() {
  if (!inMatch()) return;
  ui.show("game");
  controls.active = true;
  controls.clear();
  audio.unlock();
  controls.lock();
  rotate();
}
function showScores(show) {
  if (!inMatch()) return;
  if (show) {
    ui.show("scoreboard");
    $("scoreTable").innerHTML = ui.table(state);
  } else if (ui.view === "scoreboard")
    ui.show(controls.active ? "game" : "pause");
}
function toggleLoadout() {
  if (!inMatch()) return;
  if (ui.view === "loadout") resume();
  else {
    suspend();
    ui.show("loadout");
  }
}
function leave() {
  attempt++;
  operation?.abort();
  operation = null;
  network.close();
  suspend();
  layout.close();
  state = local = ui.state = null;
  pending = [];
  seq = 0;
  round = epoch = -1;
  render.clear();
  $("killfeed").replaceChildren();
  $("rotate").hidden = true;
  ui.show("menu");
}
function name() {
  const value = $("name").value.trim().slice(0, 18) || "Rookie";
  try {
    localStorage.setItem("arena-name", value);
  } catch {}
  return value;
}
async function connect(kind) {
  const ticket = ++attempt;
  suspend();
  $("menuError").textContent = "";
  ui.show("connecting");
  operation = new AbortController();
  const signal = operation.signal;
  audio.unlock();
  try {
    if (kind === "create") {
      $("connectStatus").textContent = "Creating room…";
      await network.create(name(), { signal });
    } else if (kind === "join") {
      const room = parseRoom($("roomInput").value);
      $("connectStatus").textContent = "Joining " + room + "…";
      await network.join(name(), C.privatePrefix + room, signal);
    } else {
      $("connectStatus").textContent = "Starting bots…";
      await network.create(name(), { offline: true, signal });
      network.action({
        type: "configure",
        options: {
          map: $("soloMap").value,
          bots: Math.max(1, Number($("soloBots").value) || 5),
          difficulty: $("soloDifficulty").value,
        },
      });
      network.start();
      resume();
    }
  } catch (e) {
    if (ticket !== attempt) return;
    network.close();
    if (e.name !== "AbortError") {
      ui.show("menu");
      $("menuError").textContent = e.message;
    }
  } finally {
    if (ticket === attempt) operation = null;
  }
}
network.addEventListener("joined", () => {
  seq = 0;
  pending = [];
  round = epoch = -1;
  render.clear();
});
network.addEventListener("recovered", () => {
  pending = [];
  recoveryReset = true;
});
network.addEventListener("state", ({ detail: s }) => {
  const previous = state;
  state = s;
  stateAt = performance.now();
  if (previous?.map !== s.map) setMap(s.map);
  const a = s.players.find((p) => p.id === network.self);
  if (a) {
    if (recoveryReset) {
      seq = a.ack;
      recoveryReset = false;
      pending = [];
    } else seq = Math.max(seq, a.ack);
    if (s.round !== round || a.epoch !== epoch) {
      pending = [];
      round = s.round;
      epoch = a.epoch;
      local = { ...a };
      controls.yaw = a.yaw;
      controls.pitch = a.pitch;
    } else {
      const old = local ? { ...local } : null;
      pending = pending.filter((i) => i.seq > a.ack);
      local = { ...a };
      if (s.phase === "playing")
        for (const input of pending) move(local, input);
      render.correction(old, local);
    }
  }
  render.state(s);
  ui.update(s, network);
  if (s.phase === "playing" && previous?.phase !== "playing") {
    controls.clear();
    controls.active = false;
    ui.show("pause");
    rotate();
  }
  if (s.phase === "results" || s.phase === "lobby") {
    suspend();
    $("rotate").hidden = true;
  }
});
network.addEventListener("event", ({ detail: e }) => {
  ui.event(e);
  render.event(e, network.self);
  let distance = 0;
  if (local) {
    const p = state?.players.find((p) => p.id === e.id);
    if (p) distance = Math.hypot(local.x - p.x, local.z - p.z);
  }
  if (e.t === "shot") {
    audio.shot(distance, e.weapon);
    if (e.id === network.self && e.hit) audio.sound("hit");
  } else if (e.t === "step") audio.sound("step", distance);
});
network.addEventListener("failure", ({ detail: m }) => {
  leave();
  $("menuError").textContent = m;
});
network.addEventListener("status", ({ detail: m }) => {
  if (ui.view === "connecting") $("connectStatus").textContent = m;
  else ui.toast(m);
});
$("practice").onclick = () => connect("bots");
$("create").onclick = () => connect("create");
$("joinToggle").onclick = () => {
  $("joinForm").hidden = !$("joinForm").hidden;
  $("roomInput").focus();
};
$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  connect("join");
};
$("cancel").onclick = leave;
$("start").onclick = () => {
  audio.unlock();
  network.start();
  resume();
};
for (const id of ["leaveLobby", "leaveGame", "leaveResults"])
  $(id).onclick = leave;
$("copy").onclick = async () => {
  const link = new URL(location.href);
  link.search = "";
  link.hash = "";
  link.searchParams.set("room", network.room);
  try {
    await navigator.clipboard.writeText(link.href);
    ui.toast("Invite copied. Send it to your friends.");
  } catch {
    ui.toast("Room code: " + network.room);
  }
};
$("resume").onclick = resume;
$("pauseButton").onclick = pause;
$("scoreToggle").onclick = () => showScores(ui.view !== "scoreboard");
$("scoreClose").onclick = () => showScores(false);
$("rematch").onclick = () => {
  network.action({ type: "restart" });
  resume();
};
$("gunsToggle").onclick = toggleLoadout;
$("pauseGuns").onclick = toggleLoadout;
$("loadoutClose").onclick = resume;
$("gunItems").onclick = (e) => {
  const button = e.target.closest("[data-equip]");
  if (button) network.action({ type: "equip", item: button.dataset.equip });
};
const botOptions = (min = 0) =>
  Array.from(
    { length: 10 - min },
    (_, i) => `<option value="${i + min}">${i + min}</option>`,
  ).join("");
for (const id of ["botCount", "liveBotCount"]) $(id).innerHTML = botOptions();
$("soloBots").innerHTML = botOptions(1);
$("soloBots").value = "5";
for (const id of ["mapSelect", "soloMap"])
  $(id).innerHTML = Object.values(MAPS)
    .map((m) => `<option value="${m.id}">${m.name}</option>`)
    .join("");
for (const [id, key] of [
  ["mapSelect", "map"],
  ["botCount", "bots"],
  ["botDifficulty", "difficulty"],
  ["liveBotCount", "bots"],
  ["liveDifficulty", "difficulty"],
])
  $(id).onchange = (e) =>
    network.action({ type: "configure", options: { [key]: e.target.value } });
function settingsOpen() {
  previousView = ui.view;
  if (inMatch()) suspend();
  ui.show("settings");
}
$("settingsOpen").onclick = settingsOpen;
$("pauseSettings").onclick = settingsOpen;
for (const key of Object.keys(settings)) {
  const el = $(key);
  if (!el) continue;
  if (el.type === "checkbox") el.checked = settings[key];
  else el.value = settings[key];
  el.oninput = () => {
    settings[key] =
      el.type === "checkbox"
        ? el.checked
        : el.type === "range"
          ? Number(el.value)
          : el.value;
    $("sensitivityValue").value = Number(settings.sensitivity).toFixed(1);
    render.resize();
    try {
      localStorage.setItem("arena-settings", JSON.stringify(settings));
    } catch {}
  };
}
$("sensitivityValue").value = Number(settings.sensitivity).toFixed(1);
$("settingsClose").onclick = () => ui.show(inMatch() ? "pause" : previousView);
$("editLayout").onclick = () => {
  suspend();
  ui.show("game");
  layout.open();
  $("hud").hidden = true;
  $("rotate").hidden = true;
};
$("layoutDone").onclick = () => {
  layout.close();
  ui.show("settings");
};
let connection = {};
try {
  connection = JSON.parse(localStorage.getItem("arena-connection") || "{}");
} catch {}
for (const [id, key] of [
  ["signalHost", "host"],
  ["signalPort", "port"],
  ["signalPath", "path"],
  ["turnUrl", "turnUrl"],
  ["turnUser", "turnUser"],
  ["turnPass", "turnPass"],
])
  if (connection[key]) $(id).value = connection[key];
$("saveConnection").onclick = () => {
  const saved = {
    host: $("signalHost").value.trim(),
    port: Number($("signalPort").value) || 443,
    path: $("signalPath").value || "/",
    secure: true,
    turnUrl: $("turnUrl").value.trim(),
    turnUser: $("turnUser").value,
    turnPass: $("turnPass").value,
  };
  try {
    localStorage.setItem("arena-connection", JSON.stringify(saved));
    ui.toast("Saved for your next connection.");
  } catch {
    ui.toast("Settings could not be saved.");
  }
};
$("resetConnection").onclick = () => {
  try {
    localStorage.removeItem("arena-connection");
  } catch {}
  for (const id of ["signalHost", "turnUrl", "turnUser", "turnPass"])
    $(id).value = "";
  $("signalPort").value = 443;
  $("signalPath").value = "/";
  ui.toast("Default connection settings restored.");
};
let testAbort = null;
$("testConnection").onclick = async () => {
  testAbort?.abort();
  testAbort = new AbortController();
  const out = $("connectionTest");
  out.textContent = "Testing saved room service…";
  out.dataset.ok = "false";
  $("testConnection").disabled = true;
  try {
    const peer = await openPeer(undefined, testAbort.signal);
    peer.destroy();
    out.textContent =
      "Room service reachable. If joining still fails, check the host/code or use a TURN relay for your network.";
    out.dataset.ok = "true";
  } catch (e) {
    out.textContent = e.message;
  } finally {
    $("testConnection").disabled = false;
  }
};
try {
  const room = new URL(location.href).searchParams.get("room");
  if (room) {
    $("roomInput").value = parseRoom(room);
    $("joinForm").hidden = false;
  }
} catch (e) {
  $("menuError").textContent = e.message;
}
let lastTick = performance.now(),
  accum = 0;
setInterval(() => {
  const now = performance.now();
  accum += Math.min((now - lastTick) / 1000, 0.2);
  lastTick = now;
  while (accum >= C.tick) {
    accum -= C.tick;
    if (network.self === "practice" && inMatch() && !controls.active) continue;
    if (inMatch() && local && !network.reconnecting) {
      if (pending.length > 120) {
        if (!network.host) network.recover();
        pending = [];
      }
      const i = controls.active
        ? controls.sample(++seq)
        : {
            seq: ++seq,
            mx: 0,
            mz: 0,
            yaw: controls.yaw,
            pitch: controls.pitch,
            fire: false,
            jump: false,
            reload: false,
            sprint: false,
          };
      pending.push(i);
      move(local, i);
      network.inputs(pending.slice(-10), round);
    }
    network.tick();
  }
}, 10);
setInterval(() => network.heartbeat(), 1000);
let lastRender = performance.now(),
  friction = 1;
function frame(now) {
  const dt = Math.min((now - lastRender) / 1000, 0.05);
  lastRender = now;
  if (local) local.serverTime = (state?.time || 0) + (now - stateAt) / 1000;
  if (controls.active && controls.mobile && !layout.editing) {
    if (controls.touchAim) {
      const a = assist(
        local,
        state?.players || [],
        controls.yaw,
        controls.pitch,
        dt,
        settings.aimStrength,
        settings.aimEnabled,
        "ffa",
      );
      friction += (a.friction - friction) * Math.min(1, dt * 12);
      controls.yaw = a.yaw;
      controls.pitch = a.pitch;
    } else friction += (1 - friction) * Math.min(1, dt * 12);
    const ads = controls.ads ? 0.7 : 1;
    controls.yaw -=
      controls.lookX * 0.003 * settings.sensitivity * friction * ads;
    controls.pitch = clamp(
      controls.pitch -
        controls.lookY * 0.003 * settings.sensitivity * friction * ads,
      -1.45,
      1.45,
    );
    controls.lookX = controls.lookY = 0;
  }
  render.render(local, controls, state, dt, !!inMatch());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.arenaReady = true;
addEventListener("pagehide", () => {
  network.close();
  testAbort?.abort();
});
