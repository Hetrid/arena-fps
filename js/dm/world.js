import { MAPS } from "./maps.js";
export let CURRENT = MAPS.relay;
export let BOXES = CURRENT.boxes;
export let COLLIDERS = [];
export let SPAWNS = [];

export const bounds = (b) => [
  b[0] - b[3] / 2,
  b[1] - b[4] / 2,
  b[2] - b[5] / 2,
  b[0] + b[3] / 2,
  b[1] + b[4] / 2,
  b[2] + b[5] / 2,
];
export function setMap(id = "relay") {
  CURRENT = MAPS[id] || MAPS.relay;
  BOXES = CURRENT.boxes;
  SPAWNS = [...CURRENT.spawns.A, ...CURRENT.spawns.B];
  setEffects([]);
}
export function setEffects() {
  COLLIDERS = BOXES.map(bounds);
}
setMap();
export function rayBox(o, d, b, max = Infinity) {
  let near = 0,
    far = max;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-8) {
      if (o[k] < b[k] || o[k] > b[k + 3]) return Infinity;
    } else {
      let a = (b[k] - o[k]) / d[k],
        z = (b[k + 3] - o[k]) / d[k];
      if (a > z) [a, z] = [z, a];
      near = Math.max(near, a);
      far = Math.min(far, z);
      if (near > far) return Infinity;
    }
  }
  return near;
}
export function wallDistance(o, d, max = 200) {
  let hit = max;
  for (const b of COLLIDERS) hit = Math.min(hit, rayBox(o, d, b, hit));
  return hit;
}
export function raySphere(o, d, center, r, max = Infinity) {
  const v = o.map((x, i) => x - center[i]),
    b = v.reduce((s, x, i) => s + x * d[i], 0),
    q = v.reduce((s, x) => s + x * x, 0) - r * r,
    h = b * b - q;
  if (q < 0) return 0;
  if (h < 0) return Infinity;
  const t = -b - Math.sqrt(h);
  return t >= 0 && t <= max ? t : Infinity;
}
export function visible(a, b) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    dz = b[2] - a[2],
    l = Math.hypot(dx, dy, dz);
  return l < 0.001 || wallDistance(a, [dx / l, dy / l, dz / l], l) >= l - 0.02;
}
export const direction = (yaw, pitch) => [
  -Math.sin(yaw) * Math.cos(pitch),
  Math.sin(pitch),
  -Math.cos(yaw) * Math.cos(pitch),
];
