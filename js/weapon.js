import * as THREE from "three";
import { WEAPONS } from "./catalog.js";
export function rifle(id = "specter") {
  const w = WEAPONS[id] || WEAPONS.specter,
    group = new THREE.Group(),
    steel = new THREE.MeshLambertMaterial({ color: 0x253747 }),
    dark = new THREE.MeshLambertMaterial({ color: 0x14212d }),
    accent = new THREE.MeshLambertMaterial({ color: w.color }),
    unit = new THREE.BoxGeometry(1, 1, 1);
  const part = (x, y, z, sx, sy, sz, m = steel) => {
    const mesh = new THREE.Mesh(unit, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    group.add(mesh);
    return mesh;
  };
  const pistol = w.shape === "pistol",
    long = ["sniper", "marksman"].includes(w.shape),
    short = w.shape === "smg" || w.compact;
  const length = pistol ? 0.3 : short ? 0.42 : long ? 0.75 : 0.58;
  part(0, 0, 0, 0.14, 0.15, length);
  part(
    0,
    0.06,
    -length * 0.5,
    0.07,
    0.08,
    pistol ? 0.2 : long ? 0.55 : 0.34,
    dark,
  );
  if (!pistol) part(0, -0.02, length * 0.62, 0.13, 0.15, 0.28, dark);
  part(0, -0.15, 0.06, 0.09, 0.23, 0.12, dark).rotation.x = -0.12;
  if (!pistol) {
    part(
      0,
      -0.18,
      -0.1,
      0.1,
      w.shape === "lmg" ? 0.24 : 0.25,
      w.shape === "lmg" ? 0.24 : 0.14,
      accent,
    ).rotation.x = 0.12;
    part(0, 0.01, -length * 0.4, 0.17, 0.1, 0.25, accent);
  } else part(0, 0.075, -0.04, 0.145, 0.075, 0.31, accent);
  if (long) {
    const scope = part(0, 0.17, -0.05, 0.12, 0.11, 0.25, dark);
    part(0, 0.16, -0.2, 0.14, 0.14, 0.03, accent);
  } else {
    part(0, 0.12, -0.06, 0.05, 0.04, 0.07, accent);
    part(0, 0.1, -length * 0.72, 0.04, 0.07, 0.04, accent);
  }
  if (id === "specter" || id === "wisp" || w.suppressed)
    part(0, 0.06, -length - 0.2, 0.09, 0.09, 0.3, dark);
  if (w.twin) part(0.075, 0.02, -0.5, 0.04, 0.045, 0.65, dark);
  const muzzleZ = -length * (pistol ? 0.65 : 0.95) - 0.12,
    flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.23, 6),
      new THREE.MeshBasicMaterial({
        color: 0xffdb9d,
        transparent: true,
        opacity: 0.9,
      }),
    );
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0, 0.045, muzzleZ - 0.16);
  flash.visible = false;
  group.add(flash);
  group.userData.flash = flash;
  group.userData.id = id;
  return group;
}
export function viewmodel(id = "specter", color = 0x79d9ed) {
  const root = new THREE.Group(),
    gun = rifle(id);
  root.add(gun);
  const skin = new THREE.MeshLambertMaterial({ color: 0xb99a7e }),
    glove = new THREE.MeshLambertMaterial({ color: 0x192f3d }),
    sleeve = new THREE.MeshLambertMaterial({ color });
  const unit = new THREE.BoxGeometry(1, 1, 1),
    arms = [];
  const arm = (x, y, z, rotation) => {
    const pivot = new THREE.Group();
    const forearm = new THREE.Mesh(unit, sleeve);
    forearm.scale.set(0.115, 0.12, 0.38);
    forearm.position.z = 0.12;
    pivot.add(forearm);
    const hand = new THREE.Mesh(unit, glove);
    hand.scale.set(0.12, 0.11, 0.14);
    hand.position.z = -0.08;
    pivot.add(hand);
    const finger = new THREE.Mesh(unit, skin);
    finger.scale.set(0.09, 0.05, 0.07);
    finger.position.set(0, -0.01, -0.15);
    pivot.add(finger);
    pivot.position.set(x, y, z);
    pivot.rotation.set(...rotation);
    root.add(pivot);
    arms.push(pivot);
  };
  arm(0.06, -0.17, 0.1, [-0.1, -0.12, 0.12]);
  arm(-0.12, -0.12, -0.27, [0.1, -0.25, -0.18]);
  root.userData = { gun, arms, flash: gun.userData.flash };
  return root;
}
export class AudioFX {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.noise = null;
    this.footAt = 0;
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        const b = this.context.createBuffer(
            1,
            this.context.sampleRate * 0.25,
            this.context.sampleRate,
          ),
          d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noise = b;
      }
      this.context.resume();
    } catch {}
  }
  sound(type, distance = 0, weapon = "specter") {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.settings.volume <= 0
    )
      return;
    const ctx = this.context,
      t = ctx.currentTime,
      volume = this.settings.volume / (1 + distance * 0.12),
      gain = ctx.createGain();
    gain.connect(ctx.destination);
    let duration = 0.18;
    if (
      type === "shot" ||
      type === "explosion" ||
      type === "step" ||
      type === "throw"
    ) {
      const src = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter();
      src.buffer = this.noise;
      if (type === "shot")
        src.playbackRate.value =
          ({ pistol: 1.2, smg: 1.4, shotgun: 0.72, sniper: 0.6, lmg: 0.85 }[
            WEAPONS[weapon]?.shape
          ] || 1) *
          (0.96 + Math.random() * 0.08);
      filter.type = "lowpass";
      filter.frequency.value =
        type === "explosion"
          ? 450
          : type === "step"
            ? 220
            : WEAPONS[weapon]?.suppressed ||
                ["specter", "wisp"].includes(weapon)
              ? 800
              : WEAPONS[weapon]?.shape === "sniper"
                ? 1000
                : 2400;
      src.connect(filter);
      filter.connect(gain);
      duration = type === "step" ? 0.08 : type === "explosion" ? 0.35 : 0.16;
      gain.gain.setValueAtTime(
        volume *
          (type === "step"
            ? 0.14
            : type === "explosion"
              ? 0.8
              : WEAPONS[weapon]?.suppressed ||
                  ["specter", "wisp"].includes(weapon)
                ? 0.23
                : 0.45),
        t,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      src.start();
      src.stop(t + Math.min(duration, 0.25));
    } else {
      const o = ctx.createOscillator();
      o.type = type === "plant" ? "square" : "sine";
      o.frequency.setValueAtTime(
        type === "flash"
          ? 1300
          : type === "hit"
            ? 900
            : type === "roundResult"
              ? 440
              : 620,
        t,
      );
      o.frequency.exponentialRampToValueAtTime(
        type === "flash" ? 400 : 300,
        t + 0.15,
      );
      gain.gain.setValueAtTime(volume * 0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(gain);
      o.start();
      o.stop(t + 0.2);
    }
  }
  shot(distance = 0, weapon) {
    this.sound("shot", distance, weapon);
  }
}
