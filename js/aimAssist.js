import { C, clamp, wrap } from "./config.js";
import { visible } from "./world.js";
export function assist(
  local,
  players,
  yaw,
  pitch,
  dt,
  strength = 1,
  enabled = true,
  mode = "ffa",
) {
  if (
    !enabled ||
    strength <= 0 ||
    !local ||
    local.hp <= 0 ||
    local.flashUntil > local.serverTime
  )
    return { yaw, pitch, friction: 1 };
  let target = null,
    best = C.aimAssist.cone;
  const eye = [local.x, local.y + (local.crouch ? 1.05 : C.eye), local.z];
  for (const p of players) {
    if (
      p.id === local.id ||
      p.hp <= 0 ||
      p.connected === false ||
      (mode !== "ffa" && p.team === local.team)
    )
      continue;
    const dx = p.x - eye[0],
      dy = p.y + (p.crouch ? 0.8 : 1.2) - eye[1],
      dz = p.z - eye[2],
      range = Math.hypot(dx, dy, dz);
    if (range > C.aimAssist.range || range < 0.2) continue;
    const ty = Math.atan2(-dx, -dz),
      tp = Math.atan2(dy, Math.hypot(dx, dz)),
      distance = Math.hypot(wrap(ty - yaw), tp - pitch);
    if (
      distance < best &&
      visible(eye, [p.x, p.y + (p.crouch ? 0.8 : 1.2), p.z])
    ) {
      best = distance;
      target = { yaw: ty, pitch: tp };
    }
  }
  if (!target) return { yaw, pitch, friction: 1 };
  const weight =
      clamp(1 - best / C.aimAssist.cone, 0, 1) * clamp(strength, 0, 1),
    cap = C.aimAssist.maxCorrectionPerSecond * dt * clamp(strength, 0, 1);
  if (best < C.aimAssist.magnetCone) {
    const dy = wrap(target.yaw - yaw),
      dp = target.pitch - pitch,
      f = Math.min(1, cap / (Math.hypot(dy, dp) || 1));
    yaw += dy * f;
    pitch += dp * f;
  }
  return { yaw, pitch, friction: 1 - C.aimAssist.slowdown * weight };
}
