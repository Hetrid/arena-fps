import { ranking } from "./game.js";
import { C } from "./config.js";
import { WEAPONS, AGENTS, SHOP, MODES, isTactical } from "./catalog.js";
import { MAPS } from "./maps.js";
import { visible } from "./world.js";
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
    this.toastTimer = null;
    this.lobbyKey = "";
    this.shopKey = "";
    this.drawTime = 0;
    $("agentSelect").innerHTML = Object.entries(AGENTS)
      .map(([id, a]) => `<option value="${id}">${a.name} · ${a.title}</option>`)
      .join("");
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
      "shop",
    ])
      $(id).hidden = id !== view;
    this.view = view;
    const inGame = ["game", "pause", "scoreboard", "shop"].includes(view);
    $("hud").hidden = !inGame;
    document.body.classList.toggle("playing", inGame);
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
      "<table><thead><tr><th>PLAYER / AGENT</th><th>K</th><th>D</th><th>CREDS</th><th>PING</th></tr></thead><tbody>" +
      ranking(s.players)
        .map(
          (p) =>
            `<tr class="${p.id === this.self ? "self" : ""}"><td><span style="color:${p.team === "A" ? "#79d9ed" : "#faaf81"}">${escape(p.name)}</span> · ${AGENTS[p.agent]?.name || ""}${p.id === this.self ? " (you)" : ""}</td><td>${p.kills}</td><td>${p.deaths}</td><td>${p.credits}</td><td>${p.connected ? p.ping + " ms" : "RECONNECT"}</td></tr>`,
        )
        .join("") +
      "</tbody></table>"
    );
  }
  update(s, net) {
    this.state = s;
    this.self = net.self;
    this.host = net.host;
    const p = s.players.find((p) => p.id === net.self);
    if (s.phase === "lobby") {
      if (this.view !== "lobby") this.show("lobby");
      $("roomType").textContent = net.public
        ? "PUBLIC ROOM"
        : net.self === "practice"
          ? "SOLO PRACTICE"
          : "PRIVATE ROOM";
      $("roomCode").textContent = net.public
        ? "TACTICAL LOBBY"
        : net.self === "practice"
          ? "TRAINING"
          : net.room;
      $("copy").hidden = net.public || net.self === "practice";
      $("lobbyCount").textContent = `${s.players.length} / ${C.maxPlayers}`;
      $("hostOptions").hidden = !net.host;
      $("modeSelect").value = s.mode;
      $("goalSelect").value = s.goal;
      const splitKey = s.players.length + "|" + s.targetA;
      if (this.splitKey !== splitKey) {
        const n = s.players.length;
        $("splitSelect").innerHTML =
          '<option value="auto">Balanced / auto-fill</option>' +
          Array.from(
            { length: Math.max(0, n - 1) },
            (_, i) =>
              `<option value="${i + 1}">${i + 1} vs ${n - i - 1}</option>`,
          ).join("");
        this.splitKey = splitKey;
      }
      $("splitSelect").value = s.targetA ?? "auto";
      const key = JSON.stringify([
        s.players.map((p) => [p.id, p.name, p.team, p.agent, p.connected]),
        s.votes,
        s.map,
        net.host,
      ]);
      if (key !== this.lobbyKey) {
        this.lobbyKey = key;
        $("lobbyPlayers").innerHTML = s.players
          .map(
            (p) =>
              `<div class="playerRow"><span style="color:${p.team === "A" ? "#79d9ed" : "#faaf81"}">${escape(p.name)} ${p.index === 0 ? "★" : ""}<br><small>${AGENTS[p.agent]?.name || ""}</small></span>${net.host && s.mode !== "ffa" ? `<select data-team="${escape(p.id)}"><option value="A" ${p.team === "A" ? "selected" : ""}>Team A</option><option value="B" ${p.team === "B" ? "selected" : ""}>Team B</option></select>` : `<small>${s.mode === "ffa" ? "FFA" : "TEAM " + p.team}</small>`}<small>${p.connected ? "CONNECTED" : "RECONNECTING"}</small></div>`,
          )
          .join("");
        $("mapVote").innerHTML = Object.values(MAPS)
          .map(
            (m) =>
              `<button data-map="${m.id}" class="${s.votes[net.self] === m.id ? "selected" : ""}">${m.name}<small>${m.tag}</small><small>${Object.values(s.votes).filter((x) => x === m.id).length} votes · ${m.width} × ${m.depth} m</small></button>`,
          )
          .join("");
      }
      if (p) {
        $("agentSelect").value = p.agent;
        $("agentDescription").textContent =
          AGENTS[p.agent].ability + " — " + AGENTS[p.agent].description;
      }
      $("start").hidden = !net.host;
      const a = s.players.filter((p) => p.team === "A").length,
        b = s.players.length - a;
      $("lobbyNote").textContent = net.host
        ? s.mode === "ffa"
          ? "Start alone or wait for friends."
          : `${a} vs ${b}. Assign teams or choose a split. Map with most votes wins.`
        : "Choose your agent and vote for a map. Waiting for the host.";
      $("modeSummary").textContent =
        MODES[s.mode] +
        (isTactical(s.mode)
          ? ` · First to ${s.goal} rounds · 25s buy · ${s.mode === "sabotage" ? "Team A attacks first. Any attacker may plant." : "No respawns until next round."}`
          : " · Respawns enabled · free equipment");
    }
    if (s.phase === "results") {
      if (this.view !== "results") this.show("results");
      const winner = s.players.find((p) => p.id === s.winner);
      $("winner").textContent =
        s.winner === "DRAW"
          ? "Match drawn"
          : winner
            ? winner.name + " wins"
            : "Team " + s.winner + " wins";
      $("resultTable").innerHTML = this.table(s);
      $("rematchInfo").textContent =
        `${s.players.filter((p) => p.ready && p.connected).length} / ${s.players.filter((p) => p.connected).length} ready. All connected players must ready up.`;
      $("rematch").textContent = p?.ready
        ? "Cancel Rematch Ready"
        : "Ready for Rematch";
    }
    if (p) {
      $("health").textContent = Math.ceil(p.hp);
      $("armor").textContent = Math.ceil(p.armor || 0);
      $("healthBar").style.width =
        Math.max(0, p.hp) *
          (document.body.classList.contains("touchDevice") ? 0.75 : 1.2) +
        "px";
      $("ammo").textContent = p.ammo;
      $("reserve").textContent = "/ " + p.reserve;
      $("score").textContent = p.kills;
      $("ping").textContent = net.reconnecting ? "RESTORING" : p.ping + " ms";
      $("weaponName").textContent = WEAPONS[p.weapon]?.name || "";
      $("creditsHud").textContent = p.credits + " credits";
      $("reloadText").textContent =
        p.reload > s.time
          ? "RELOADING…"
          : p.shield > s.time
            ? "SPAWN PROTECTION"
            : "";
      const agent = AGENTS[p.agent];
      $("abilityHud").textContent = agent
        ? `${agent.name} · ${agent.ability} [E] × ${p.charges}`
        : "";
      for (const id of ["flash", "smoke", "frag"])
        $(id).textContent = id.toUpperCase() + " " + p.grenades[id];
      $("ability").textContent =
        (agent?.name.slice(0, 3) || "E") + " " + p.charges;
      let message = "";
      if (s.phase === "roundend")
        message =
          (s.roundWinner ? "TEAM " + s.roundWinner + " WINS" : "ROUND DRAWN") +
          " · " +
          s.roundReason;
      else if (p.hp <= 0)
        message = isTactical(s.mode)
          ? "ELIMINATED · SPECTATING TEAM"
          : "RESPAWN IN " + Math.max(0, Math.ceil(p.respawn - s.time));
      else if (s.phase === "buy") message = "BUY PHASE · B TO OPEN ARMORY";
      $("announcement").textContent = message;
      if (p.hp < this.previousHP) {
        $("damageOverlay").style.opacity = 0.6;
        setTimeout(() => ($("damageOverlay").style.opacity = 0), 150);
      }
      this.previousHP = p.hp;
      const progress = p.plantProgress
        ? Math.min(1, p.plantProgress / C.plantSeconds)
        : p.defuseProgress
          ? Math.min(1, p.defuseProgress / C.defuseSeconds)
          : 0;
      $("interactProgress").hidden = !progress;
      $("interactProgress").firstElementChild.style.width =
        progress * 100 + "%";
      let hint = "";
      if (s.mode === "sabotage" && s.phase === "playing" && p.hp > 0) {
        if (
          s.bomb &&
          p.team !== s.attack &&
          Math.hypot(s.bomb.x - p.x, s.bomb.z - p.z) < 3
        )
          hint = "HOLD F / USE TO DEFUSE";
        else if (
          !s.bomb &&
          p.team === s.attack &&
          MAPS[s.map].sites.some((x) => Math.hypot(x.x - p.x, x.z - p.z) < x.r)
        )
          hint = "HOLD F / USE TO PLANT";
        else if (s.bomb) hint = "RELAY ACTIVE · SITE " + s.bomb.site;
      }
      $("interactHint").textContent = hint;
      this.shop(s, p);
      this.minimap(s, p);
    }
    $("phaseLabel").textContent = s.bomb
      ? "RELAY ACTIVE"
      : s.phase === "buy"
        ? `BUY · ROUND ${s.roundNumber}`
        : isTactical(s.mode)
          ? `ROUND ${s.roundNumber} · ${s.attack} ATTACKS`
          : MODES[s.mode];
    $("teamScores").hidden = s.mode === "ffa";
    $("teamA").textContent = s.scores.A;
    $("teamB").textContent = s.scores.B;
    const sec = Math.ceil(s.remaining);
    $("timer").textContent = `${Math.floor(sec / 60)
      .toString()
      .padStart(2, "0")}:${(sec % 60).toString().padStart(2, "0")}`;
    if (this.view === "scoreboard") $("scoreTable").innerHTML = this.table(s);
  }
  shop(s, p) {
    const key = JSON.stringify([
      p.credits,
      p.weapons,
      p.armor,
      p.grenades,
      s.phase,
      s.mode,
    ]);
    $("shopCredits").textContent = isTactical(s.mode)
      ? p.credits + " CR"
      : "FREE LOADOUT";
    $("shopNote").textContent = isTactical(s.mode)
      ? "Buy only during the buy phase. Equipment survives a round if you stay alive."
      : "Practice / deathmatch: equipment is free.";
    if (key === this.shopKey) return;
    this.shopKey = key;
    const canBuy =
      s.phase === "buy" || (!isTactical(s.mode) && s.phase === "playing");
    $("shopItems").innerHTML = SHOP.map((item) => {
      const owned =
        WEAPONS[item.id] && Object.values(p.weapons).includes(item.id);
      const max = itemsMax(item.id, p);
      const disabled =
        !canBuy ||
        owned ||
        max ||
        (isTactical(s.mode) && p.credits < item.cost);
      return `<button data-buy="${item.id}" class="${owned ? "owned" : ""}" ${disabled ? "disabled" : ""}><b>${item.name}</b><small>${item.description}</small><small>${owned ? "EQUIPPED" : isTactical(s.mode) ? item.cost + " CR" : "FREE"}</small></button>`;
    }).join("");
  }
  minimap(s, p) {
    const canvas = $("minimap"),
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    const m = MAPS[s.map],
      sx = 160 / m.width,
      sz = 140 / m.depth,
      point = (x, z) => [(x + m.width / 2) * sx, (z + m.depth / 2) * sz];
    ctx.fillStyle = "#112231";
    ctx.fillRect(0, 0, 160, 140);
    ctx.fillStyle = "#546671";
    for (const b of m.boxes)
      ctx.fillRect(
        (b[0] - b[3] / 2 + m.width / 2) * sx,
        (b[2] - b[5] / 2 + m.depth / 2) * sz,
        b[3] * sx,
        b[5] * sz,
      );
    for (const site of m.sites) {
      const [x, z] = point(site.x, site.z);
      ctx.strokeStyle = site.name === "A" ? "#79d9ed" : "#faaf81";
      ctx.beginPath();
      ctx.arc(x, z, site.r * sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.font = "10px sans-serif";
      ctx.fillText(site.name, x - 3, z + 3);
    }
    for (const e of s.players) {
      if (e.hp <= 0 || !e.connected) continue;
      const friend = s.mode !== "ffa" && e.team === p.team,
        recon = s.effects.some(
          (f) =>
            f.kind === "reveal" &&
            (s.mode === "ffa" ? f.owner === p.id : f.team === p.team) &&
            Math.hypot(f.x - e.x, f.z - e.z) < f.radius,
        );
      if (
        e.id !== p.id &&
        !friend &&
        ((!recon && !visible([p.x, p.y + C.eye, p.z], [e.x, e.y + 1, e.z])) ||
          p.flashUntil > s.time)
      )
        continue;
      const [x, z] = point(e.x, e.z);
      ctx.fillStyle =
        e.id === p.id ? "#b9f36b" : friend ? "#79d9ed" : "#fb9280";
      ctx.beginPath();
      ctx.arc(x, z, e.id === p.id ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
      if (e.id === p.id) {
        ctx.strokeStyle = "#b9f36b";
        ctx.beginPath();
        ctx.moveTo(x, z);
        ctx.lineTo(x - Math.sin(p.yaw) * 7, z - Math.cos(p.yaw) * 7);
        ctx.stroke();
      }
    }
  }
  frame(time) {
    const p = this.state?.players.find((p) => p.id === this.self);
    if (!p) {
      $("flashOverlay").style.opacity = 0;
      return;
    }
    const remaining = p.flashUntil - time,
      alpha =
        remaining > 0
          ? Math.min(1, (remaining / Math.max(0.3, p.flashDuration)) * 1.7)
          : 0;
    $("flashOverlay").style.opacity = alpha;
  }
  event(e) {
    if (e.t === "notice") {
      this.toast(e.message);
      return;
    }
    if (e.t === "shot" && e.id === this.self && e.hit) {
      $("hitmarker").style.color = e.killed ? "#b9f36b" : "white";
      $("hitmarker").style.opacity = 1;
      setTimeout(() => ($("hitmarker").style.opacity = 0), 120);
    }
    if (e.t === "kill") {
      const killer = this.state?.players.find((p) => p.id === e.killer),
        victim = this.state?.players.find((p) => p.id === e.victim),
        row = document.createElement("div");
      row.className = "kill";
      row.textContent = `${killer?.name || "Environment"} ▸ ${victim?.name || "Player"}${e.head ? " · HEAD" : ""}`;
      $("killfeed").prepend(row);
      while ($("killfeed").children.length > 5)
        $("killfeed").lastChild.remove();
      setTimeout(() => row.remove(), 5500);
    }
  }
}
const itemsMax = (id, p) =>
  id === "lightArmor"
    ? p.armor >= 25
    : id === "heavyArmor"
      ? p.armor >= 50
      : ["flash", "smoke", "frag"].includes(id)
        ? p.grenades[id] >= 2
        : false;
