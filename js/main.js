import { C, clamp } from "./config.js";
import { Network } from "./network.js";
import { Matchmaking } from "./matchmaking.js";
import { Controls } from "./controls.js";
import { mobileControls } from "./mobileControls.js";
import { assist } from "./aimAssist.js";
import { move } from "./player.js";
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
    "WebGL unavailable. Enable hardware acceleration or use a supported browser. " +
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
  previousView = "menu";
const controls = new Controls($("game"), pause, showScores);
controls.mobile =
  matchMedia("(pointer:coarse)").matches && navigator.maxTouchPoints > 0;
document.body.classList.toggle("touchDevice", controls.mobile);
mobileControls(controls, () => audio.unlock());
function rotate() {
  $("rotate").hidden = !(
    controls.mobile &&
    innerHeight > innerWidth &&
    state?.phase === "playing"
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
    state?.phase !== "playing" ||
    ["results", "menu", "connecting"].includes(ui.view)
  )
    return;
  suspend();
  ui.show("pause");
}
function resume() {
  if (state?.phase !== "playing") return;
  ui.show("game");
  controls.active = true;
  controls.clear();
  audio.unlock();
  controls.lock();
  rotate();
}
function showScores(show) {
  if (state?.phase !== "playing") return;
  if (show) {
    ui.show("scoreboard");
    $("scoreTable").innerHTML = ui.table(state);
  } else if (ui.view === "scoreboard")
    ui.show(controls.active ? "game" : "pause");
}
function leave() {
  operation?.abort();
  operation = null;
  matchmaking.cancel();
  network.close();
  suspend();
  state = local = null;
  pending = [];
  seq = 0;
  round = epoch = -1;
  render.clear();
  $("killfeed").replaceChildren();
  $("rotate").hidden = true;
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
      const code = $("roomInput").value.trim().toUpperCase().replace(/\s/g, "");
      if (!/^[A-HJ-NP-Z2-9]{10}$/.test(code))
        throw new Error(
          "Enter the 10-character room code copied by your friend.",
        );
      $("connectStatus").textContent = "Joining private room…";
      await network.join(name(), C.privatePrefix + code, signal);
    } else {
      $("connectStatus").textContent = "Loading practice…";
      await network.create(name(), { offline: true });
      network.start();
      resume();
    }
  } catch (e) {
    network.close();
    if (e.name !== "AbortError") {
      ui.show("menu");
      $("menuError").textContent = e.message;
    }
  } finally {
    operation = null;
  }
}
network.addEventListener("joined", () => {
  seq = 0;
  pending = [];
  round = epoch = -1;
  render.clear();
});
network.addEventListener("state", ({ detail: s }) => {
  const previous = state;
  state = s;
  const authoritative = s.players.find((p) => p.id === network.self);
  if (authoritative) {
    seq = Math.max(seq, authoritative.ack);
    const changed = s.round !== round || authoritative.epoch !== epoch;
    if (changed) {
      pending = [];
      round = s.round;
      epoch = authoritative.epoch;
      local = { ...authoritative };
      if (!previous || previous.phase !== "playing") {
        controls.yaw = authoritative.yaw;
        controls.pitch = authoritative.pitch;
      }
    } else {
      const old = local ? { ...local } : null;
      pending = pending.filter((i) => i.seq > authoritative.ack);
      local = { ...authoritative };
      for (const input of pending) move(local, input);
      render.correction(old, local);
    }
  }
  render.state(s);
  ui.update(s, network);
  if (s.phase === "playing" && previous?.phase !== "playing") {
    controls.clear();
    ui.show("pause");
    controls.active = false;
    rotate();
  }
  if (s.phase === "results") {
    suspend();
    $("rotate").hidden = true;
  }
});
network.addEventListener("event", ({ detail: e }) => {
  ui.event(e);
  render.event(e, network.self);
  if (e.t === "shot") {
    const p = state?.players.find((p) => p.id === e.id);
    audio.shot(
      e.id === network.self
        ? 0
        : local && p
          ? Math.hypot(local.x - p.x, local.z - p.z)
          : 20,
    );
  }
});
network.addEventListener("failure", ({ detail: message }) => {
  leave();
  $("menuError").textContent = message;
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
$("cancel").onclick = () => leave();
$("start").onclick = () => {
  audio.unlock();
  network.start();
  resume();
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
function settingsOpen() {
  previousView = ui.view;
  if (state?.phase === "playing") suspend();
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
$("settingsClose").onclick = () =>
  ui.show(state?.phase === "playing" ? "pause" : previousView);
let lastTick = performance.now(),
  accum = 0;
setInterval(() => {
  const now = performance.now();
  accum += Math.min((now - lastTick) / 1000, 0.2);
  lastTick = now;
  while (accum >= C.tick) {
    accum -= C.tick;
    if (state?.phase === "playing" && local) {
      if (pending.length > 100) {
        network.fail("Host is not acknowledging inputs. Please rejoin.");
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
          };
      pending.push(i);
      move(local, i);
      network.inputs(pending.slice(-10), round);
    }
    network.tick();
  }
}, 10);
setInterval(() => network.heartbeat(), 1500);
let lastRender = performance.now(),
  friction = 1;
function frame(now) {
  const dt = Math.min((now - lastRender) / 1000, 0.05);
  lastRender = now;
  if (controls.active && controls.mobile) {
    if (controls.touchAim) {
      const a = assist(
        local,
        state?.players || [],
        controls.yaw,
        controls.pitch,
        dt,
        settings.aimStrength,
        settings.aimEnabled,
      );
      friction += (a.friction - friction) * Math.min(1, dt * 12);
      controls.yaw = a.yaw;
      controls.pitch = a.pitch;
    } else friction += (1 - friction) * Math.min(1, dt * 12);
    controls.yaw -= controls.lookX * 0.003 * settings.sensitivity * friction;
    controls.pitch = clamp(
      controls.pitch - controls.lookY * 0.003 * settings.sensitivity * friction,
      -1.45,
      1.45,
    );
    controls.lookX = controls.lookY = 0;
  }
  render.render(local, controls, state, dt, state?.phase === "playing");
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.arenaReady = true;
window.addEventListener("pagehide", () => network.close());
