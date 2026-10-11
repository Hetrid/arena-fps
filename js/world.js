// Shared deterministic geometry: rendering, collision, occlusion and host raycasts agree.
export const BOXES = [
  [-20, 1.5, 0, 1, 3, 41, "wall"],
  [20, 1.5, 0, 1, 3, 41, "wall"],
  [0, 1.5, -20, 39, 3, 1, "wall"],
  [0, 1.5, 20, 39, 3, 1, "wall"],
  [0, 1.6, 0, 6, 3.2, 6, "core"],
  [-10, 1.3, -7, 4, 2.6, 3, "crate"],
  [10, 1.3, 7, 4, 2.6, 3, "crate"],
  [9, 1.3, -10, 3, 2.6, 5, "crate"],
  [-9, 1.3, 10, 3, 2.6, 5, "crate"],
  [-4, 0.65, -12, 6, 1.3, 1, "barrier"],
  [4, 0.65, 12, 6, 1.3, 1, "barrier"],
  [-13, 0.65, 1, 1, 1.3, 6, "barrier"],
  [13, 0.65, -1, 1, 1.3, 6, "barrier"],
  [-15, 1.1, -13, 2.5, 2.2, 2.5, "crate"],
  [15, 1.1, 13, 2.5, 2.2, 2.5, "crate"],
  [15, 1.1, -15, 2.5, 2.2, 2.5, "crate"],
  [-15, 1.1, 15, 2.5, 2.2, 2.5, "crate"],
];
export const SPAWNS = [
  [-17, -17],
  [17, 17],
  [-17, 17],
  [17, -17],
  [-17, -5],
  [17, 5],
  [-5, 17],
  [5, -17],
];
export const bounds = (b) => [
  b[0] - b[3] / 2,
  b[1] - b[4] / 2,
  b[2] - b[5] / 2,
  b[0] + b[3] / 2,
  b[1] + b[4] / 2,
  b[2] + b[5] / 2,
];
export const COLLIDERS = BOXES.map(bounds);
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
export function wallDistance(o, d, max = 80) {
  let hit = max;
  for (const b of COLLIDERS) hit = Math.min(hit, rayBox(o, d, b, hit));
  return hit;
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
