import { C, clamp } from "./config.js";
import { WEAPONS, weaponSlot } from "./catalog.js";
import { MAPS } from "./maps.js";
import { makePlayer, move, idleInput, validInput } from "./player.js";
import {
  CURRENT,
  setMap,
  visible,
  direction,
  wallDistance,
  rayBox,
} from "./world.js";
import { BotController } from "./bots.js";
export const ranking = (players) =>
  [...players].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.index - b.index,
  );
export class HostGame {
  constructor(event = () => {}) {
    this.players = new Map();
    this.inputs = new Map();
    this.history = [];
    this.time = 0;
    this.phase = "lobby";
    this.round = 0;
    this.end = 0;
    this.event = event;
    this.serial = 0;
    this.index = 0;
    this.botSerial = 0;
    this.winner = null;
    this.map = "relay";
    this.mode = "ffa";
    this.botCount = 0;
    this.difficulty = "normal";
    this.goal = C.winKills;
    this.seconds = C.matchSeconds;
    this.brains = new BotController(this);
  }
  mapData() {
    return MAPS[this.map];
  }
  world() {
    if (CURRENT.id !== this.map) setMap(this.map);
  }
  humanCount() {
    return [...this.players.values()].filter((p) => !p.bot).length;
  }
  add(id, name, bot = false) {
    if (this.players.has(id)) return null;
    if (this.players.size >= C.maxPlayers) {
      const replace = !bot && [...this.players.values()].find((p) => p.bot);
      if (!replace) return null;
      this.remove(replace.id, false);
    }
    const p = makePlayer(
      id,
      String(name || "Player")
        .replace(/[\x00-\x1f]/g, "")
        .slice(0, 18),
      this.index++,
    );
    Object.assign(p, {
      bot,
      connected: true,
      armor: 0,
      weapons: { primary: "specter", secondary: "sidekick" },
      magazines: {},
      weapon: "specter",
    });
    this.players.set(id, p);
    this.inputs.set(id, { queue: [], last: idleInput(p), seen: this.time });
    if (bot) {
      p.weapon = ["specter", "spark", "sovereign", "wisp"][p.index % 4];
      p.weapons.primary = p.weapon;
    }
    this.refill(p);
    this.spawn(p);
    return p;
  }
  remove(id, refill = true) {
    const p = this.players.get(id);
    this.players.delete(id);
    this.inputs.delete(id);
    this.brains.states.delete(id);
    if (refill && !p?.bot) this.syncBots();
  }
  configure(o = {}) {
    if (this.phase === "lobby" && MAPS[o.map] && o.map !== this.map) {
      this.map = o.map;
      this.world();
      this.brains.reset();
      for (const p of this.players.values()) this.spawn(p);
    }
    if (["easy", "normal", "hard"].includes(o.difficulty))
      this.difficulty = o.difficulty;
    if (o.bots !== undefined && Number.isFinite(Number(o.bots)))
      this.botCount = clamp(Math.round(Number(o.bots)), 0, 9);
    this.syncBots();
  }
  syncBots() {
    const goal = Math.min(this.botCount, C.maxPlayers - this.humanCount()),
      bots = [...this.players.values()].filter((p) => p.bot);
    while (bots.length > goal) this.remove(bots.pop().id, false);
    while (bots.length < goal) {
      const n = ++this.botSerial;
      const p = this.add(
        "bot-" + n,
        [
          "Rook",
          "Copper",
          "Vector",
          "Dash",
          "Slate",
          "Orbit",
          "Flint",
          "Nova",
          "Rivet",
        ][(n - 1) % 9] + " · BOT",
        true,
      );
      if (!p) break;
      bots.push(p);
    }
  }
  refill(p) {
    for (const id of Object.values(p.weapons))
      p.magazines[id] = { ammo: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
    this.syncAmmo(p);
  }
  spawn(p) {
    this.world();
    const points = this.brains.nav.points;
    let best = points[0] || this.mapData().spawns.A[0],
      score = -Infinity;
    for (const point of points) {
      let distance = Infinity,
        exposed = 0;
      for (const e of this.players.values()) {
        if (e.id === p.id || e.hp <= 0 || !e.connected) continue;
        const d = Math.hypot(e.x - point[0], e.z - point[1]);
        distance = Math.min(distance, d);
        if (
          d < 20 &&
          visible([point[0], C.eye, point[1]], [e.x, e.y + 1.2, e.z])
        )
          exposed += 25;
      }
      if (!Number.isFinite(distance)) distance = 32;
      const value =
        (distance < 2
          ? -300
          : Math.min(distance, 30) - Math.max(0, distance - 40) * 0.2) -
        exposed +
        Math.random() * 4;
      if (value > score) {
        score = value;
        best = point;
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
      shield: this.time + C.spawnProtection,
      grounded: true,
      epoch: p.epoch + 1,
      crouch: false,
      ads: false,
      burstRemaining: 0,
      wasFire: false,
      yaw: Math.atan2(best[0], best[1]),
      pitch: 0,
      nextShot: this.time,
    });
    this.refill(p);
    const q = this.inputs.get(p.id);
    q.queue = [];
    q.last = idleInput(p);
    q.seen = this.time;
  }
  syncAmmo(p) {
    const m = p.magazines[p.weapon];
    p.ammo = m?.ammo || 0;
    p.reserve = m?.reserve || 0;
  }
  start() {
    if (!this.players.size || this.phase === "playing") return false;
    this.world();
    this.syncBots();
    this.round++;
    this.phase = "playing";
    this.end = this.time + this.seconds;
    this.winner = null;
    this.history = [];
    for (const p of this.players.values()) {
      p.kills = p.deaths = 0;
      p.ready = false;
      this.spawn(p);
    }
    this.event({ t: "start", round: this.round });
    return true;
  }
  equip(id, item) {
    const p = this.players.get(id);
    if (
      !p ||
      !p.connected ||
      !WEAPONS[item] ||
      !["lobby", "playing", "results"].includes(this.phase)
    )
      return false;
    const slot = weaponSlot(item),
      old = p.weapons[slot];
    if (old === item) {
      this.switchWeapon(p, slot);
      return true;
    }
    delete p.magazines[old];
    p.weapons[slot] = item;
    p.magazines[item] = {
      ammo: WEAPONS[item].mag,
      reserve: WEAPONS[item].reserve,
    };
    this.switchWeapon(p, item);
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
    if (
      !q ||
      p.bot ||
      !p.connected ||
      !Array.isArray(batch) ||
      round !== this.round
    )
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
        seq: i.seq,
        mx: i.mx,
        mz: i.mz,
        yaw: i.yaw,
        pitch: i.pitch,
        jump: !!i.jump,
        fire: !!i.fire,
        reload: !!i.reload,
        sprint: !!i.sprint,
        crouch: !!i.crouch,
        ads: !!i.ads,
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
      slot: null,
      ...(this.time - q.seen > C.inputTimeout
        ? { mx: 0, mz: 0, fire: false }
        : {}),
    };
  }
  tick(dt = C.tick) {
    this.time += dt;
    this.world();
    if (this.phase !== "playing") return;
    for (const p of this.players.values()) {
      if (!p.connected) continue;
      if (p.hp <= 0) {
        if (this.time >= p.respawn) this.spawn(p);
        continue;
      }
      const i = p.bot ? this.brains.input(p, dt) : this.nextInput(p);
      move(p, i, dt);
      if (
        p.grounded &&
        Math.hypot(p.vx, p.vz) > 1.5 &&
        this.time >= (p.stepAt || 0)
      ) {
        p.stepAt = this.time + (i.sprint ? 0.3 : 0.45);
        this.event({ t: "step", id: p.id, x: p.x, y: p.y, z: p.z });
      }
      if (i.slot) this.switchWeapon(p, i.slot);
      const w = WEAPONS[p.weapon],
        m = p.magazines[p.weapon];
      if (p.reload && this.time >= p.reload) {
        const n = Math.min(w.mag - m.ammo, m.reserve);
        m.ammo += n;
        m.reserve -= n;
        p.reload = 0;
      }
      if (i.reload && !p.reload && m.ammo < w.mag && m.reserve > 0)
        p.reload = this.time + w.reload;
      if (
        (i.fire || p.burstRemaining > 0) &&
        !p.reload &&
        this.time + 1e-7 >= p.nextShot &&
        (p.burstRemaining > 0 || w.auto || !p.wasFire)
      ) {
        if (m.ammo > 0) {
          if (!p.burstRemaining && w.burst && i.ads) p.burstRemaining = w.burst;
          this.shoot(p);
        } else {
          p.burstRemaining = 0;
          if (m.reserve > 0) p.reload = this.time + w.reload;
        }
      }
      p.wasFire = i.fire;
      this.syncAmmo(p);
    }
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
    if (
      this.time >= this.end ||
      [...this.players.values()].some((p) => p.kills >= this.goal)
    ) {
      this.phase = "results";
      this.winner = ranking(this.players.values())[0]?.id || null;
      this.event({ t: "finish", winner: this.winner });
    }
  }
  damage(attacker, victim, amount, head = false) {
    if (victim.hp <= 0 || !victim.connected || victim.shield > this.time)
      return false;
    victim.hp = Math.max(0, victim.hp - Math.ceil(amount));
    if (victim.hp > 0) return false;
    victim.deaths++;
    victim.reload = 0;
    victim.burstRemaining = 0;
    victim.respawn = this.time + C.respawnSeconds;
    if (attacker && attacker.id !== victim.id) attacker.kills++;
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
        head = false;
      for (const e of this.players.values()) {
        if (e.id === p.id || e.hp <= 0 || e.shield > this.time || !e.connected)
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
  snapshot() {
    return {
      t: "state",
      v: C.version,
      n: ++this.serial,
      time: this.time,
      phase: this.phase,
      round: this.round,
      remaining: Math.max(0, this.end - this.time),
      winner: this.winner,
      map: this.map,
      mode: "ffa",
      goal: this.goal,
      bots: this.botCount,
      difficulty: this.difficulty,
      players: [...this.players.values()].map((p) => ({
        ...p,
        weapons: { ...p.weapons },
        magazines: Object.fromEntries(
          Object.entries(p.magazines).map(([id, m]) => [id, { ...m }]),
        ),
      })),
    };
  }
}
