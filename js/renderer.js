import * as THREE from "three";
import { COLORS, C, wrap } from "./config.js";
import { buildMap } from "./map.js";
import { rifle } from "./weapon.js";
const unit = new THREE.BoxGeometry(1, 1, 1);
export class Renderer {
  constructor(canvas, settings) {
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1c2a38);
    this.scene.fog = new THREE.Fog(0x1c2a38, 27, 68);
    this.camera = new THREE.PerspectiveCamera(
      80,
      innerWidth / innerHeight,
      0.05,
      90,
    );
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.setClearColor(0x1c2a38);
    buildMap(this.scene);
    this.models = new Map();
    this.weapon = rifle();
    this.weapon.position.set(0.27, -0.25, -0.55);
    this.camera.add(this.weapon);
    this.recoil = 0;
    this.flashTime = 0;
    this.smooth = [0, 0, 0];
    this.history = [];
    this.received = 0;
    this.lastEpoch = -1;
    this.pool = [];
    this.poolIndex = 0;
    for (let i = 0; i < 18; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(6), 3),
      );
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: 0xffdf8b,
          transparent: true,
          opacity: 0.75,
        }),
      );
      line.visible = false;
      this.scene.add(line);
      this.pool.push({ line, until: 0 });
    }
    this.resize();
    addEventListener("resize", () => this.resize());
  }
  resize() {
    const q =
      this.settings.quality === "auto"
        ? navigator.maxTouchPoints > 0 ||
          (navigator.hardwareConcurrency || 4) <= 4
          ? "low"
          : "medium"
        : this.settings.quality;
    this.quality = q;
    this.webgl.setPixelRatio(
      Math.min(devicePixelRatio, q === "low" ? 1 : q === "high" ? 2 : 1.5),
    );
    this.webgl.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  addModel(id, index) {
    const root = new THREE.Group(),
      mat = new THREE.MeshLambertMaterial({ color: COLORS[index % 6] }),
      dark = new THREE.MeshLambertMaterial({ color: 0x182330 }),
      skin = new THREE.MeshLambertMaterial({ color: 0xd7b494 });
    const part = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(unit, m);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      root.add(mesh);
      return mesh;
    };
    part(0.5, 0.65, 0.35, 0, 1.13, 0, mat);
    part(0.4, 0.38, 0.38, 0, 1.66, 0, skin);
    part(0.42, 0.12, 0.4, 0, 1.87, 0, dark);
    part(0.32, 0.1, 0.02, 0, 1.7, -0.2, dark);
    const legs = [
      part(0.19, 0.7, 0.22, -0.14, 0.42, 0, dark),
      part(0.19, 0.7, 0.22, 0.14, 0.42, 0, dark),
    ];
    const arms = [
      part(0.16, 0.55, 0.18, -0.35, 1.17, -0.05, mat),
      part(0.16, 0.55, 0.18, 0.35, 1.17, -0.13, mat),
    ];
    arms.forEach((a) => (a.rotation.x = -0.65));
    const gun = rifle();
    gun.scale.setScalar(0.7);
    gun.position.set(0.21, 1.28, -0.36);
    root.add(gun);
    this.scene.add(root);
    const model = { root, legs, arms, gun, last: [0, 0], fired: 0 };
    this.models.set(id, model);
    return model;
  }
  state(s) {
    if (this.history.length && s.round !== this.history.at(-1).round)
      this.history = [];
    this.history.push(s);
    while (this.history.length > 12) this.history.shift();
    this.received = performance.now();
    const ids = new Set(s.players.map((p) => p.id));
    for (const [id, m] of this.models)
      if (!ids.has(id)) {
        this.scene.remove(m.root);
        this.models.delete(id);
      }
  }
  event(e, self) {
    if (e.t !== "shot") return;
    const now = performance.now();
    if (e.id === self) {
      this.recoil = 0.08;
      this.flashTime = now + 45;
    } else {
      const m = this.models.get(e.id);
      if (m) m.fired = now + 60;
    }
    const item = this.pool[this.poolIndex++ % this.pool.length],
      a = item.line.geometry.attributes.position;
    for (let k = 0; k < 3; k++) {
      a.array[k] = e.o[k];
      a.array[k + 3] = e.end[k];
    }
    a.needsUpdate = true;
    item.line.geometry.computeBoundingSphere();
    item.line.visible = true;
    item.until = now + 65;
  }
  correction(old, p) {
    if (
      !old ||
      old.epoch !== p.epoch ||
      Math.hypot(old.x - p.x, old.y - p.y, old.z - p.z) > 3
    ) {
      this.smooth = [0, 0, 0];
      return;
    }
    this.smooth[0] += old.x - p.x;
    this.smooth[1] += old.y - p.y;
    this.smooth[2] += old.z - p.z;
  }
  render(local, controls, snapshot, dt, playing) {
    const now = performance.now();
    if (local && playing) {
      this.weapon.visible = local.hp > 0;
      if (local.epoch !== this.lastEpoch) {
        this.lastEpoch = local.epoch;
        this.smooth = [0, 0, 0];
      }
      for (let k = 0; k < 3; k++) this.smooth[k] *= Math.exp(-dt * 16);
      this.camera.position.set(
        local.x + this.smooth[0],
        local.y + C.eye + this.smooth[1],
        local.z + this.smooth[2],
      );
      this.camera.rotation.y = controls.yaw;
      this.camera.rotation.x = controls.pitch;
      const speed = Math.hypot(local.vx, local.vz),
        bob = local.grounded
          ? Math.sin(now * 0.012) * Math.min(speed * 0.0016, 0.012)
          : 0;
      this.recoil *= Math.exp(-dt * 20);
      const reloading = local.reload > snapshot?.time;
      const reloadProgress = reloading
        ? 1 - (local.reload - snapshot.time) / C.reloadSeconds
        : 0;
      this.weapon.position.set(
        0.27,
        -0.25 +
          bob -
          (reloading ? 0.16 * Math.sin(reloadProgress * Math.PI) : 0),
        -0.55 + this.recoil,
      );
      this.weapon.rotation.set(
        this.recoil +
          (reloading ? -0.5 * Math.sin(reloadProgress * Math.PI) : 0),
        0,
        reloading ? -0.25 : 0,
      );
      this.weapon.userData.flash.visible = now < this.flashTime;
    } else {
      this.weapon.visible = false;
      this.camera.position.set(14, 5, 16);
      this.camera.lookAt(0, 0, 0);
    }
    if (snapshot) {
      const target =
        snapshot.time + (now - this.received) / 1000 - C.interpolation;
      let a = this.history[0] || snapshot,
        b = snapshot;
      for (let i = 1; i < this.history.length; i++) {
        if (this.history[i].time >= target) {
          a = this.history[i - 1];
          b = this.history[i];
          break;
        }
        a = this.history[i];
      }
      const alpha = Math.max(
        0,
        Math.min(1, (target - a.time) / Math.max(0.001, b.time - a.time)),
      );
      for (const p of snapshot.players) {
        if (p.id === local?.id) {
          const own = this.models.get(p.id);
          if (own) own.root.visible = false;
          continue;
        }
        const m = this.models.get(p.id) || this.addModel(p.id, p.index);
        m.root.visible = p.hp > 0;
        if (!m.root.visible) continue;
        const from = a.players.find((v) => v.id === p.id) || p,
          to = b.players.find((v) => v.id === p.id) || p,
          t = from.epoch === to.epoch ? alpha : 1;
        const x = from.x + (to.x - from.x) * t,
          y = from.y + (to.y - from.y) * t,
          z = from.z + (to.z - from.z) * t;
        m.root.position.set(x, y, z);
        m.root.rotation.y = from.yaw + wrap(to.yaw - from.yaw) * t;
        const moving = Math.hypot(p.vx, p.vz) > 0.2,
          walk =
            moving && p.grounded ? Math.sin(now * 0.012 + p.index) * 0.45 : 0;
        m.legs[0].rotation.x = p.grounded ? walk : 0.35;
        m.legs[1].rotation.x = p.grounded ? -walk : 0.6;
        m.arms[0].rotation.x = -0.65 + walk * 0.1;
        m.arms[1].rotation.x = -0.65 - walk * 0.1;
        m.gun.rotation.x = -p.pitch * 0.5;
        m.gun.userData.flash.visible = now < m.fired;
      }
    }
    for (const p of this.pool) if (now > p.until) p.line.visible = false;
    this.webgl.render(this.scene, this.camera);
  }
  clear() {
    for (const m of this.models.values()) this.scene.remove(m.root);
    this.models.clear();
    this.history = [];
    this.smooth = [0, 0, 0];
  }
}
