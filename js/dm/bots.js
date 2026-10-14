import { C, clamp, wrap } from "./config.js";
import { bounds, visible } from "./world.js";
import { idleInput } from "./player.js";
const tuning = {
  easy: { reaction: 0.6, turn: 2.8, error: 0.055, range: 34 },
  normal: { reaction: 0.36, turn: 4, error: 0.027, range: 46 },
  hard: { reaction: 0.2, turn: 5.5, error: 0.013, range: 60 },
};
export class Navigation {
  constructor(map) {
    this.map = map;
    this.cell = 2.5;
    this.w = Math.ceil(map.width / this.cell);
    this.h = Math.ceil(map.depth / this.cell);
    const boxes = map.boxes.map(bounds);
    this.clear = new Uint8Array(this.w * this.h);
    this.points = [];
    for (let z = 0; z < this.h; z++)
      for (let x = 0; x < this.w; x++) {
        const [px, pz] = this.point(z * this.w + x);
        if (
          boxes.some(
            (b) =>
              px + 0.52 > b[0] &&
              px - 0.52 < b[3] &&
              pz + 0.52 > b[2] &&
              pz - 0.52 < b[5],
          )
        )
          continue;
        this.clear[z * this.w + x] = 1;
        if (x % 4 === 2 && z % 4 === 2) this.points.push([px, pz]);
      }
  }
  point(i) {
    return [
      -this.map.width / 2 + ((i % this.w) + 0.5) * this.cell,
      -this.map.depth / 2 + (Math.floor(i / this.w) + 0.5) * this.cell,
    ];
  }
  index(x, z) {
    const gx = clamp(
        Math.floor((x + this.map.width / 2) / this.cell),
        0,
        this.w - 1,
      ),
      gz = clamp(
        Math.floor((z + this.map.depth / 2) / this.cell),
        0,
        this.h - 1,
      ),
      i = gz * this.w + gx;
    if (this.clear[i]) return i;
    for (let r = 1; r < 5; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx,
            nz = gz + dz,
            j = nz * this.w + nx;
          if (nx >= 0 && nx < this.w && nz >= 0 && nz < this.h && this.clear[j])
            return j;
        }
    return -1;
  }
  route(ax, az, bx, bz) {
    const start = this.index(ax, az),
      goal = this.index(bx, bz);
    if (start < 0 || goal < 0) return [];
    const n = this.clear.length,
      g = new Float32Array(n).fill(Infinity),
      parent = new Int32Array(n).fill(-1),
      closed = new Uint8Array(n),
      heap = [];
    const estimate = (i) =>
      Math.hypot(
        (i % this.w) - (goal % this.w),
        Math.floor(i / this.w) - Math.floor(goal / this.w),
      );
    const push = (i, f) => {
      let k = heap.length;
      heap.push({ i, f });
      while (k) {
        const p = (k - 1) >> 1;
        if (heap[p].f <= f) break;
        heap[k] = heap[p];
        k = p;
      }
      heap[k] = { i, f };
    };
    const pop = () => {
      const top = heap[0],
        last = heap.pop();
      if (heap.length) {
        let k = 0;
        while (k * 2 + 1 < heap.length) {
          let c = k * 2 + 1;
          if (c + 1 < heap.length && heap[c + 1].f < heap[c].f) c++;
          if (heap[c].f >= last.f) break;
          heap[k] = heap[c];
          k = c;
        }
        heap[k] = last;
      }
      return top.i;
    };
    g[start] = 0;
    push(start, estimate(start));
    let budget = 6000;
    while (heap.length && budget--) {
      const i = pop();
      if (closed[i]) continue;
      if (i === goal) {
        const path = [];
        for (let k = i; k !== start && k !== -1; k = parent[k])
          path.push(this.point(k));
        return path.reverse();
      }
      closed[i] = 1;
      const x = i % this.w,
        z = Math.floor(i / this.w);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = x + dx,
            nz = z + dz,
            j = nz * this.w + nx;
          if (
            nx < 0 ||
            nx >= this.w ||
            nz < 0 ||
            nz >= this.h ||
            !this.clear[j] ||
            closed[j]
          )
            continue;
          if (
            dx &&
            dz &&
            (!this.clear[z * this.w + nx] || !this.clear[nz * this.w + x])
          )
            continue;
          const next = g[i] + (dx && dz ? 1.4142 : 1);
          if (next >= g[j]) continue;
          g[j] = next;
          parent[j] = i;
          push(j, next + estimate(j));
        }
    }
    return [];
  }
}
export class BotController {
  constructor(game) {
    this.game = game;
    this.states = new Map();
    this.reset();
  }
  reset() {
    this.nav = new Navigation(this.game.mapData());
    this.states.clear();
  }
  input(p, dt) {
    const game = this.game,
      time = game.time,
      t = tuning[game.difficulty] || tuning.normal;
    let s = this.states.get(p.id);
    if (!s || s.epoch !== p.epoch) {
      s = {
        epoch: p.epoch,
        path: [],
        nextPlan: 0,
        seen: null,
        shootAt: time + t.reaction,
        lastX: p.x,
        lastZ: p.z,
        stuckAt: time,
      };
      this.states.set(p.id, s);
    }
    const enemies = [...game.players.values()].filter(
      (e) => e.id !== p.id && e.hp > 0 && e.connected,
    );
    enemies.sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    );
    const eye = [p.x, p.y + C.eye, p.z],
      seen = enemies.find(
        (e) =>
          Math.hypot(e.x - p.x, e.z - p.z) < t.range &&
          visible(eye, [e.x, e.y + 1.15, e.z]),
      );
    const target = seen || enemies[0];
    if (!target) return idleInput(p);
    if (s.seen !== seen?.id) {
      s.seen = seen?.id;
      s.shootAt = time + t.reaction;
    }
    const distance = Math.hypot(target.x - p.x, target.z - p.z);
    if (time >= s.nextPlan) {
      s.path = this.nav.route(p.x, p.z, target.x, target.z);
      s.nextPlan = time + 1.1 + (p.index % 4) * 0.12;
    }
    while (
      s.path.length &&
      Math.hypot(s.path[0][0] - p.x, s.path[0][1] - p.z) < 1.5
    )
      s.path.shift();
    let vx = 0,
      vz = 0;
    if (seen) {
      if (distance > 16 || (p.weapon === "breach" && distance > 7)) {
        vx = (target.x - p.x) / distance;
        vz = (target.z - p.z) / distance;
      } else if (distance < 7) {
        vx = ((p.x - target.x) / distance) * 0.5;
        vz = ((p.z - target.z) / distance) * 0.5;
      } else {
        vx = Math.cos(time * 1.1 + p.index) * 0.28;
        vz = Math.sin(time * 1.1 + p.index) * 0.28;
      }
    } else if (s.path.length) {
      const [x, z] = s.path[0],
        l = Math.hypot(x - p.x, z - p.z);
      vx = (x - p.x) / l;
      vz = (z - p.z) / l;
    }
    const aimX = seen ? target.x : (s.path[0]?.[0] ?? target.x),
      aimZ = seen ? target.z : (s.path[0]?.[1] ?? target.z),
      wanted = Math.atan2(p.x - aimX, p.z - aimZ),
      error = seen ? Math.sin(time * 3.2 + p.index * 5) * t.error : 0,
      yaw =
        p.yaw + clamp(wrap(wanted + error - p.yaw), -t.turn * dt, t.turn * dt),
      pitch = seen
        ? Math.atan2(target.y + 1.12 - eye[1], distance) +
          Math.cos(time * 2.6 + p.index) * t.error * 0.35
        : 0;
    const input = {
      ...idleInput(p),
      yaw,
      pitch,
      mx: clamp(vx * Math.cos(yaw) - vz * Math.sin(yaw), -1, 1),
      mz: clamp(-vx * Math.sin(yaw) - vz * Math.cos(yaw), -1, 1),
      sprint: !seen,
      ads: !!seen && distance > 20,
      fire:
        !!seen &&
        target.shield <= time &&
        time > s.shootAt &&
        Math.abs(wrap(wanted - yaw)) < 0.13 &&
        time % 1.5 < 1.05,
      reload: p.ammo === 0 || (!seen && p.ammo < 8),
    };
    if (Math.hypot(p.x - s.lastX, p.z - s.lastZ) > 0.7) {
      s.stuckAt = time;
      s.lastX = p.x;
      s.lastZ = p.z;
    } else if (time - s.stuckAt > 1.5) {
      s.nextPlan = 0;
      input.mx = Math.sin(time * 4 + p.index);
      input.jump = true;
      s.stuckAt = time;
    }
    return input;
  }
}
