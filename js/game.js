import { C, clamp } from "./config.js";
import { makePlayer, move, idleInput, validInput } from "./player.js";
import { SPAWNS, visible, direction, wallDistance, rayBox } from "./world.js";
export function ranking(players) {
  return [...players].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths || a.index - b.index,
  );
}
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
    this.winner = null;
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
    this.players.set(id, p);
    this.inputs.set(id, { queue: [], last: idleInput(p), seen: this.time });
    this.spawn(p);
    return p;
  }
  remove(id) {
    this.players.delete(id);
    this.inputs.delete(id);
    if (this.phase === "results") this.checkRematch();
  }
  spawn(p) {
    let best = SPAWNS[0],
      bestScore = -Infinity;
    for (const s of SPAWNS) {
      let score = 100;
      for (const e of this.players.values()) {
        if (e.id === p.id || e.hp <= 0) continue;
        const d = Math.hypot(e.x - s[0], e.z - s[1]);
        score = Math.min(
          score,
          d - (visible([s[0], C.eye, s[1]], [e.x, e.y + 1.1, e.z]) ? 18 : 0),
        );
      }
      score += Math.random();
      if (score > bestScore) {
        bestScore = score;
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
      ammo: C.mag,
      reload: 0,
      respawn: 0,
      shield: this.time + C.spawnProtection,
      grounded: true,
      epoch: p.epoch + 1,
    });
  }
  start() {
    if (!this.players.size) return;
    this.phase = "playing";
    this.round++;
    this.end = this.time + C.matchSeconds;
    this.winner = null;
    this.history = [];
    for (const p of this.players.values()) {
      Object.assign(p, {
        kills: 0,
        deaths: 0,
        ready: false,
        nextShot: this.time,
      });
      this.spawn(p);
      this.inputs.get(p.id).queue = [];
    }
    this.event({ t: "start", round: this.round });
  }
  ready(id) {
    const p = this.players.get(id);
    if (p && this.phase === "results") {
      p.ready = !p.ready;
      this.checkRematch();
    }
  }
  checkRematch() {
    if (this.players.size && [...this.players.values()].every((p) => p.ready))
      this.start();
  }
  receive(id, batch, round = this.round) {
    const q = this.inputs.get(id),
      p = this.players.get(id);
    if (!q || !Array.isArray(batch) || round !== this.round) return;
    for (const i of batch.slice(-12)) {
      if (
        !validInput(i) ||
        i.seq <= p.ack ||
        i.seq > p.ack + 120 ||
        q.queue.some((x) => x.seq === i.seq)
      )
        continue;
      q.queue.push({
        ...i,
        jump: !!i.jump,
        fire: !!i.fire,
        reload: !!i.reload,
        sprint: !!i.sprint,
      });
    }
    q.queue.sort((a, b) => a.seq - b.seq);
    q.queue = q.queue.slice(0, 12);
    q.seen = this.time;
  }
  tick(dt = C.tick) {
    this.time += dt;
    if (this.phase !== "playing") return;
    for (const p of this.players.values()) {
      const q = this.inputs.get(p.id);
      const incoming = q.queue.shift();
      let input;
      if (incoming) {
        p.ack = incoming.seq;
        q.last = incoming;
        input = incoming;
      } else
        input = {
          ...q.last,
          jump: false,
          reload: false,
          ...(this.time - q.seen > C.inputTimeout
            ? { mx: 0, mz: 0, fire: false }
            : {}),
        };
      if (p.hp <= 0) {
        if (this.time >= p.respawn) this.spawn(p);
        continue;
      }
      move(p, input, dt);
      if (p.reload && this.time >= p.reload) {
        p.ammo = C.mag;
        p.reload = 0;
      }
      if (input.reload && !p.reload && p.ammo < C.mag)
        p.reload = this.time + C.reloadSeconds;
      if (input.fire && !p.reload && this.time + 1e-7 >= p.nextShot) {
        if (p.ammo > 0) this.shoot(p);
        else p.reload = this.time + C.reloadSeconds;
      }
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
      })),
    });
    while (this.history.length && this.history[0].time < this.time - 0.25)
      this.history.shift();
    if (
      this.phase === "playing" &&
      (this.time >= this.end ||
        [...this.players.values()].some((p) => p.kills >= C.winKills))
    ) {
      this.phase = "results";
      this.winner = ranking(this.players.values())[0]?.id;
      this.event({ t: "finish", winner: this.winner });
    }
  }
  shoot(p) {
    p.ammo--;
    p.nextShot = this.time + C.shotDelay;
    p.shield = 0;
    const o = [p.x, p.y + C.eye, p.z],
      d = direction(p.yaw, p.pitch);
    let distance = wallDistance(o, d),
      victim = null,
      head = false;
    const rewind = this.time - clamp(p.ping / 2000, 0, C.maxRewind);
    let frame = this.history[0];
    for (const f of this.history) {
      if (f.time <= rewind) frame = f;
      else break;
    }
    for (const e of this.players.values()) {
      if (e.id === p.id || e.hp <= 0 || e.shield > this.time) continue;
      const historic = frame?.players.find(
        (x) => x.id === e.id && x.hp > 0 && x.epoch === e.epoch,
      );
      const h = historic || e;
      const body = [
          h.x - 0.32,
          h.y,
          h.z - 0.28,
          h.x + 0.32,
          h.y + 1.45,
          h.z + 0.28,
        ],
        hb = [
          h.x - 0.24,
          h.y + 1.45,
          h.z - 0.24,
          h.x + 0.24,
          h.y + 1.85,
          h.z + 0.24,
        ];
      const bd = rayBox(o, d, body),
        hd = rayBox(o, d, hb);
      const hit = Math.min(bd, hd);
      if (hit < distance) {
        distance = hit;
        victim = e;
        head = hd < bd;
      }
    }
    let killed = false;
    if (victim) {
      victim.hp = Math.max(
        0,
        victim.hp - Math.round(C.damage * (head ? C.headMultiplier : 1)),
      );
      if (!victim.hp) {
        victim.deaths++;
        p.kills++;
        victim.respawn = this.time + C.respawnSeconds;
        victim.reload = 0;
        killed = true;
      }
    }
    this.event({
      t: "shot",
      id: p.id,
      o,
      end: o.map((x, k) => x + d[k] * distance),
      hit: victim?.id,
      head,
      killed,
    });
    if (killed) this.event({ t: "kill", killer: p.id, victim: victim.id });
  }
  snapshot() {
    return {
      t: "state",
      n: ++this.serial,
      time: this.time,
      phase: this.phase,
      round: this.round,
      remaining: Math.max(0, this.end - this.time),
      winner: this.winner,
      players: [...this.players.values()].map((p) => ({ ...p })),
    };
  }
}
