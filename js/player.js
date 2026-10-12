import { C, clamp } from "./config.js";
import { COLLIDERS, CURRENT } from "./world.js";
export function makePlayer(id, name, index = 0) {
  return {
    id,
    name,
    index,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    grounded: true,
    hp: 100,
    ammo: C.mag,
    kills: 0,
    deaths: 0,
    reload: 0,
    nextShot: 0,
    respawn: 0,
    shield: 0,
    ack: 0,
    ping: 0,
    ready: false,
    epoch: 0,
  };
}
const approach = (x, t, a) => (x < t ? Math.min(t, x + a) : Math.max(t, x - a));
function overlaps(p, b) {
  return (
    p.x + C.radius > b[0] &&
    p.x - C.radius < b[3] &&
    p.z + C.radius > b[2] &&
    p.z - C.radius < b[5]
  );
}
export function move(p, input, dt = C.tick) {
  p.yaw = input.yaw;
  p.pitch = clamp(input.pitch, -1.45, 1.45);
  if (p.hp <= 0) return;
  p.crouch = !!input.crouch;
  p.ads = !!input.ads;
  let mx = clamp(input.mx || 0, -1, 1),
    mz = clamp(input.mz || 0, -1, 1),
    len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed =
      (p.crouch
        ? C.speed * 0.55
        : input.sprint
          ? C.sprint
          : p.ads
            ? C.speed * 0.8
            : C.speed) * (p.slow || 1),
    s = Math.sin(p.yaw),
    c = Math.cos(p.yaw),
    tx = (mx * c - mz * s) * speed,
    tz = (-mx * s - mz * c) * speed;
  const height = p.crouch ? 1.25 : C.height;
  const accel = (len > 0.01 ? C.acceleration : C.friction) * dt;
  p.vx = p.dashing ? p.dashDX : approach(p.vx, tx, accel);
  p.vz = p.dashing ? p.dashDZ : approach(p.vz, tz, accel);
  if (input.jump && p.grounded) {
    p.vy = C.jump;
    p.grounded = false;
  }
  p.vy -= C.gravity * dt;
  // Fixed small steps + separated axes prevent tunnelling and slide along corners.
  for (const axis of ["x", "z"]) {
    const vel = axis === "x" ? "vx" : "vz";
    const old = p[axis];
    p[axis] += p[vel] * dt;
    for (const b of COLLIDERS) {
      if (p.y >= b[4] - 0.001 || p.y + height <= b[1] || !overlaps(p, b))
        continue;
      const low = axis === "x" ? b[0] : b[2],
        high = axis === "x" ? b[3] : b[5];
      p[axis] =
        p[vel] > 0 ? low - C.radius : p[vel] < 0 ? high + C.radius : old;
      p[vel] = 0;
    }
  }
  // A hard horizontal arena bound also prevents escapes after jumping off cover.
  const limit = CURRENT.width / 2 - 0.5 - C.radius,
    zLimit = CURRENT.depth / 2 - 0.5 - C.radius;
  if (Math.abs(p.x) > limit) {
    p.x = clamp(p.x, -limit, limit);
    p.vx = 0;
  }
  if (Math.abs(p.z) > zLimit) {
    p.z = clamp(p.z, -zLimit, zLimit);
    p.vz = 0;
  }
  const oldY = p.y;
  p.y += p.vy * dt;
  p.grounded = false;
  if (p.y <= 0) {
    p.y = 0;
    p.vy = 0;
    p.grounded = true;
  }
  for (const b of COLLIDERS) {
    if (!overlaps(p, b)) continue;
    if (p.vy <= 0 && oldY >= b[4] - 0.001 && p.y < b[4]) {
      p.y = b[4];
      p.vy = 0;
      p.grounded = true;
    } else if (p.vy > 0 && oldY + height <= b[1] && p.y + height > b[1]) {
      p.y = b[1] - height;
      p.vy = 0;
    }
  }
}
export const idleInput = (p, seq = 0) => ({
  seq,
  mx: 0,
  mz: 0,
  yaw: p.yaw,
  pitch: p.pitch,
  sprint: false,
  jump: false,
  fire: false,
  reload: false,
});
export function validInput(i) {
  return (
    i &&
    Number.isSafeInteger(i.seq) &&
    i.seq > 0 &&
    i.seq < 1e9 &&
    ["mx", "mz", "yaw", "pitch"].every((k) => Number.isFinite(i[k])) &&
    Math.abs(i.mx) <= 1 &&
    Math.abs(i.mz) <= 1 &&
    Math.abs(i.yaw) < 1e6 &&
    Math.abs(i.pitch) <= 1.5
  );
}
