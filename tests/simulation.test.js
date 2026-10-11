import test from "node:test";
import assert from "node:assert/strict";
import { C } from "../js/config.js";
import { HostGame, ranking } from "../js/game.js";
import { makePlayer, move, idleInput, validInput } from "../js/player.js";
import { visible, wallDistance, SPAWNS, COLLIDERS } from "../js/world.js";
import { assist } from "../js/aimAssist.js";
const step = (p, extra = {}) => move(p, { ...idleInput(p), ...extra });
test("fixed movement accelerates, decelerates and normalizes diagonals", () => {
  const p = makePlayer("a", "a");
  p.x = -17;
  p.z = 0;
  for (let i = 0; i < 30; i++) step(p, { mz: 1 });
  assert.ok(p.z < -4 && p.z > -6);
  for (let i = 0; i < 20; i++) step(p);
  assert.ok(Math.abs(p.vz) < 1e-8);
  const d = makePlayer("d", "d");
  d.x = -17;
  d.z = -16;
  for (let i = 0; i < 20; i++) step(d, { mx: 1, mz: 1 });
  assert.ok(Math.hypot(d.vx, d.vz) <= C.speed + 0.01);
});
test("outer walls and central cover stop movement and bullets", () => {
  const p = makePlayer("a", "a");
  p.x = -17;
  p.z = 0;
  for (let i = 0; i < 200; i++) step(p, { mx: -1, sprint: true });
  assert.ok(p.x >= -19.17);
  const q = makePlayer("b", "b");
  q.z = 8;
  for (let i = 0; i < 100; i++) step(q, { mz: 1 });
  assert.ok(q.z >= 3 + C.radius - 0.01);
  assert.equal(visible([0, 1.6, 8], [0, 1.6, -8]), false);
  assert.ok(wallDistance([0, 1.6, 8], [0, 0, -1]) < 6);
});
test("jump has gravity, no mid-air jumping and lands stably", () => {
  const p = makePlayer("a", "a");
  p.x = -17;
  p.z = 0;
  step(p, { jump: true });
  const initial = p.vy;
  step(p, { jump: true });
  assert.ok(p.vy < initial);
  for (let i = 0; i < 60; i++) step(p);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
});
test("spawn points are free of all geometry", () => {
  for (const [x, z] of SPAWNS)
    for (const b of COLLIDERS)
      assert.ok(
        !(
          x + C.radius > b[0] &&
          x - C.radius < b[3] &&
          z + C.radius > b[2] &&
          z - C.radius < b[5]
        ),
      );
});
test("host validates input, limits simulation speed and drops stale input", () => {
  const g = new HostGame();
  const p = g.add("a", "a");
  g.start();
  p.x = -17;
  p.z = 0;
  g.receive("a", [{ ...idleInput(p, 1), mx: Infinity }]);
  assert.equal(g.inputs.get("a").queue.length, 0);
  assert.equal(validInput({ ...idleInput(p, 1), mx: 4 }), false);
  g.receive(
    "a",
    Array.from({ length: 20 }, (_, i) => ({ ...idleInput(p, i + 1), mz: 1 })),
  );
  g.tick();
  assert.ok(Math.abs(p.z) < 0.2);
  assert.ok(g.inputs.get("a").queue.length <= 11);
  for (let i = 0; i < 100; i++) g.tick();
  assert.ok(Math.abs(p.vz) < 1e-8);
});
test("body damage, ammo, fire rate, kills, death and respawn are authoritative", () => {
  const events = [],
    g = new HostGame((e) => events.push(e));
  const a = g.add("a", "a"),
    b = g.add("b", "b");
  g.start();
  Object.assign(a, { x: -17, z: 2, yaw: 0, pitch: -0.06, shield: 0 });
  Object.assign(b, { x: -17, z: -3, shield: 0 });
  g.history = [];
  g.time = 2;
  for (let i = 1; i <= 4; i++) {
    g.receive("a", [{ ...idleInput(a, i), fire: true }]);
    g.tick();
    for (let j = 0; j < 4; j++) g.tick();
  }
  assert.equal(b.hp, 0);
  assert.equal(b.deaths, 1);
  assert.equal(a.kills, 1);
  assert.ok(a.ammo < C.mag);
  assert.equal(events.filter((e) => e.t === "kill").length, 1);
  for (let i = 0; i < 100; i++) g.tick();
  assert.equal(b.hp, 100);
  assert.equal(b.ammo, 30);
  const before = a.ammo;
  g.receive("a", [{ ...idleInput(a, 5), fire: true }]);
  g.tick();
  for (let i = 0; i < 30; i++) g.tick();
  assert.ok(before - a.ammo <= 4, "held shots cease after stale timeout");
});
test("cover blocks combat; reload takes two seconds", () => {
  const g = new HostGame(),
    a = g.add("a", "a"),
    b = g.add("b", "b");
  g.start();
  Object.assign(a, { x: 0, z: 8, yaw: 0, pitch: 0, shield: 0, ammo: 10 });
  Object.assign(b, { x: 0, z: -8, shield: 0 });
  g.time = 2;
  g.shoot(a);
  assert.equal(b.hp, 100);
  g.receive("a", [{ ...idleInput(a, 1), reload: true }]);
  g.tick();
  assert.ok(a.reload > g.time);
  for (let i = 0; i < 50; i++) g.tick();
  assert.equal(a.ammo, 9);
  for (let i = 0; i < 12; i++) g.tick();
  assert.equal(a.ammo, 30);
});
test("room cap, timer, tie rules and synchronized rematch", () => {
  const g = new HostGame();
  for (let i = 0; i < 6; i++) assert.ok(g.add("p" + i, "P" + i));
  assert.equal(g.add("extra", "extra"), null);
  g.start();
  g.players.get("p1").kills = 4;
  g.players.get("p2").kills = 4;
  g.players.get("p1").deaths = 3;
  g.players.get("p2").deaths = 1;
  g.time = g.end;
  g.tick();
  assert.equal(g.phase, "results");
  assert.equal(g.winner, "p2");
  assert.equal(ranking(g.players.values())[0].id, "p2");
  for (let i = 0; i < 5; i++) g.ready("p" + i);
  assert.equal(g.phase, "results");
  g.ready("p5");
  assert.equal(g.phase, "playing");
  assert.equal(g.players.get("p2").kills, 0);
});
test("15 kills ends round; late join receives current round and ammo", () => {
  const g = new HostGame();
  g.add("a", "a");
  g.start();
  g.players.get("a").kills = 15;
  g.tick();
  assert.equal(g.phase, "results");
  g.start();
  for (let i = 0; i < 100; i++) g.tick();
  const p = g.add("b", "b"),
    s = g.snapshot();
  assert.equal(p.hp, 100);
  assert.equal(s.phase, "playing");
  assert.equal(s.round, 2);
  assert.ok(s.remaining < 300);
  assert.ok(s.players.find((x) => x.id === "b"));
});
test("aim assist obeys enable flag, angle cap, range and cover", () => {
  const p = { id: "a", x: -17, y: 0, z: 0, hp: 100 },
    enemy = { id: "b", x: -16.8, y: 0, z: -10, hp: 100 };
  const r = assist(p, [p, enemy], 0, -0.038, 0.1, 1, true);
  assert.ok(r.friction < 1);
  assert.ok(Math.abs(r.yaw) <= C.aimAssist.maxCorrectionPerSecond * 0.1 + 1e-8);
  assert.deepEqual(assist(p, [enemy], 0, 0, 0.1, 1, false), {
    yaw: 0,
    pitch: 0,
    friction: 1,
  });
  assert.equal(assist(p, [{ ...enemy, z: -40 }], 0, 0, 0.1).friction, 1);
  assert.equal(
    assist({ ...p, x: 0, z: 8 }, [{ ...enemy, x: 0, z: -8 }], 0, 0, 0.1)
      .friction,
    1,
  );
  assert.equal(assist(p, [{ ...enemy, x: 5, z: 3 }], 0, 0, 0.1).friction, 1);
});

test("players cannot escape the arena even above wall height", () => {
  const p = makePlayer("a", "a");
  p.x = 18;
  p.y = 4;
  p.z = 18;
  for (let i = 0; i < 30; i++) step(p, { mx: 1, mz: -1, sprint: true });
  assert.ok(Math.abs(p.x) <= 19.5 - C.radius);
  assert.ok(Math.abs(p.z) <= 19.5 - C.radius);
});
