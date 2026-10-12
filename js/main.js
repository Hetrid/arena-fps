import { C, clamp } from "./config.js";
import { Network } from "./network.js";
import { Matchmaking } from "./matchmaking.js";
import { Controls } from "./controls.js";
import { mobileControls } from "./mobileControls.js";
import { TouchLayout } from "./touchLayout.js";
import { assist } from "./aimAssist.js";
import { move } from "./player.js";
import { setMap, setEffects } from "./world.js";
import { isTactical } from "./catalog.js";
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
  matchmaking = new Matchmaking(network),
  audio = new AudioFX(settings);
let render;
try {
  render = new Renderer($("game"), settings);
} catch (e) {
  $("bootError").textContent =
    "WebGL unavailable. Enable hardware acceleration or use another browser. " +
    e.message;
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
const controls = new Controls($("game"), pause, showScores, toggleShop);
controls.mobile =
  matchMedia("(pointer:coarse)").matches && navigator.maxTouchPoints > 0;
document.body.classList.toggle("touchDevice", controls.mobile);
const layout = new TouchLayout();
mobileControls(controls, () => audio.unlock());
function inRound() {
  return state && ["playing", "buy", "roundend"].includes(state.phase);
}
function rotate() {
  $("rotate").hidden = !(
    controls.mobile &&
    innerHeight > innerWidth &&
    inRound() &&
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
    !inRound() ||
    layout.editing ||
    ["results", "menu", "connecting", "shop", "settings"].includes(ui.view)
  )
    return;
  suspend();
  ui.show("pause");
}
function resume() {
  if (!inRound()) return;
  ui.show("game");
  controls.active = true;
  controls.clear();
  audio.unlock();
  controls.lock();
  rotate();
}
function showScores(show) {
  if (!inRound()) return;
  if (show) {
    ui.show("scoreboard");
    $("scoreTable").innerHTML = ui.table(state);
  } else if (ui.view === "scoreboard")
    ui.show(controls.active ? "game" : "pause");
}
function toggleShop() {
  if (!state || !inRound()) return;
  if (isTactical(state.mode) && state.phase !== "buy") {
    ui.toast("Armory opens during the buy phase.");
    return;
  }
  if (ui.view === "shop") {
    resume();
    return;
  }
  suspend();
  ui.show("shop");
}
function leave() {
  attempt++;
  operation?.abort();
  operation = null;
  matchmaking.cancel();
  network.close();
  suspend();
  layout.close();
  state = local = null;
  ui.state = null;
  pending = [];
  seq = 0;
  round = epoch = -1;
  render.clear();
  $("killfeed").replaceChildren();
  $("rotate").hidden = true;
  $("flashOverlay").style.opacity = 0;
  ui.show("menu");
}
function name() {
  const n = $("name").value.trim().slice(0, 18) || "Rookie";
  try {
    localStorage.setItem("arena-name", n);
  } catch {}
  return n;
}
async function connect(kind) {
  const ticket = ++attempt;
  suspend();
  $("menuError").textContent = "";
  ui.show("connecting");
  operation = new AbortController();
  const signal = operation.signal;
  try {
    if (kind === "quick")
      await matchmaking.quick(
        name(),
        (s) => ($("connectStatus").textContent = s),
      );
    else if (kind === "create") {
      $("connectStatus").textContent = "Creating private room…";
      await network.create(name(), { signal });
    } else if (kind === "join") {
      const room = $("roomInput").value.trim().toUpperCase().replace(/\s/g, "");
      if (!/^[A-HJ-NP-Z2-9]{10}$/.test(room))
        throw new Error("Enter your friend’s 10-character room code.");
      $("connectStatus").textContent = "Joining room…";
      await network.join(name(), C.privatePrefix + room, signal);
    } else {
      $("connectStatus").textContent = "Loading practice…";
      await network.create(name(), { offline: true });
      network.action({ type: "configure", options: { mode: "ffa" } });
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
  setEffects(s.effects || []);
  const authoritative = s.players.find((p) => p.id === network.self);
  if (authoritative) {
    if (recoveryReset) {
      seq = authoritative.ack;
      recoveryReset = false;
      pending = [];
    } else seq = Math.max(seq, authoritative.ack);
    const changed = s.round !== round || authoritative.epoch !== epoch;
    if (changed) {
      pending = [];
      round = s.round;
      epoch = authoritative.epoch;
      local = { ...authoritative };
      controls.yaw = authoritative.yaw;
      controls.pitch = authoritative.pitch;
    } else {
      const old = local ? { ...local } : null;
      pending = pending.filter((i) => i.seq > authoritative.ack);
      local = { ...authoritative };
      if (s.phase === "playing")
        for (const input of pending) move(local, input);
      render.correction(old, local);
    }
  }
  render.state(s);
  ui.update(s, network);
  if (
    s.phase === "buy" &&
    (previous?.phase !== "buy" || previous?.round !== s.round)
  ) {
    suspend();
    ui.show("shop");
    rotate();
  } else if (s.phase === "playing" && previous?.phase !== "playing") {
    if (previous?.phase === "buy" && controls.active) {
      ui.show("game");
    } else {
      controls.clear();
      controls.active = false;
      ui.show("pause");
    }
    rotate();
  }
  if (s.phase === "results" || s.phase === "lobby") {
    suspend();
    $("rotate").hidden = true;
  }
  if (s.phase === "roundend" && ui.view === "shop") {
    suspend();
    ui.show("pause");
  }
});
network.addEventListener("event", ({ detail: e }) => {
  ui.event(e);
  render.event(e, network.self);
  let distance = 0;
  if (local) {
    const p = state?.players.find((p) => p.id === e.id);
    if (p) distance = Math.hypot(local.x - p.x, local.z - p.z);
    else if (e.x !== undefined)
      distance = Math.hypot(local.x - e.x, local.z - e.z);
  }
  if (e.t === "shot") {
    audio.shot(distance, e.weapon);
    if (e.id === network.self && e.hit) audio.sound("hit");
  } else if (
    [
      "explosion",
      "flash",
      "throw",
      "plant",
      "defuse",
      "roundResult",
      "ability",
      "step",
      "beep",
    ].includes(e.t)
  )
    audio.sound(e.t, distance);
});
network.addEventListener("failure", ({ detail: m }) => {
  leave();
  $("menuError").textContent = m;
});
network.addEventListener("status", ({ detail: m }) => ui.toast(m));
$("quick").onclick = () => connect("quick");
$("create").onclick = () => connect("create");
$("joinToggle").onclick = () => {
  $("joinForm").hidden = !$("joinForm").hidden;
  $("roomInput").focus();
};
$("joinForm").onsubmit = (e) => {
  e.preventDefault();
  connect("join");
};
$("practice").onclick = () => connect("practice");
$("cancel").onclick = leave;
$("start").onclick = () => {
  audio.unlock();
  network.start();
};
for (const id of ["leaveLobby", "leaveGame", "leaveResults"])
  $(id).onclick = leave;
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(network.room);
    ui.toast("Room code copied.");
  } catch {
    ui.toast("Copy this code: " + network.room);
  }
};
$("resume").onclick = resume;
$("pauseButton").onclick = pause;
$("scoreToggle").onclick = () => showScores(ui.view !== "scoreboard");
$("scoreClose").onclick = () => showScores(false);
$("rematch").onclick = () => network.ready();
$("buyToggle").onclick = toggleShop;
$("shopClose").onclick = resume;
$("shopItems").onclick = (e) => {
  const button = e.target.closest("[data-buy]");
  if (button && !button.disabled)
    network.action({ type: "buy", item: button.dataset.buy });
};
$("mapVote").onclick = (e) => {
  const button = e.target.closest("[data-map]");
  if (button) network.action({ type: "vote", map: button.dataset.map });
};
$("agentSelect").onchange = (e) =>
  network.action({ type: "agent", agent: e.target.value });
$("lobbyPlayers").onchange = (e) => {
  if (e.target.dataset.team)
    network.action({
      type: "team",
      id: e.target.dataset.team,
      team: e.target.value,
    });
};
for (const [id, key] of [
  ["modeSelect", "mode"],
  ["splitSelect", "targetA"],
  ["goalSelect", "goal"],
])
  $(id).onchange = (e) =>
    network.action({ type: "configure", options: { [key]: e.target.value } });
function settingsOpen() {
  previousView = ui.view;
  if (inRound()) suspend();
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
$("settingsClose").onclick = () => ui.show(inRound() ? "pause" : previousView);
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
    ui.toast("Connection settings saved for your next room.");
  } catch {
    ui.toast("Could not save connection settings.");
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
let lastTick = performance.now(),
  accum = 0;
setInterval(() => {
  const now = performance.now();
  accum += Math.min((now - lastTick) / 1000, 0.2);
  lastTick = now;
  while (accum >= C.tick) {
    accum -= C.tick;
    if (
      state &&
      ["playing", "buy"].includes(state.phase) &&
      local &&
      !network.reconnecting
    ) {
      if (pending.length > 120) {
        network.recover();
        pending = [];
        break;
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
            interact: false,
            ability: false,
            throw: null,
            slot: null,
          };
      pending.push(i);
      if (state.phase === "playing") move(local, i);
      else {
        local.yaw = i.yaw;
        local.pitch = i.pitch;
      }
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
  const serverTime = (state?.time || 0) + (now - stateAt) / 1000;
  if (local) local.serverTime = serverTime;
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
        state?.mode,
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
  ui.frame(serverTime);
  render.render(local, controls, state, dt, !!inRound());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.arenaReady = true;
window.addEventListener("pagehide", () => network.close());
