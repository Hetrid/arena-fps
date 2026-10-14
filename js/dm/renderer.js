import * as THREE from "three";
import { COLORS, C, wrap } from "./config.js";
import { WEAPONS } from "./catalog.js";
import { MAPS } from "./maps.js";
import { buildMap, disposeGroup } from "./map.js";
import { rifle, viewmodel } from "./weapon.js";
const unit = new THREE.BoxGeometry(1, 1, 1),
  v = new THREE.Vector3();
function releaseTransient(root) {
  const geometry = new Set(),
    materials = new Set();
  root.traverse((o) => {
    if (o.geometry && o.geometry !== unit) geometry.add(o.geometry);
    if (o.material)
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
        materials.add(m),
      );
  });
  geometry.forEach((g) => g.dispose());
  materials.forEach((m) => {
    m.map?.dispose();
    m.dispose();
  });
  root.parent?.remove(root);
}
export class Renderer {
  constructor(canvas, settings) {
    this.settings = settings;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      82,
      innerWidth / innerHeight,
      0.08,
      240,
    );
    this.camera.rotation.order = "YXZ";
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: "high-performance",
    });
    this.webgl.outputColorSpace = THREE.SRGBColorSpace;
    this.webgl.autoClear = false;
    this.scene.add(new THREE.HemisphereLight(0xe4f2ff, 0x6d6b58, 2));
    const sun = new THREE.DirectionalLight(0xffe6c5, 2.2);
    sun.position.set(-20, 50, 15);
    this.scene.add(sun);
    this.viewScene = new THREE.Scene();
    this.viewCamera = new THREE.PerspectiveCamera(
      75,
      innerWidth / innerHeight,
      0.01,
      8,
    );
    this.viewScene.add(new THREE.HemisphereLight(0xffffff, 0x46515f, 3));
    this.weapon = null;
    this.weaponId = null;
    this.mapId = null;
    this.mapRoot = null;
    this.models = new Map();
    this.pool = [];
    this.poolIndex = 0;
    this.history = [];
    this.received = 0;
    this.lastEpoch = -1;
    this.smooth = [0, 0, 0];
    this.recoil = 0;
    this.flashTime = 0;
    this.elapsed = 0;
    for (let i = 0; i < 28; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(new Float32Array(6), 3),
      );
      const line = new THREE.Line(
        g,
        new THREE.LineBasicMaterial({
          color: 0xffdf9a,
          transparent: true,
          opacity: 0.85,
        }),
      );
      line.visible = false;
      this.scene.add(line);
      this.pool.push({ line, until: 0 });
    }
    this.setMap("relay");
    this.resize();
    addEventListener("resize", () => this.resize());
  }
  setMap(id) {
    if (id === this.mapId) return;
    if (this.mapRoot) disposeGroup(this.mapRoot);
    this.mapId = id;
    this.mapRoot = buildMap(this.scene, id);
    const p = MAPS[id].palette;
    this.scene.background = new THREE.Color(p.sky);
    this.scene.fog = new THREE.Fog(p.sky, 60, 190);
    this.history = [];
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
      Math.min(devicePixelRatio, q === "low" ? 1 : q === "high" ? 2 : 1.4),
    );
    this.webgl.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = this.viewCamera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.viewCamera.updateProjectionMatrix();
  }
  setWeapon(id) {
    const key = id;
    if (key === this.weaponId) return;
    if (this.weapon) disposeGroup(this.weapon);
    this.weaponId = key;
    this.weapon = viewmodel(id, new THREE.Color("#79d9ed"));
    this.weapon.position.set(0.25, -0.27, -0.57);
    this.viewScene.add(this.weapon);
  }
  addModel(p) {
    const root = new THREE.Group(),
      teamMat = new THREE.MeshLambertMaterial({
        color: p.bot ? 0xdd8b6b : 0x64c8dc,
      }),
      accentMat = new THREE.MeshLambertMaterial({
        color: COLORS[p.index % 10],
      }),
      dark = new THREE.MeshLambertMaterial({ color: 0x213242 }),
      skin = new THREE.MeshLambertMaterial({ color: 0xcfb193 });
    const part = (w, h, d, x, y, z, m) => {
      const mesh = new THREE.Mesh(unit, m);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, y, z);
      root.add(mesh);
      return mesh;
    };
    part(0.52, 0.65, 0.35, 0, 1.12, 0, teamMat);
    part(0.4, 0.36, 0.36, 0, 1.63, 0, skin);
    part(0.42, 0.1, 0.39, 0, 1.84, 0, dark);
    part(0.33, 0.1, 0.02, 0, 1.67, -0.2, accentMat);
    const legs = [
        part(0.19, 0.72, 0.22, -0.14, 0.4, 0, dark),
        part(0.19, 0.72, 0.22, 0.14, 0.4, 0, dark),
      ],
      arms = [
        part(0.17, 0.55, 0.18, -0.35, 1.16, -0.03, accentMat),
        part(0.17, 0.55, 0.18, 0.35, 1.16, -0.12, accentMat),
      ];
    let gun = rifle(p.weapon);
    gun.scale.setScalar(0.7);
    gun.position.set(0.23, 1.27, -0.38);
    root.add(gun);
    this.scene.add(root);
    const m = {
      root,
      legs,
      arms,
      gun,
      weapon: p.weapon,
      bot: p.bot,
      team: p.team,
      fired: 0,
    };
    this.models.set(p.id, m);
    return m;
  }
  state(s) {
    this.setMap(s.map || "relay");
    if (this.history.length && s.round !== this.history.at(-1).round)
      this.history = [];
    this.history.push(s);
    while (this.history.length > 16) this.history.shift();
    this.received = performance.now();
    const ids = new Set(s.players.map((p) => p.id));
    for (const [id, m] of this.models)
      if (!ids.has(id)) {
        releaseTransient(m.root);
        this.models.delete(id);
      }
  }
  trace(o, end, color = 0xffdf9a, duration = 75) {
    const item = this.pool[this.poolIndex++ % this.pool.length],
      a = item.line.geometry.attributes.position;
    for (let k = 0; k < 3; k++) {
      a.array[k] = o[k];
      a.array[k + 3] = end[k];
    }
    a.needsUpdate = true;
    item.line.geometry.computeBoundingSphere();
    item.line.material.color.setHex(color);
    item.line.visible = true;
    item.until = performance.now() + duration;
  }
  event(e, self) {
    const now = performance.now();
    if (e.t === "shot") {
      if (e.id === self) {
        this.recoil = 0.08;
        this.flashTime = now + 45;
      } else {
        const m = this.models.get(e.id);
        if (m) m.fired = now + 65;
      }
      for (const end of e.rays || [e.end]) if (end) this.trace(e.o, end);
    }
  }

  correction(old, p) {
    if (
      !old ||
      old.epoch !== p.epoch ||
      Math.hypot(old.x - p.x, old.y - p.y, old.z - p.z) > 4
    ) {
      this.smooth = [0, 0, 0];
      return;
    }
    this.smooth[0] += old.x - p.x;
    this.smooth[1] += old.y - p.y;
    this.smooth[2] += old.z - p.z;
  }
  render(local, controls, s, dt, playing) {
    const now = performance.now();
    this.elapsed += dt;
    if (local && playing) {
      if (local.epoch !== this.lastEpoch) {
        this.lastEpoch = local.epoch;
        this.smooth = [0, 0, 0];
      }
      for (let k = 0; k < 3; k++) this.smooth[k] *= Math.exp(-dt * 17);
      let eye = local.crouch ? 1.05 : C.eye,
        x = local.x,
        y = local.y + eye,
        z = local.z;
      this.camera.position.set(
        x + this.smooth[0],
        y + this.smooth[1],
        z + this.smooth[2],
      );
      this.camera.rotation.y = controls.yaw;
      this.camera.rotation.x = controls.pitch;
      const w = WEAPONS[local.weapon] || WEAPONS.specter,
        targetFov = local.ads ? (w.shape === "sniper" ? 28 : 55) : 82;
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 15);
      this.camera.updateProjectionMatrix();
      this.setWeapon(local.weapon);
      this.weapon.visible = local.hp > 0;
      const speed = Math.hypot(local.vx, local.vz),
        bob = local.grounded
          ? Math.sin(now * 0.013) * Math.min(speed * 0.0017, 0.015)
          : 0;
      this.recoil *= Math.exp(-dt * 18);
      const t = s.time + (now - this.received) / 1000,
        reloading = local.reload > t,
        r = reloading ? Math.max(0, 1 - (local.reload - t) / w.reload) : 0,
        ads = local.ads;
      this.weapon.position.set(
        ads ? 0.025 : 0.25,
        ads
          ? -0.17
          : -0.27 + bob - (reloading ? 0.18 * Math.sin(r * Math.PI) : 0),
        -0.57 + this.recoil,
      );
      this.weapon.rotation.set(
        this.recoil + (reloading ? -0.6 * Math.sin(r * Math.PI) : 0),
        0,
        reloading ? -0.25 : 0,
      );
      this.weapon.userData.arms[1].position.y =
        -0.12 - (reloading ? 0.15 * Math.sin(r * Math.PI) : 0);
      this.weapon.userData.flash.visible = now < this.flashTime;
    } else {
      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
      this.camera.position.set(47, 33, 47);
      this.camera.lookAt(0, 0, 0);
      if (this.weapon) this.weapon.visible = false;
    }
    if (s) {
      const ping = local?.ping || 0,
        delay = clampDelay(ping),
        target = s.time + (now - this.received) / 1000 - delay;
      let a = this.history[0] || s,
        b = s;
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
      for (const p of s.players) {
        if (p.id === local?.id) {
          const m = this.models.get(p.id);
          if (m) m.root.visible = false;
          continue;
        }
        let m = this.models.get(p.id) || this.addModel(p);
        if (m.bot !== p.bot) {
          releaseTransient(m.root);
          this.models.delete(p.id);
          m = this.addModel(p);
        }
        m.root.visible = p.hp > 0 && p.connected;
        if (!m.root.visible) continue;
        const from = a.players.find((q) => q.id === p.id) || p,
          to = b.players.find((q) => q.id === p.id) || p,
          t = from.epoch === to.epoch ? alpha : 1;
        m.root.position.set(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          from.z + (to.z - from.z) * t,
        );
        m.root.rotation.y = from.yaw + wrap(to.yaw - from.yaw) * t;
        m.root.scale.y = p.crouch ? 0.67 : 1;
        const walk =
          Math.hypot(p.vx, p.vz) > 0.2 && p.grounded
            ? Math.sin(now * 0.012 + p.index) * 0.45
            : 0;
        m.legs[0].rotation.x = p.grounded ? walk : 0.35;
        m.legs[1].rotation.x = p.grounded ? -walk : 0.6;
        m.arms[0].rotation.x = -0.65 + walk * 0.1;
        m.arms[1].rotation.x = -0.65 - walk * 0.1;
        if (m.weapon !== p.weapon) {
          releaseTransient(m.gun);
          m.gun = rifle(p.weapon);
          m.gun.scale.setScalar(0.7);
          m.gun.position.set(0.23, 1.27, -0.38);
          m.root.add(m.gun);
          m.weapon = p.weapon;
        }
        m.gun.rotation.x = -p.pitch * 0.5;
        m.gun.userData.flash.visible = now < m.fired;
      }
    }
    for (const p of this.pool) if (now > p.until) p.line.visible = false;
    this.webgl.clear();
    this.webgl.render(this.scene, this.camera);
    if (local && playing && local.hp > 0) {
      this.webgl.clearDepth();
      this.webgl.render(this.viewScene, this.viewCamera);
    }
  }
  clear() {
    for (const m of this.models.values()) releaseTransient(m.root);
    this.models.clear();
    this.history = [];
    this.smooth = [0, 0, 0];
  }
}
const clampDelay = (ping) => Math.max(0.08, Math.min(0.16, 0.08 + ping / 2000));
