import * as THREE from "three";
import { BOXES } from "./world.js";
export function buildMap(scene) {
  const mats = {
    wall: new THREE.MeshLambertMaterial({ color: 0x3e5163 }),
    core: new THREE.MeshLambertMaterial({ color: 0x637785 }),
    crate: new THREE.MeshLambertMaterial({ color: 0x9c7145 }),
    barrier: new THREE.MeshLambertMaterial({ color: 0x78817b }),
  };
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshLambertMaterial({ color: 0x263b49 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  for (const b of BOXES) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b[3], b[4], b[5]),
      mats[b[6]],
    );
    mesh.position.set(b[0], b[1], b[2]);
    scene.add(mesh);
    if (b[6] === "crate") {
      for (const y of [-0.8, 0.8]) {
        const band = new THREE.Mesh(
          new THREE.BoxGeometry(b[3] + 0.02, 0.07, b[5] + 0.02),
          new THREE.MeshLambertMaterial({ color: 0x5e4834 }),
        );
        band.position.set(b[0], b[1] + y, b[2]);
        scene.add(band);
      }
    }
  }
  const grid = new THREE.GridHelper(40, 20, 0x436175, 0x324c5c);
  grid.position.y = 0.008;
  scene.add(grid);
  const stripe = new THREE.MeshBasicMaterial({ color: 0xb9f36b });
  for (const [x, z] of [
    [-17, -17],
    [17, 17],
    [-17, 17],
    [17, -17],
  ]) {
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.85, 16),
      stripe,
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.015, z);
    scene.add(marker);
  }
  for (const x of [-18, 18])
    for (const z of [-9, 9]) {
      const light = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.22, 4),
        new THREE.MeshBasicMaterial({ color: 0x9fddea }),
      );
      light.position.set(x, 2.7, z);
      scene.add(light);
    }
  scene.add(new THREE.HemisphereLight(0xd6eeff, 0x4b4534, 2.1));
  const sun = new THREE.DirectionalLight(0xfff2d4, 2.3);
  sun.position.set(-10, 20, 9);
  scene.add(sun);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(40, 0.15, 40),
    new THREE.MeshLambertMaterial({ color: 0x1d2b39 }),
  );
  roof.position.y = 7;
  scene.add(roof);
  for (const z of [-12, 0, 12]) {
    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(40, 0.35, 0.25),
      mats.wall,
    );
    beam.position.set(0, 6.5, z);
    scene.add(beam);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.05, 0.8),
      new THREE.MeshBasicMaterial({ color: 0xd4e9ed }),
    );
    panel.position.set(0, 6.28, z);
    scene.add(panel);
  }
}
