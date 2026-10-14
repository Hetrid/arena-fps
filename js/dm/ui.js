import { ranking } from "./game.js";
import { C } from "./config.js";
import { WEAPONS } from "./catalog.js";
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
    this.previousHP = 100;
    this.lobbyKey = "";
    this.gunKey = "";
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
      "loadout",
    ])
      $(id).hidden = id !== view;
    this.view = view;
    const game = ["game", "pause", "scoreboard", "loadout"].includes(view);
    $("hud").hidden = !game;
    document.body.classList.toggle("playing", game);
    $("touch").hidden = !(
      view === "game" && document.body.classList.contains("touchDevice")
    );
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
            `<tr class="${p.id === this.self ? "self" : ""}"><td>${escape(p.name)}${p.id === this.self ? " (you)" : ""}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.bot ? "BOT" : p.connected ? p.ping + " ms" : "RECONNECT"}</td></tr>`,
        )
        .join("") +
      "</tbody></table>"
    );
  }
  update(s, net) {
    this.state = s;
    this.self = net.self;
    const p = s.players.find((p) => p.id === net.self);
    if (s.phase === "lobby") {
      if (this.view !== "lobby") this.show("lobby");
      $("roomCode").textContent = net.room;
      $("lobbyCount").textContent =
        `${s.players.filter((p) => !p.bot).length} players · ${s.players.filter((p) => p.bot).length} bots · ${C.maxPlayers} slots`;
      $("hostOptions").hidden = !net.host;
      $("mapSelect").value = s.map;
      $("botCount").value = s.bots;
      $("botDifficulty").value = s.difficulty;
      const key = JSON.stringify(
        s.players.map((p) => [p.id, p.name, p.connected, p.bot]),
      );
      if (key !== this.lobbyKey) {
        this.lobbyKey = key;
        $("lobbyPlayers").innerHTML = s.players
          .map(
            (p) =>
              `<div class="playerRow"><span>${escape(p.name)}${p.id === net.self ? " (you)" : ""}</span><small class="${p.bot ? "botBadge" : ""}">${p.bot ? "BOT" : p.connected ? "CONNECTED" : "RECONNECTING"}</small></div>`,
          )
          .join("");
      }
      $("start").hidden = !net.host;
      $("lobbyNote").textContent = net.host
        ? "First to 25 kills. Choose bots or wait for friends, then start."
        : "Waiting for the host to start deathmatch.";
    }
    if (s.phase === "results") {
      if (this.view !== "results") this.show("results");
      const winner = s.players.find((p) => p.id === s.winner);
      $("winner").textContent = (winner?.name || "Match") + " wins";
      $("resultTable").innerHTML = this.table(s);
      $("rematch").hidden = !net.host;
      $("rematchInfo").textContent = net.host
        ? "Play again with the same players and bots."
        : "Waiting for the host to play again.";
    }
    $("liveBots").hidden = !net.host;
    $("liveBotCount").value = s.bots;
    $("liveDifficulty").value = s.difficulty;
    if (p) {
      $("health").textContent = Math.ceil(p.hp);
      $("healthBar").style.width = p.hp + "px";
      $("ammo").textContent = p.ammo;
      $("reserve").textContent = "/ " + p.reserve;
      $("score").textContent = p.kills;
      $("ping").textContent = net.reconnecting
        ? "RECONNECTING"
        : net.host
          ? "HOST"
          : p.ping + " ms";
      $("weaponName").textContent = WEAPONS[p.weapon]?.name || "";
      $("reloadText").textContent =
        p.reload > s.time
          ? "RELOADING…"
          : p.shield > s.time
            ? "SPAWN PROTECTION"
            : "";
      $("announcement").textContent =
        p.hp <= 0
          ? "RESPAWN IN " + Math.max(0, Math.ceil(p.respawn - s.time))
          : "";
      if (p.hp < this.previousHP) {
        $("damageOverlay").style.opacity = 0.65;
        setTimeout(() => ($("damageOverlay").style.opacity = 0), 160);
      }
      this.previousHP = p.hp;
      this.guns(p);
    }
    const sec = Math.ceil(s.remaining);
    $("timer").textContent = `${Math.floor(sec / 60)
      .toString()
      .padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
    $("matchGoal").textContent = "FIRST TO " + s.goal;
    if (this.view === "scoreboard") $("scoreTable").innerHTML = this.table(s);
  }
  guns(p) {
    const key = JSON.stringify(p.weapons);
    if (key === this.gunKey) return;
    this.gunKey = key;
    $("gunItems").innerHTML = Object.entries(WEAPONS)
      .map(([id, w]) => {
        const owned = Object.values(p.weapons).includes(id);
        return `<button data-equip="${id}" class="${owned ? "owned" : ""}"><b>${w.name}</b><small>${w.role}</small><small>${w.damage} DMG · ${w.mag} ROUNDS${owned ? " · EQUIPPED" : ""}</small></button>`;
      })
      .join("");
  }
  event(e) {
    if (e.t === "notice") this.toast(e.message);
    if (e.t === "shot" && e.id === this.self && e.hit) {
      $("hitmarker").style.color = e.head ? "#ff7777" : "white";
      $("hitmarker").style.opacity = 1;
      clearTimeout(this.hitTimer);
      this.hitTimer = setTimeout(() => ($("hitmarker").style.opacity = 0), 120);
    }
    if (e.t === "kill") {
      const killer = this.state?.players.find((p) => p.id === e.killer),
        victim = this.state?.players.find((p) => p.id === e.victim),
        row = document.createElement("div");
      row.className = "kill";
      row.textContent = `${killer?.name || "Environment"} ▸ ${victim?.name || "Player"}${e.head ? " · HEAD" : ""}`;
      $("killfeed").prepend(row);
      while ($("killfeed").children.length > 4)
        $("killfeed").lastChild.remove();
      setTimeout(() => row.remove(), 5000);
    }
  }
}
