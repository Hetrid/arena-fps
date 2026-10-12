import * as THREE from "three";
import { MAPS } from "./maps.js";
export function buildMap(scene, id = "relay") {
  const map = MAPS[id] || MAPS.relay,
    root = new THREE.Group(),
    p = map.palette;
  const mats = {
      wall: new THREE.MeshLambertMaterial({ color: p.wall }),
      building: new THREE.MeshLambertMaterial({ color: p.wall }),
      crate: new THREE.MeshLambertMaterial({ color: p.crate }),
      container: new THREE.MeshLambertMaterial({ color: p.crate }),
      barrier: new THREE.MeshLambertMaterial({ color: 0x929fa1 }),
    },
    unit = new THREE.BoxGeometry(1, 1, 1),
    trim = new THREE.MeshLambertMaterial({ color: 0x263740 }),
    glass = new THREE.MeshLambertMaterial({ color: 0x334c62 }),
    accent = new THREE.MeshBasicMaterial({ color: p.accent });
  const block = (x, y, z, w, h, d, mat) => {
    const m = new THREE.Mesh(unit, mat);
    m.position.set(x, y, z);
    m.scale.set(w, h, d);
    root.add(m);
    return m;
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(map.width, map.depth),
    new THREE.MeshLambertMaterial({ color: p.floor }),
  );
  floor.rotation.x = -Math.PI / 2;
  root.add(floor);
  for (const b of map.boxes) {
    block(...b.slice(0, 6), mats[b[6]] || mats.building);
    if (b[6] === "building" || b[6] === "container") {
      block(
        b[0],
        b[1] + b[4] / 2 + 0.08,
        b[2],
        b[3] + 0.15,
        0.16,
        b[5] + 0.15,
        trim,
      );
      for (const side of [-1, 1]) {
        block(
          b[0],
          1.5,
          b[2] + side * (b[5] / 2 + 0.01),
          Math.max(0.5, b[3] - 0.5),
          0.045,
          0.04,
          accent,
        );
        if (b[6] === "container") {
          for (let x = -b[3] / 2 + 0.6; x < b[3] / 2; x += 1.3)
            block(
              b[0] + x,
              b[1],
              b[2] + side * (b[5] / 2 + 0.025),
              0.06,
              b[4] - 0.3,
              0.05,
              trim,
            );
        } else {
          for (let x = -b[3] / 2 + 1.5; x < b[3] / 2 - 0.8; x += 3.5) {
            block(
              b[0] + x,
              3.4,
              b[2] + side * (b[5] / 2 + 0.025),
              1.9,
              1.15,
              0.05,
              trim,
            );
            block(
              b[0] + x,
              3.4,
              b[2] + side * (b[5] / 2 + 0.06),
              1.7,
              0.95,
              0.025,
              glass,
            );
          }
        }
      }
    } else if (b[6] === "crate")
      for (const side of [-0.5, 0.5])
        block(b[0], b[1] + side, b[2], b[3] + 0.03, 0.07, b[5] + 0.03, trim);
  }
  const grid = new THREE.GridHelper(
    Math.max(map.width, map.depth),
    32,
    0x54717b,
    0x465c66,
  );
  grid.position.y = 0.015;
  root.add(grid);
  const label = (text, x, y, z, color) => {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#142636";
    ctx.fillRect(0, 0, 256, 128);
    ctx.font = "bold 80px sans-serif";
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 95);
    const tex = new THREE.CanvasTexture(canvas),
      m = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 2),
        new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
      );
    m.position.set(x, y, z);
    root.add(m);
  };
  for (const site of map.sites) {
    for (let stripe = -3; stripe <= 3; stripe++)
      block(
        site.x + stripe * 1.1,
        0.025,
        site.z + site.r - 0.8,
        0.5,
        0.02,
        1,
        accent,
      );
    const mat = new THREE.MeshBasicMaterial({
        color: site.name === "A" ? 0x7bdbe7 : 0xf4b37e,
        transparent: true,
        opacity: 0.22,
      }),
      marker = new THREE.Mesh(
        new THREE.RingGeometry(site.r - 0.5, site.r, 48),
        mat,
      );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(site.x, 0.03, site.z);
    root.add(marker);
    label(
      site.name,
      site.x,
      3,
      site.z,
      site.name === "A" ? "#7bdbe7" : "#f4b37e",
    );
    block(
      site.x + 0.2,
      0.022,
      site.z + 0.2,
      3,
      0.02,
      3,
      new THREE.MeshBasicMaterial({
        color: p.accent,
        transparent: true,
        opacity: 0.12,
      }),
    );
  }
  for (const [team, positions] of Object.entries(map.spawns)) {
    const [x, z] = positions[0];
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(2, 2.15, 24),
      new THREE.MeshBasicMaterial({
        color: team === "A" ? 0x7bdbe7 : 0xf4b37e,
      }),
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(x, 0.04, z);
    root.add(mark);
  }
  // Decorative ducts, rooftop silhouettes and canopy supports stay above playable space.
  for (const [x, y, z] of map.decorations || []) {
    block(x, y + 0.5, z, 1, 0.7, 3, trim);
    block(x, y + 1, z, 0.2, 0.5, 0.2, accent);
  }
  scene.add(root);
  return root;
}
export function disposeGroup(group) {
  const geometries = new Set(),
    materials = new Set();
  textures(group, materials, geometries);
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    m.map?.dispose();
    m.dispose();
  }
  group.parent?.remove(group);
}
function textures(root, mats, geos) {
  root.traverse((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => mats.add(m));
      else mats.add(o.material);
    }
  });
}
