import { C, clamp } from "./config.js";
import { WEAPONS, AGENTS, isTactical } from "./catalog.js";
import { MAPS } from "./maps.js";
import { makePlayer, move, idleInput, validInput } from "./player.js";
import {
  CURRENT,
  COLLIDERS,
  bounds,
  setMap,
  setEffects,
  visible,
  direction,
  wallDistance,
  rayBox,
} from "./world.js";
export function ranking(players) {
  return [...players].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.index - b.index,
  );
}
const items = ["flash", "smoke", "frag"];
export class HostGame {
  constructor(event = () => {}) {
    this.players = new Map();
    this.inputs = new Map();
    this.history = [];
    this.time = 0;
    this.phase = "lobby";
    this.round = 0;
    this.roundNumber = 0;
    this.end = 0;
    this.event = event;
    this.serial = 0;
    this.index = 0;
    this.winner = null;
    this.map = "relay";
    this.mode = "sabotage";
    this.targetA = null;
    this.manualTeams = false;
    this.scores = { A: 0, B: 0 };
    this.losses = { A: 0, B: 0 };
    this.attack = "A";
    this.votes = {};
    this.effects = [];
    this.projectiles = [];
    this.effectSerial = 0;
    this.bomb = null;
    this.roundWinner = null;
    this.roundReason = "";
    this.started = false;
    this.goal = C.roundWins;
    this.buyLength = C.buySeconds;
    this.roundStart = 0;
  }
  world() {
    if (CURRENT.id !== this.map) setMap(this.map);
    setEffects(this.effects);
  }
  equipDefaults(p) {
    p.weapons = { primary: null, secondary: "sidekick" };
    p.magazines = { sidekick: { ammo: 12, reserve: 72 } };
    p.weapon = "sidekick";
    p.armor = 0;
  }
  add(id, name) {
    if (this.players.size >= C.maxPlayers) return null;
    const p = makePlayer(
      id,
      String(name || "Player")
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 18),
      this.index++,
    );
    Object.assign(p, {
      team: "A",
      agent: "vapor",
      credits: 800,
      charges: 2,
      grenades: { flash: 1, smoke: 1, frag: 0 },
      connected: true,
      flashUntil: 0,
      burstRemaining: 0,
      wasFire: false,
      flashDuration: 0,
      slow: 1,
      abilityCooldown: 0,
      dashing: false,
      revealUntil: 0,
    });
    this.equipDefaults(p);
    this.players.set(id, p);
    this.inputs.set(id, { queue: [], last: idleInput(p), seen: this.time });
    if (this.phase === "lobby") this.fillTeams();
    else {
      const a = [...this.players.values()].filter(
          (e) => e.id !== id && e.team === "A",
        ).length,
        b = [...this.players.values()].filter(
          (e) => e.id !== id && e.team === "B",
        ).length;
      p.team =
        this.targetA !== null
          ? a < this.targetA
            ? "A"
            : "B"
          : a > b
            ? "B"
            : "A";
    }
    this.spawn(p);
    if (isTactical(this.mode) && this.phase !== "lobby") {
      p.hp = 0;
      p.respawn = Infinity;
    }
    return p;
  }
  remove(id) {
    this.players.delete(id);
    this.inputs.delete(id);
    delete this.votes[id];
    if (this.phase === "lobby") this.fillTeams();
    if (this.phase === "results") this.checkRematch();
  }
  fillTeams() {
    if (this.manualTeams) return;
    const ps = [...this.players.values()].sort((a, b) => a.index - b.index),
      n = ps.length,
      goal = n < 2 ? 1 : clamp(this.targetA ?? Math.ceil(n / 2), 1, n - 1);
    ps.forEach((p, i) => (p.team = i < goal ? "A" : "B"));
  }
  configure(opts) {
    if (this.phase !== "lobby") return false;
    if (
      opts.mode &&
      ["sabotage", "elimination", "tdm", "ffa"].includes(opts.mode)
    )
      this.mode = opts.mode;
    if (opts.map && MAPS[opts.map]) {
      this.map = opts.map;
      this.effects = [];
      this.world();
      for (const p of this.players.values()) this.spawn(p);
    }
    if (opts.targetA !== undefined) {
      this.targetA =
        opts.targetA === "auto" ? null : clamp(Number(opts.targetA) || 1, 1, 9);
      this.manualTeams = false;
      this.fillTeams();
    }
    if (opts.goal !== undefined)
      this.goal = clamp(Math.round(Number(opts.goal) || 5), 3, 9);
    if (opts.buyLength !== undefined)
      this.buyLength = clamp(Math.round(Number(opts.buyLength) || 25), 5, 45);
    return true;
  }
  assign(id, team) {
    if (
      this.phase !== "lobby" ||
      !["A", "B"].includes(team) ||
      !this.players.has(id)
    )
      return false;
    this.players.get(id).team = team;
    this.manualTeams = true;
    return true;
  }
  selectAgent(id, agent) {
    if (!AGENTS[agent] || !["lobby", "buy"].includes(this.phase)) return false;
    const p = this.players.get(id);
    if (!p) return false;
    p.agent = agent;
    p.charges = AGENTS[agent].charges;
    return true;
  }
  vote(id, map) {
    if (this.phase !== "lobby" || !this.players.has(id) || !MAPS[map])
      return false;
    this.votes[id] = map;
    return true;
  }
  chooseMap() {
    const votes = Object.keys(MAPS).map((id) => ({
      id,
      n: Object.values(this.votes).filter((v) => v === id).length,
    }));
    votes.sort(
      (a, b) =>
        b.n - a.n || (a.id === this.map ? -1 : b.id === this.map ? 1 : 0),
    );
    if (votes[0].n) this.map = votes[0].id;
  }
  spawn(p) {
    this.world();
    const map = MAPS[this.map],
      spawns =
        this.mode === "ffa"
          ? [...map.spawns.A, ...map.spawns.B]
          : map.spawns[p.team];
    let best = spawns[0],
      score = -Infinity;
    for (const s of spawns) {
      let value = 150;
      for (const e of this.players.values()) {
        if (e.id === p.id || e.hp <= 0 || !e.connected) continue;
        if (this.mode !== "ffa" && e.team === p.team) {
          if (Math.hypot(e.x - s[0], e.z - s[1]) < 1.5) value -= 200;
          continue;
        }
        value = Math.min(
          value,
          Math.hypot(e.x - s[0], e.z - s[1]) -
            (visible([s[0], C.eye, s[1]], [e.x, e.y + 1.1, e.z]) ? 25 : 0),
        );
      }
      value += Math.random();
      if (value > score) {
        score = value;
        best = s;
      }
    }
    Object.assign(p, {
      x: best[0],
      y: 0,
      z: best[1],
      vx: 0,
      vy: 0,
      vz: 0,
      hp: 100,
      reload: 0,
      respawn: 0,
      shield: this.time + (isTactical(this.mode) ? 0 : C.spawnProtection),
      grounded: true,
      epoch: p.epoch + 1,
      crouch: false,
      ads: false,
      flashUntil: 0,
      burstRemaining: 0,
      wasFire: false,
      slow: 1,
      dashing: false,
      yaw: Math.atan2(best[0], best[1]),
      pitch: 0,
    });
    this.syncAmmo(p);
  }
  syncAmmo(p) {
    const m = p.magazines[p.weapon];
    p.ammo = m?.ammo || 0;
    p.reserve = m?.reserve || 0;
  }
  start() {
    if (!this.players.size) return false;
    this.fillTeams();
    if (
      this.mode !== "ffa" &&
      (![...this.players.values()].some((p) => p.team === "A" && p.connected) ||
        ![...this.players.values()].some((p) => p.team === "B" && p.connected))
    ) {
      this.event({
        t: "notice",
        message: "Both teams need at least one connected player.",
      });
      return false;
    }
    this.chooseMap();
    this.started = true;
    this.winner = null;
    this.roundNumber = 0;
    this.scores = { A: 0, B: 0 };
    this.losses = { A: 0, B: 0 };
    this.attack = "A";
    for (const p of this.players.values()) {
      p.kills = 0;
      p.deaths = 0;
      p.ready = false;
      p.credits = isTactical(this.mode) ? 800 : 9000;
      this.equipDefaults(p);
      p.grenades = { flash: 1, smoke: 1, frag: 0 };
    }
    if (isTactical(this.mode)) this.beginBuy();
    else {
      this.round++;
      this.roundNumber = 1;
      this.phase = "playing";
      this.end = this.time + C.matchSeconds;
      this.effects = [];
      this.projectiles = [];
      this.history = [];
      for (const p of this.players.values()) {
        p.weapons.primary = "specter";
        p.magazines.specter = { ammo: 30, reserve: 120 };
        p.weapon = "specter";
        this.spawn(p);
        p.charges = AGENTS[p.agent].charges;
      }
      this.event({ t: "start", round: this.round });
    }
    return true;
  }
  beginBuy() {
    this.round++;
    this.roundNumber++;
    if (this.roundNumber === 5) this.attack = this.attack === "A" ? "B" : "A";
    this.phase = "buy";
    this.end = this.time + this.buyLength;
    this.effects = [];
    this.projectiles = [];
    this.bomb = null;
    this.history = [];
    this.roundWinner = null;
    for (const p of this.players.values()) {
      const alive = p.hp > 0;
      if (!alive) {
        this.equipDefaults(p);
        p.grenades = { flash: 0, smoke: 0, frag: 0 };
      }
      for (const [id, w] of Object.entries(p.magazines)) {
        w.ammo = WEAPONS[id].mag;
        w.reserve = WEAPONS[id].reserve;
      }
      p.charges = AGENTS[p.agent].charges;
      p.abilityCooldown = 0;
      p.nextShot = this.time;
      p.plantProgress = 0;
      p.defuseProgress = 0;
      this.spawn(p);
      if (!p.connected) p.hp = 0;
      const q = this.inputs.get(p.id);
      q.queue = [];
      q.last = idleInput(p);
      q.seen = this.time;
    }
    this.event({ t: "round", number: this.roundNumber, map: this.map });
  }
  ready(id) {
    const p = this.players.get(id);
    if (p && this.phase === "results") {
      p.ready = !p.ready;
      this.checkRematch();
    }
  }
  checkRematch() {
    const online = [...this.players.values()].filter((p) => p.connected);
    if (online.length && online.every((p) => p.ready)) this.start();
  }
  buy(id, item) {
    const p = this.players.get(id),
      free = !isTactical(this.mode);
    if (
      !p ||
      !p.connected ||
      (!free && this.phase !== "buy") ||
      !["buy", "playing"].includes(this.phase)
    )
      return false;
    let cost = 0;
    if (WEAPONS[item]) cost = WEAPONS[item].cost;
    else
      cost = {
        lightArmor: 400,
        heavyArmor: 1000,
        flash: 250,
        smoke: 200,
        frag: 350,
      }[item];
    if (cost === undefined || (!free && p.credits < cost)) return false;
    if (WEAPONS[item]) {
      const slot =
        WEAPONS[item].slot ||
        (WEAPONS[item].shape === "pistol" ? "secondary" : "primary");
      if (p.weapons[slot] === item) return false;
      const old = p.weapons[slot];
      if (old) delete p.magazines[old];
      p.weapons[slot] = item;
      p.magazines[item] = {
        ammo: WEAPONS[item].mag,
        reserve: WEAPONS[item].reserve,
      };
      this.switchWeapon(p, item);
    } else if (item === "lightArmor" || item === "heavyArmor") {
      const amount = item === "lightArmor" ? 25 : 50;
      if (p.armor >= amount) return false;
      p.armor = amount;
    } else {
      if (p.grenades[item] >= 2) return false;
      p.grenades[item]++;
    }
    if (!free) p.credits -= cost;
    this.syncAmmo(p);
    return true;
  }
  switchWeapon(p, slot) {
    const id =
      slot === "primary" || slot === "secondary" ? p.weapons[slot] : slot;
    if (!id || !Object.values(p.weapons).includes(id) || !p.magazines[id])
      return;
    p.weapon = id;
    p.reload = 0;
    p.burstRemaining = 0;
    p.nextShot = Math.max(p.nextShot, this.time + 0.2);
    this.syncAmmo(p);
  }
  receive(id, batch, round = this.round) {
    const q = this.inputs.get(id),
      p = this.players.get(id);
    if (!q || !p.connected || !Array.isArray(batch) || round !== this.round)
      return;
    for (const i of batch.slice(-12)) {
      if (
        !validInput(i) ||
        i.seq <= p.ack ||
        i.seq > p.ack + 180 ||
        q.queue.some((x) => x.seq === i.seq)
      )
        continue;
      q.queue.push({
        ...i,
        jump: !!i.jump,
        fire: !!i.fire,
        reload: !!i.reload,
        sprint: !!i.sprint,
        crouch: !!i.crouch,
        ads: !!i.ads,
        ability: !!i.ability,
        interact: !!i.interact,
        throw: items.includes(i.throw) ? i.throw : null,
        slot: ["primary", "secondary"].includes(i.slot) ? i.slot : null,
      });
    }
    q.queue.sort((a, b) => a.seq - b.seq);
    q.queue = q.queue.slice(0, 12);
    q.seen = this.time;
  }
  nextInput(p) {
    const q = this.inputs.get(p.id),
      i = q.queue.shift();
    if (i) {
      p.ack = i.seq;
      q.last = i;
      return i;
    }
    return {
      ...q.last,
      jump: false,
      reload: false,
      ability: false,
      throw: null,
      slot: null,
      ...(this.time - q.seen > C.inputTimeout
        ? { mx: 0, mz: 0, fire: false, interact: false }
        : {}),
    };
  }
  tick(dt = C.tick) {
    this.time += dt;
    this.world();
    if (this.phase === "roundend") {
      if (this.time >= this.end) this.beginBuy();
      return;
    }
    if (!["playing", "buy"].includes(this.phase)) return;
    if (
      this.mode !== "ffa" &&
      [...this.players.values()].filter((p) => p.connected).length > 0 &&
      !["A", "B"].every((t) =>
        [...this.players.values()].some((p) => p.team === t),
      )
    ) {
      this.phase = "lobby";
      this.started = false;
      this.effects = [];
      this.projectiles = [];
      this.event({
        t: "notice",
        message: "A team is empty. Rebalance teams in the lobby.",
      });
      return;
    }
    if (this.phase === "buy" && this.time >= this.end) {
      this.phase = "playing";
      this.end = this.time + C.roundSeconds;
      this.roundStart = this.time;
      this.event({ t: "live", number: this.roundNumber });
    }
    for (const p of this.players.values()) {
      const input = this.nextInput(p);
      if (!p.connected) continue;
      if (this.phase === "buy") {
        p.yaw = input.yaw;
        p.pitch = input.pitch;
        p.vx = p.vz = 0;
        if (input.slot) this.switchWeapon(p, input.slot);
        continue;
      }
      if (p.hp <= 0) {
        if (!isTactical(this.mode) && this.time >= p.respawn) {
          this.spawn(p);
          p.charges = AGENTS[p.agent].charges;
          p.grenades = { flash: 1, smoke: 1, frag: 1 };
        }
        continue;
      }
      p.slow = 1;
      for (const e of this.effects)
        if (e.kind === "slow" && Math.hypot(e.x - p.x, e.z - p.z) < e.radius)
          p.slow = 0.5;
      p.dashing = p.dashUntil > this.time;
      move(p, input, dt);
      if (
        p.grounded &&
        Math.hypot(p.vx, p.vz) > 1.5 &&
        this.time >= (p.stepAt || 0)
      ) {
        p.stepAt = this.time + (input.sprint ? 0.3 : 0.45);
        this.event({ t: "step", id: p.id, x: p.x, y: p.y, z: p.z });
      }
      if (input.slot) this.switchWeapon(p, input.slot);
      const w = WEAPONS[p.weapon],
        mag = p.magazines[p.weapon];
      if (p.reload && this.time >= p.reload) {
        const count = Math.min(w.mag - mag.ammo, mag.reserve);
        mag.ammo += count;
        mag.reserve -= count;
        p.reload = 0;
      }
      if (input.reload && !p.reload && mag.ammo < w.mag && mag.reserve > 0)
        p.reload = this.time + w.reload;
      if (
        (input.fire || p.burstRemaining > 0) &&
        !p.reload &&
        this.time + 1e-7 >= p.nextShot &&
        (p.burstRemaining > 0 || w.auto || !p.wasFire)
      ) {
        if (mag.ammo > 0) {
          if (!p.burstRemaining && w.burst && input.ads)
            p.burstRemaining = w.burst;
          this.shoot(p);
        } else {
          p.burstRemaining = 0;
          if (mag.reserve > 0) p.reload = this.time + w.reload;
        }
      }
      p.wasFire = input.fire;
      this.syncAmmo(p);
      if (
        input.throw &&
        p.grenades[input.throw] > 0 &&
        this.time >= (p.throwCooldown || 0)
      ) {
        p.grenades[input.throw]--;
        this.throwGrenade(p, input.throw);
        p.throwCooldown = this.time + 0.6;
      }
      if (input.ability) this.ability(p);
      this.objective(p, input, dt);
      if (this.phase !== "playing") break;
    }
    this.tickProjectiles(dt);
    this.tickEffects(dt);
    this.effects = this.effects.filter(
      (e) => e.expires > this.time && (e.hp === undefined || e.hp > 0),
    );
    this.world();
    this.history.push({
      time: this.time,
      players: [...this.players.values()].map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        z: p.z,
        hp: p.hp,
        epoch: p.epoch,
        crouch: p.crouch,
      })),
    });
    while (this.history.length && this.history[0].time < this.time - 0.3)
      this.history.shift();
    if (this.phase !== "playing") return;
    if (this.bomb && this.time >= (this.beepAt || 0)) {
      this.beepAt = this.time + (this.bomb.explode - this.time < 10 ? 0.4 : 1);
      this.event({ t: "beep", x: this.bomb.x, y: 0, z: this.bomb.z });
    }
    if (isTactical(this.mode)) {
      const alive = (t) =>
          [...this.players.values()].some(
            (p) => p.team === t && p.hp > 0 && p.connected,
          ),
        defense = this.attack === "A" ? "B" : "A";
      if (!alive(defense)) this.endRound(this.attack, "Opposition eliminated");
      else if (!alive(this.attack) && !this.bomb)
        this.endRound(defense, "Opposition eliminated");
      else if (this.bomb && this.time >= this.bomb.explode) {
        this.event({
          t: "explosion",
          x: this.bomb.x,
          y: 0,
          z: this.bomb.z,
          radius: 14,
        });
        this.endRound(this.attack, "Relay detonated");
      } else if (!this.bomb && this.time >= this.end) {
        if (this.mode === "sabotage") this.endRound(defense, "Time expired");
        else {
          const totals = ["A", "B"].map((t) =>
            [...this.players.values()]
              .filter((p) => p.team === t && p.hp > 0)
              .reduce((s, p) => s + p.hp + p.armor, 0),
          );
          this.endRound(
            totals[0] === totals[1] ? null : totals[0] > totals[1] ? "A" : "B",
            "Time expired · remaining health",
          );
        }
      }
    } else if (
      this.time >= this.end ||
      (this.mode === "ffa"
        ? [...this.players.values()].some((p) => p.kills >= C.winKills)
        : Math.max(this.scores.A, this.scores.B) >= 40)
    ) {
      this.phase = "results";
      this.winner =
        this.mode === "ffa"
          ? ranking(this.players.values())[0]?.id
          : this.scores.A === this.scores.B
            ? "DRAW"
            : this.scores.A > this.scores.B
              ? "A"
              : "B";
      this.event({ t: "finish", winner: this.winner });
    }
  }
  endRound(team, reason) {
    if (!["playing", "buy"].includes(this.phase)) return;
    this.roundWinner = team;
    this.roundReason = reason;
    if (team) this.scores[team]++;
    for (const p of this.players.values()) {
      if (team && p.team === team) {
        p.credits = Math.min(9000, p.credits + 3000);
      } else
        p.credits = Math.min(
          9000,
          p.credits + 1800 + Math.min(this.losses[p.team], 2) * 500,
        );
      p.plantProgress = p.defuseProgress = 0;
    }
    for (const t of ["A", "B"])
      this.losses[t] = team === t ? 0 : this.losses[t] + 1;
    this.phase =
      team && this.scores[team] >= this.goal ? "results" : "roundend";
    this.end = this.time + 5;
    if (this.phase === "results") this.winner = team;
    this.event({ t: "roundResult", team, reason, scores: this.scores });
  }
  objective(p, i, dt) {
    p.plantProgress = p.plantProgress || 0;
    p.defuseProgress = p.defuseProgress || 0;
    if (this.mode !== "sabotage" || p.hp <= 0) return;
    if (!i.interact) {
      p.plantProgress = p.defuseProgress = 0;
      return;
    }
    if (!this.bomb && p.team === this.attack) {
      const site = MAPS[this.map].sites.find(
        (s) => Math.hypot(s.x - p.x, s.z - p.z) < s.r,
      );
      if (site && Math.hypot(p.vx, p.vz) < 0.5) {
        p.plantProgress += dt;
        if (p.plantProgress >= C.plantSeconds) {
          this.bomb = {
            x: p.x,
            z: p.z,
            site: site.name,
            explode: this.time + C.bombSeconds,
            planter: p.id,
          };
          p.credits = Math.min(9000, p.credits + 300);
          p.plantProgress = 0;
          this.event({ t: "plant", site: site.name });
        }
      } else p.plantProgress = 0;
    } else if (this.bomb && p.team !== this.attack) {
      if (
        Math.hypot(this.bomb.x - p.x, this.bomb.z - p.z) < 3 &&
        Math.hypot(p.vx, p.vz) < 0.5
      ) {
        p.defuseProgress += dt;
        if (p.defuseProgress >= C.defuseSeconds) {
          this.event({ t: "defuse" });
          this.endRound(p.team, "Relay defused");
        }
      } else p.defuseProgress = 0;
    }
  }
  damage(attacker, victim, amount, head = false, friendly = false) {
    if (victim.hp <= 0 || victim.shield > this.time) return false;
    if (
      attacker &&
      this.mode !== "ffa" &&
      attacker.team === victim.team &&
      attacker.id !== victim.id &&
      !friendly
    )
      return false;
    const absorb = Math.min(victim.armor || 0, amount * 0.66);
    victim.armor = Math.max(0, (victim.armor || 0) - absorb);
    victim.hp = Math.max(0, victim.hp - Math.ceil(amount - absorb));
    if (victim.hp > 0) return false;
    victim.deaths++;
    victim.reload = 0;
    victim.respawn = this.time + C.respawnSeconds;
    if (
      attacker &&
      attacker.id !== victim.id &&
      (this.mode === "ffa" || attacker.team !== victim.team)
    ) {
      attacker.kills++;
      attacker.credits = Math.min(9000, attacker.credits + 200);
      if (this.mode === "tdm") this.scores[attacker.team]++;
    }
    this.event({ t: "kill", killer: attacker?.id, victim: victim.id, head });
    return true;
  }
  shoot(p) {
    const w = WEAPONS[p.weapon],
      mag = p.magazines[p.weapon];
    if (!w || mag.ammo <= 0) return;
    mag.ammo--;
    if (p.burstRemaining > 0) {
      p.burstRemaining--;
      p.nextShot =
        this.time + (p.burstRemaining > 0 ? 1 / w.burstRate : w.burstDelay);
    } else p.nextShot = this.time + 1 / w.rate;
    p.shield = 0;
    const eye = p.crouch ? 1.05 : C.eye,
      o = [p.x, p.y + eye, p.z];
    const rewind = this.time - clamp(p.ping / 2000, 0, C.maxRewind);
    let frame = this.history[0];
    for (const f of this.history) {
      if (f.time <= rewind) frame = f;
      else break;
    }
    const pellets = w.pellets || 1;
    let anyHit = null,
      anyHead = false,
      killed = false;
    const rays = [];
    const moving = Math.hypot(p.vx, p.vz) > 1.3,
      spread =
        w.spread *
        (p.ads ? 0.4 : 1) *
        (moving ? 3.5 : 1) *
        (p.crouch ? 0.65 : 1);
    for (let shot = 0; shot < pellets; shot++) {
      const yaw = p.yaw + (Math.random() - 0.5) * spread,
        pitch = p.pitch + (Math.random() - 0.5) * spread,
        d = direction(yaw, pitch);
      let distance = wallDistance(o, d, 190),
        victim = null,
        head = false,
        turret = null;
      for (const e of this.players.values()) {
        if (
          e.id === p.id ||
          e.hp <= 0 ||
          e.shield > this.time ||
          (this.mode !== "ffa" && e.team === p.team)
        )
          continue;
        const h =
            frame?.players.find(
              (x) => x.id === e.id && x.hp > 0 && x.epoch === e.epoch,
            ) || e,
          ch = h.crouch ? 1.2 : 1.85,
          headBase = h.crouch ? 0.9 : 1.45;
        const bd = rayBox(o, d, [
            h.x - 0.32,
            h.y,
            h.z - 0.28,
            h.x + 0.32,
            h.y + headBase,
            h.z + 0.28,
          ]),
          hd = rayBox(o, d, [
            h.x - 0.24,
            h.y + headBase,
            h.z - 0.24,
            h.x + 0.24,
            h.y + ch,
            h.z + 0.24,
          ]);
        if (Math.min(bd, hd) < distance) {
          distance = Math.min(bd, hd);
          victim = e;
          head = hd < bd;
        }
      }
      for (const e of this.effects) {
        if (
          e.kind !== "turret" ||
          (this.mode === "ffa" ? e.owner === p.id : e.team === p.team)
        )
          continue;
        const hit = rayBox(o, d, [
          e.x - 0.3,
          e.y,
          e.z - 0.3,
          e.x + 0.3,
          e.y + 0.7,
          e.z + 0.3,
        ]);
        if (hit < distance) {
          distance = hit;
          victim = null;
          turret = e;
        }
      }
      if (turret) turret.hp -= w.damage;
      if (victim) {
        const falloff =
          w.shape === "shotgun"
            ? clamp(1 - distance / 45, 0.2, 1)
            : w.shape === "smg"
              ? clamp(1 - distance / 120, 0.6, 1)
              : 1;
        killed =
          this.damage(
            p,
            victim,
            Math.round(w.damage * (head ? w.head : 1) * falloff),
            head,
          ) || killed;
        anyHit = victim.id;
        anyHead = anyHead || head;
      }
      if (shot < 3) rays.push(o.map((v, k) => v + d[k] * distance));
    }
    this.syncAmmo(p);
    this.event({
      t: "shot",
      id: p.id,
      weapon: p.weapon,
      o,
      end: rays[0],
      rays,
      hit: anyHit,
      head: anyHead,
      killed,
    });
  }
  throwGrenade(p, kind) {
    const d = direction(p.yaw, p.pitch),
      o = [p.x, p.y + (p.crouch ? 1 : C.eye), p.z];
    this.projectiles.push({
      id: ++this.effectSerial,
      owner: p.id,
      team: p.team,
      kind,
      x: o[0],
      y: o[1],
      z: o[2],
      vx: d[0] * 19,
      vy: d[1] * 19 + 5,
      vz: d[2] * 19,
      fuse: this.time + (kind === "flash" ? 1 : 1.5),
    });
    this.event({ t: "throw", id: p.id, kind });
  }
  ability(p) {
    if (p.charges <= 0 || p.abilityCooldown > this.time) return false;
    const agent = AGENTS[p.agent];
    if (!agent) return false;
    const d = direction(p.yaw, 0);
    const before = p.charges;
    p.charges--;
    p.abilityCooldown = this.time + 0.6;
    if (["smoke", "flash", "fire", "slow"].includes(agent.kind))
      this.throwGrenade(p, agent.kind);
    else if (agent.kind === "dash") {
      p.dashUntil = this.time + 0.24;
      p.dashDX = d[0] * 25;
      p.dashDZ = d[2] * 25;
    } else if (agent.kind === "heal") {
      for (const e of this.players.values())
        if (
          e.hp > 0 &&
          (e.id === p.id || (this.mode !== "ffa" && e.team === p.team)) &&
          Math.hypot(e.x - p.x, e.z - p.z) < 14 &&
          visible([p.x, p.y + C.eye, p.z], [e.x, e.y + 1, e.z])
        )
          e.hp = Math.min(100, e.hp + 50);
      this.effect("heal", p, p.x, p.y, p.z, 1.2, 14);
    } else if (agent.kind === "reveal")
      this.effect("reveal", p, p.x, p.y, p.z, 3, 35);
    else if (agent.kind === "teleport") {
      let length = Math.min(9, wallDistance([p.x, p.y + 0.7, p.z], d, 9) - 0.7);
      for (const e of this.players.values())
        if (e.id !== p.id && e.hp > 0)
          length = Math.min(
            length,
            Math.max(0, Math.hypot(e.x - p.x, e.z - p.z) - 1),
          );
      if (length < 1) {
        p.charges = before;
        return false;
      }
      this.effect("shift", p, p.x, p.y, p.z, 0.7, 1);
      p.x += d[0] * length;
      p.z += d[2] * length;
      p.vx = p.vz = 0;
      p.epoch++;
      this.effect("shift", p, p.x, p.y, p.z, 0.7, 1);
    } else {
      const length = Math.min(4, wallDistance([p.x, p.y + 1, p.z], d, 4) - 1);
      const x = p.x + d[0] * length,
        z = p.z + d[2] * length;
      const box =
        Math.abs(d[0]) > Math.abs(d[2])
          ? [x, 1.1, z, 0.7, 2.2, 4, "barrier"]
          : [x, 1.1, z, 4, 2.2, 0.7, "barrier"];
      if (
        length < 1 ||
        [...this.players.values()].some(
          (e) =>
            e.hp > 0 &&
            Math.abs(e.x - x) < box[3] / 2 + 0.6 &&
            Math.abs(e.z - z) < box[5] / 2 + 0.6,
        )
      ) {
        p.charges = before;
        return false;
      }
      const e = this.effect(
        agent.kind,
        p,
        x,
        p.y,
        z,
        agent.kind === "wall" ? 15 : 40,
        1,
      );
      if (agent.kind === "wall") e.box = box;
      else {
        e.hp = 65;
        e.nextShot = this.time;
      }
    }
    this.event({
      t: "ability",
      id: p.id,
      kind: agent.kind,
      x: p.x,
      y: p.y,
      z: p.z,
    });
    return true;
  }
  effect(kind, p, x, y, z, duration, radius) {
    const e = {
      id: ++this.effectSerial,
      kind,
      owner: p?.id,
      team: p?.team,
      x,
      y,
      z,
      expires: this.time + duration,
      radius,
    };
    this.effects.push(e);
    return e;
  }
  tickProjectiles(dt) {
    const keep = [];
    for (const g of this.projectiles) {
      g.vy -= 15 * dt;
      const old = [g.x, g.y, g.z],
        delta = [g.vx * dt, g.vy * dt, g.vz * dt],
        len = Math.hypot(...delta),
        d = delta.map((v) => v / (len || 1)),
        hit = wallDistance(old, d, len + 0.15);
      if (hit < len + 0.12) {
        g.vx *= -0.35;
        g.vz *= -0.35;
        g.vy = Math.abs(g.vy) * 0.3;
      } else {
        g.x += delta[0];
        g.y += delta[1];
        g.z += delta[2];
      }
      if (g.y < 0.15) {
        g.y = 0.15;
        g.vy = Math.abs(g.vy) * 0.35;
        g.vx *= 0.8;
        g.vz *= 0.8;
      }
      if (g.fuse > this.time) {
        keep.push(g);
        continue;
      }
      this.detonate(g);
    }
    this.projectiles = keep;
  }
  detonate(g) {
    const owner = this.players.get(g.owner),
      o = [g.x, g.y, g.z];
    if (g.kind === "frag") {
      for (const p of this.players.values()) {
        const l = Math.hypot(p.x - g.x, p.y + 1 - g.y, p.z - g.z);
        if (l < 9 && visible(o, [p.x, p.y + 1, p.z], false))
          this.damage(owner, p, Math.round(105 * (1 - l / 10)));
      }
      this.event({ t: "explosion", x: g.x, y: g.y, z: g.z, radius: 9 });
    } else if (g.kind === "flash") {
      for (const p of this.players.values()) {
        if (p.hp <= 0) continue;
        const eye = [p.x, p.y + (p.crouch ? 1 : C.eye), p.z],
          v = o.map((x, i) => x - eye[i]),
          l = Math.hypot(...v);
        if (l > 22 || !visible(eye, o)) continue;
        const facing = direction(p.yaw, p.pitch).reduce(
            (s, x, i) => s + (x * v[i]) / (l || 1),
            0,
          ),
          duration = (facing > 0.25 ? 2.6 : 0.55) * clamp(1 - l / 35, 0.3, 1);
        p.flashUntil = this.time + duration;
        p.flashDuration = duration;
      }
      this.event({ t: "flash", x: g.x, y: g.y, z: g.z });
    } else
      this.effect(
        g.kind,
        owner,
        g.x,
        g.kind === "smoke" ? g.y + 2.4 : 0.06,
        g.z,
        g.kind === "smoke" ? 12 : 8,
        g.kind === "smoke" ? 5.2 : 5,
      );
  }
  tickEffects(dt) {
    for (const e of this.effects) {
      if (e.expires <= this.time) continue;
      if (e.kind === "fire") {
        for (const p of this.players.values())
          if (p.hp > 0 && Math.hypot(p.x - e.x, p.z - e.z) < e.radius) {
            p.fireAccum = (p.fireAccum || 0) + dt * 16;
            if (p.fireAccum >= 1) {
              const a = Math.floor(p.fireAccum);
              p.fireAccum -= a;
              this.damage(this.players.get(e.owner), p, a, false, true);
            }
          }
      } else if (e.kind === "turret" && e.hp > 0 && e.nextShot <= this.time) {
        const owner = this.players.get(e.owner),
          target = [...this.players.values()].find(
            (p) =>
              p.hp > 0 &&
              p.id !== e.owner &&
              (this.mode === "ffa" || p.team !== e.team) &&
              Math.hypot(p.x - e.x, p.z - e.z) < 22 &&
              visible([e.x, e.y + 0.65, e.z], [p.x, p.y + 1, p.z]),
          );
        if (target) {
          e.nextShot = this.time + 0.7;
          this.damage(owner, target, 12);
          this.event({
            t: "turretShot",
            x: e.x,
            y: e.y + 0.65,
            z: e.z,
            end: [target.x, target.y + 1, target.z],
          });
        }
      }
    }
  }
  snapshot() {
    return {
      t: "state",
      n: ++this.serial,
      time: this.time,
      phase: this.phase,
      round: this.round,
      roundNumber: this.roundNumber,
      remaining: Math.max(
        0,
        (this.bomb && this.phase === "playing" ? this.bomb.explode : this.end) -
          this.time,
      ),
      winner: this.winner,
      map: this.map,
      mode: this.mode,
      goal: this.goal,
      buyLength: this.buyLength,
      targetA: this.targetA,
      scores: { ...this.scores },
      attack: this.attack,
      roundWinner: this.roundWinner,
      roundReason: this.roundReason,
      bomb: this.bomb ? { ...this.bomb } : null,
      votes: { ...this.votes },
      effects: this.effects.map((e) => ({ ...e })),
      projectiles: this.projectiles.map((g) => ({ ...g })),
      players: [...this.players.values()].map((p) => ({
        ...p,
        weapons: { ...p.weapons },
        magazines: Object.fromEntries(
          Object.entries(p.magazines).map(([id, m]) => [id, { ...m }]),
        ),
        grenades: { ...p.grenades },
        respawn: Number.isFinite(p.respawn) ? p.respawn : 0,
      })),
    };
  }
}
