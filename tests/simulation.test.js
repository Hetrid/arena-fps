import test from "node:test";
import assert from "node:assert/strict";
import { HostGame, ranking } from "../js/dm/game.js";
import { C } from "../js/dm/config.js";
import { MAPS } from "../js/dm/maps.js";
import { WEAPONS, weaponSlot } from "../js/dm/catalog.js";
import { makePlayer, move, idleInput } from "../js/dm/player.js";
import { setMap, visible, COLLIDERS } from "../js/dm/world.js";
import { Navigation } from "../js/dm/bots.js";
import { assist } from "../js/dm/aimAssist.js";
const ticks = (g, n) => {
  for (let i = 0; i < n; i++) g.tick();
};
const setup = (bots = 0) => {
  const g = new HostGame();
  g.add("human", "Human");
  g.configure({ bots });
  g.start();
  return g;
};
test("all three maps have traversable bot routes and valid grid nodes", () => {
  for (const map of Object.values(MAPS)) {
    const nav = new Navigation(map),
      a = map.spawns.A[0],
      b = map.spawns.B[0],
      route = nav.route(...a, ...b);
    assert.ok(route.length > 0, map.id);
    for (const [x, z] of route) {
      assert.ok(nav.clear[nav.index(x, z)]);
      assert.ok(Math.abs(x) < map.width / 2 && Math.abs(z) < map.depth / 2);
    }
  }
});
test("deathmatch begins immediately with live bots and no tactical data", () => {
  const g = setup(5),
    s = g.snapshot();
  assert.equal(s.phase, "playing");
  assert.equal(s.players.length, 6);
  assert.equal(s.players.filter((p) => p.bot).length, 5);
  assert.equal(s.mode, "ffa");
  for (const key of ["bomb", "credits", "agents", "effects", "projectiles"])
    assert.equal(key in s, false);
  assert.equal("grenades" in s.players[0], false);
});
test("bots move through the arena and stay inside bounds", () => {
  const g = setup(5),
    before = new Map([...g.players.values()].map((p) => [p.id, [p.x, p.z]]));
  ticks(g, 180);
  for (const p of g.players.values()) {
    assert.ok(Math.abs(p.x) < g.mapData().width / 2);
    assert.ok(Math.abs(p.z) < g.mapData().depth / 2);
    if (p.bot)
      assert.ok(
        Math.hypot(p.x - before.get(p.id)[0], p.z - before.get(p.id)[1]) > 0.5,
      );
  }
});
test("bot perception respects cover and reaction delay", () => {
  const g = setup(1),
    human = g.players.get("human"),
    bot = [...g.players.values()].find((p) => p.bot);
  Object.assign(human, { x: -27, z: -20, y: 0, shield: 0 });
  Object.assign(bot, { x: -27, z: 20, y: 0, yaw: 0, shield: 0 });
  assert.equal(g.brains.input(bot, C.tick).fire, false);
  Object.assign(human, { x: -60, z: 0 });
  Object.assign(bot, { x: -60, z: -8, yaw: Math.PI });
  g.brains.states.clear();
  assert.equal(g.brains.input(bot, C.tick).fire, false);
});
test("bots fire authoritatively and can kill a human", () => {
  const g = setup(1),
    human = g.players.get("human"),
    bot = [...g.players.values()].find((p) => p.bot);
  Object.assign(human, { x: -60, z: 0, y: 0, hp: 20, shield: 0 });
  Object.assign(bot, { x: -60, z: -8, y: 0, yaw: Math.PI, shield: 0 });
  g.brains.states.clear();
  ticks(g, 240);
  assert.ok(human.deaths > 0);
  assert.ok(bot.kills > 0);
});
test("bot number and difficulty can be changed during a match", () => {
  const g = setup(5);
  g.configure({ bots: 2, difficulty: "hard" });
  assert.equal(g.players.size, 3);
  assert.equal(g.difficulty, "hard");
  g.configure({ bots: 0 });
  assert.equal(g.players.size, 1);
  g.configure({ bots: 99, difficulty: "invalid" });
  assert.equal(g.players.size, 10);
  assert.equal(g.difficulty, "hard");
});
test("humans replace bots in a full room and bots refill after humans leave", () => {
  const g = setup(9);
  assert.ok(g.add("guest", "Guest"));
  assert.equal(g.humanCount(), 2);
  assert.equal(g.players.size, 10);
  assert.equal([...g.players.values()].filter((p) => p.bot).length, 8);
  g.remove("guest");
  assert.equal(g.players.size, 10);
  assert.equal([...g.players.values()].filter((p) => p.bot).length, 9);
});
test("all eighteen guns equip into the correct slot without credits", () => {
  const g = setup(),
    p = g.players.get("human");
  assert.equal(Object.keys(WEAPONS).length, 18);
  for (const [id, w] of Object.entries(WEAPONS)) {
    assert.ok(g.equip(p.id, id));
    assert.equal(p.weapons[weaponSlot(id)], id);
    assert.equal(p.weapon, id);
    assert.equal(p.ammo, w.mag);
  }
  assert.equal(g.equip(p.id, "frag"), false);
  assert.equal(g.equip(p.id, "smoke"), false);
  assert.equal(g.equip(p.id, "flash"), false);
});
test("human fire consumes ammo and awards shared kills", () => {
  const events = [],
    g = new HostGame((e) => events.push(e));
  g.add("a", "A");
  g.add("b", "B");
  g.start();
  const a = g.players.get("a"),
    b = g.players.get("b");
  Object.assign(a, { x: -60, z: 0, yaw: 0, shield: 0 });
  Object.assign(b, { x: -60, z: -6, shield: 0, hp: 1 });
  g.receive("a", [{ ...idleInput(a, 1), fire: true }]);
  g.tick();
  assert.equal(b.hp, 0);
  assert.equal(a.kills, 1);
  assert.equal(a.ammo, 29);
  assert.ok(events.some((e) => e.t === "kill"));
});
test("solid cover blocks shots and visibility", () => {
  const g = new HostGame();
  g.add("a", "A");
  g.add("b", "B");
  g.start();
  const a = g.players.get("a"),
    b = g.players.get("b");
  Object.assign(a, { x: -27, z: 20, yaw: 0, shield: 0 });
  Object.assign(b, { x: -27, z: -20, shield: 0 });
  g.receive("a", [{ ...idleInput(a, 1), fire: true }]);
  g.tick();
  assert.equal(b.hp, 100);
  assert.equal(visible([-27, 1.5, 20], [-27, 1.5, -20]), false);
});
test("death respawns after three seconds, retaining selected weapons", () => {
  const g = setup(1),
    p = g.players.get("human");
  g.equip(p.id, "horizon");
  p.shield = 0;
  g.damage(null, p, 200);
  const epoch = p.epoch;
  ticks(g, 89);
  assert.equal(p.hp, 0);
  ticks(g, 3);
  assert.equal(p.hp, 100);
  assert.equal(p.weapon, "horizon");
  assert.equal(p.ammo, WEAPONS.horizon.mag);
  assert.ok(p.epoch > epoch);
  assert.ok(p.shield > g.time);
});
test("semi-auto requires release; reload respects magazine and reserves", () => {
  const g = setup(),
    p = g.players.get("human");
  g.equip(p.id, "ironclad");
  p.nextShot = 0;
  g.receive(p.id, [{ ...idleInput(p, 1), fire: true }]);
  g.tick();
  const ammo = p.ammo;
  ticks(g, 15);
  assert.equal(p.ammo, ammo);
  g.receive(p.id, [{ ...idleInput(p, 2), fire: false }]);
  g.tick();
  g.receive(p.id, [{ ...idleInput(p, 3), fire: true }]);
  g.tick();
  assert.equal(p.ammo, ammo - 1);
  g.receive(p.id, [{ ...idleInput(p, 4), reload: true }]);
  g.tick();
  ticks(g, 60);
  assert.equal(p.ammo, 6);
  assert.equal(p.reserve, 34);
});
test("ADS burst finishes three rounds after trigger release", () => {
  const g = setup(),
    p = g.players.get("human");
  g.equip(p.id, "arbiter");
  p.nextShot = 0;
  g.receive(p.id, [{ ...idleInput(p, 1), fire: true, ads: true }]);
  g.tick();
  g.receive(p.id, [{ ...idleInput(p, 2), fire: false, ads: true }]);
  ticks(g, 10);
  assert.equal(p.ammo, 21);
  assert.equal(p.burstRemaining, 0);
});
test("first to 25 and timer results; restart resets scores", () => {
  const g = setup(2),
    p = g.players.get("human");
  p.kills = 25;
  g.tick();
  assert.equal(g.phase, "results");
  assert.equal(g.winner, p.id);
  g.start();
  assert.equal(g.phase, "playing");
  assert.equal(p.kills, 0);
  g.end = g.time;
  g.tick();
  assert.equal(g.phase, "results");
  assert.ok(g.winner);
});
test("late joins spawn immediately and room holds ten participants", () => {
  const g = setup();
  for (let i = 1; i < 10; i++) {
    const p = g.add("p" + i, "P");
    assert.equal(p.hp, 100);
  }
  assert.equal(g.add("overflow", "X"), null);
  assert.equal(g.phase, "playing");
});
test("movement, diagonal speed, friction, jump and bounds", () => {
  setMap("relay");
  const p = makePlayer("p", "P");
  p.x = -60;
  p.z = 0;
  for (let i = 0; i < 30; i++) move(p, { ...idleInput(p), mx: 1, mz: 1 });
  assert.ok(Math.hypot(p.vx, p.vz) <= C.speed + 0.001);
  for (let i = 0; i < 20; i++) move(p, idleInput(p));
  assert.equal(p.vx, 0);
  move(p, { ...idleInput(p), jump: true });
  assert.ok(p.y > 0);
  for (let i = 0; i < 70; i++) move(p, idleInput(p));
  assert.equal(p.y, 0);
  p.x = 63;
  p.z = 62;
  for (let i = 0; i < 30; i++) move(p, { ...idleInput(p), mx: 1, mz: -1 });
  assert.ok(p.x <= 64 - 0.5 - C.radius);
});
test("invalid, duplicate, old-round inputs and removed utility actions are rejected", () => {
  const g = setup(),
    p = g.players.get("human");
  g.receive(p.id, [{ ...idleInput(p, 1), mx: NaN }]);
  assert.equal(g.inputs.get(p.id).queue.length, 0);
  g.receive(p.id, [{ ...idleInput(p, 2), throw: "frag", ability: true }]);
  g.tick();
  assert.equal(p.ack, 2);
  assert.equal("throw" in g.inputs.get(p.id).last, false);
  g.receive(p.id, [idleInput(p, 2), idleInput(p, 3)], g.round - 1);
  assert.equal(g.inputs.get(p.id).queue.length, 0);
});
test("stale input stops movement and snapshots isolate nested inventories", () => {
  const g = setup(),
    p = g.players.get("human");
  g.receive(p.id, [{ ...idleInput(p, 1), mz: 1 }]);
  ticks(g, 20);
  assert.ok(Math.abs(p.vz) < 0.1);
  const snap = g.snapshot();
  snap.players[0].magazines.specter.ammo = 0;
  assert.notEqual(p.magazines.specter.ammo, 0);
});
test("mobile aim assist runs only for visible live opponents", () => {
  setMap("relay");
  const local = { id: "a", x: -60, y: 0, z: 0, hp: 100 },
    target = { id: "b", x: -60, y: 0, z: -10, hp: 100 };
  assert.ok(assist(local, [target], 0, -0.038, 0.1).friction < 1);
  assert.equal(
    assist(local, [{ ...target, hp: 0 }], 0, -0.038, 0.1).friction,
    1,
  );
  assert.equal(assist(local, [target], 0, -0.038, 0.1, 1, false).friction, 1);
});
