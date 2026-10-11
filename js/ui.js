import { ranking } from "./game.js";
import { C, COLORS } from "./config.js";
export const $ = (id) => document.getElementById(id);
export const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export class UI {
  constructor() {
    this.view = "menu";
    this.state = null;
    this.self = null;
    this.host = false;
    this.previousHP = 100;
    this.lastRound = -1;
    this.lastDraw = 0;
    this.toastTimer = null;
  }
  show(view) {
    for (const id of [
      "menu",
      "connecting",
      "lobby",
      "settings",
      "pause",
      "scoreboard",
      "results",
    ])
      $(id).hidden = id !== view;
    this.view = view;
    const inGame = ["game", "pause", "settings-game", "scoreboard"].includes(
      view,
    );
    $("hud").hidden = !inGame;
    document.body.classList.toggle("playing", inGame);
    $("touch").hidden = !(
      view === "game" && document.body.classList.contains("touchDevice")
    );
    if (view === "game") $("scoreboard").hidden = true;
  }
  toast(message) {
    $("toast").textContent = message;
    $("toast").style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => ($("toast").style.opacity = 0), 3500);
  }
  table(s) {
    return (
      "<table><thead><tr><th>PLAYER</th><th>KILLS</th><th>DEATHS</th><th>PING</th></tr></thead><tbody>" +
      ranking(s.players)
        .map(
          (p) =>
            `<tr class="${p.id === this.self ? "self" : ""}"><td>${escape(p.name)}${p.id === this.self ? " (you)" : ""}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.ping} ms</td></tr>`,
        )
        .join("") +
      "</tbody></table>"
    );
  }
  update(s, net) {
    this.state = s;
    this.self = net.self;
    this.host = net.host;
    if (s.phase === "lobby") {
      if (this.view !== "lobby") this.show("lobby");
      $("roomType").textContent = net.public
        ? "PUBLIC MATCH"
        : net.self === "practice"
          ? "SOLO PRACTICE"
          : "PRIVATE ROOM";
      $("roomCode").textContent = net.public
        ? "WAREHOUSE"
        : net.self === "practice"
          ? "TRAINING"
          : net.room;
      $("copy").hidden = net.public || net.self === "practice";
      $("lobbyCount").textContent =
        `${s.players.length} / ${C.maxPlayers} players`;
      $("lobbyPlayers").innerHTML = s.players
        .map(
          (p) =>
            `<div class="playerRow"><span style="color:${COLORS[p.index % 6]}">${escape(p.name)}</span><small>${p.index === 0 ? "HOST · " : ""}CONNECTED</small></div>`,
        )
        .join("");
      $("start").hidden = !net.host;
      $("lobbyNote").textContent = net.host
        ? s.players.length < 2
          ? "Start alone to practice, or wait for friends."
          : "Everyone connected. Start when ready."
        : "Waiting for the host to start.";
    }
    if (s.phase === "results") {
      if (this.view !== "results") this.show("results");
      const winner = s.players.find((p) => p.id === s.winner);
      $("winner").textContent = (winner?.name || "Player") + " wins";
      $("resultTable").innerHTML = this.table(s);
      $("rematchInfo").textContent =
        `${s.players.filter((p) => p.ready).length} / ${s.players.length} ready. All remaining players must ready up.`;
      $("rematch").textContent = s.players.find((p) => p.id === net.self)?.ready
        ? "Cancel Rematch Ready"
        : "Ready for Rematch";
    }
    const p = s.players.find((p) => p.id === net.self);
    if (p) {
      $("health").textContent = p.hp;
      $("healthBar").style.width =
        Math.max(0, p.hp) *
          (document.body.classList.contains("touchDevice") ? 0.75 : 1.2) +
        "px";
      $("ammo").textContent = p.ammo;
      $("score").textContent = p.kills;
      $("ping").textContent = p.ping + " ms";
      $("reloadText").textContent =
        p.reload > s.time
          ? "RELOADING…"
          : p.shield > s.time
            ? "SPAWN PROTECTION"
            : "";
      $("announcement").textContent =
        p.hp <= 0
          ? `RESPAWN IN ${Math.max(0, Math.ceil(p.respawn - s.time))}`
          : "";
      if (p.hp < this.previousHP) {
        $("damageOverlay").style.opacity = 0.6;
        setTimeout(() => ($("damageOverlay").style.opacity = 0), 150);
      }
      this.previousHP = p.hp;
    }
    const sec = Math.ceil(s.remaining);
    $("timer").textContent = `${Math.floor(sec / 60)
      .toString()
      .padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
    if (this.view === "scoreboard") $("scoreTable").innerHTML = this.table(s);
  }
  event(e) {
    if (e.t === "shot" && e.id === this.self && e.hit) {
      $("hitmarker").style.color = e.killed ? "#b9f36b" : "white";
      $("hitmarker").style.opacity = 1;
      setTimeout(() => ($("hitmarker").style.opacity = 0), 120);
    }
    if (e.t === "kill") {
      const killer = this.state?.players.find((p) => p.id === e.killer),
        victim = this.state?.players.find((p) => p.id === e.victim);
      const row = document.createElement("div");
      row.className = "kill";
      row.textContent = `${killer?.name || "Player"}  ▸  ${victim?.name || "Player"}`;
      $("killfeed").prepend(row);
      while ($("killfeed").children.length > 5)
        $("killfeed").lastChild.remove();
      setTimeout(() => row.remove(), 5500);
    }
  }
}
