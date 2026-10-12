import test from "node:test";
import assert from "node:assert/strict";
import { C } from "../js/config.js";
import { MAPS } from "../js/maps.js";
import { WEAPONS, AGENTS } from "../js/catalog.js";
import { HostGame, ranking } from "../js/game.js";
import { makePlayer, move, idleInput, validInput } from "../js/player.js";
import {
  setMap,
  setEffects,
  visible,
  SPAWNS,
  COLLIDERS,
  CURRENT,
} from "../js/world.js";
import { assist } from "../js/aimAssist.js";
const ticks = (g, n) => {
  for (let i = 0; i < n; i++) g.tick();
};
const setup = (mode = "ffa", n = 2) => {
  const g = new HostGame();
  for (let i = 0; i < n; i++) g.add("p" + i, "P" + i);
  g.configure({ mode });
  g.start();
  return g;
};
const step = (p, extra = {}) => move(p, { ...idleInput(p), ...extra });
test("three unique maps have >=10x floor area and all spawns are clear", () => {
  assert.equal(Object.keys(MAPS).length, 3);
  for (const m of Object.values(MAPS)) {
    assert.ok(m.width * m.depth >= 16000);
    setMap(m.id);
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
  }
});
test("every map has traversable routes from both spawns to both sites", () => {
  for (const map of Object.values(MAPS)) {
    setMap(map.id);
    const w = map.width,
      d = map.depth;
    const clear = (x, z) =>
      !COLLIDERS.some(
        (b) =>
          x + C.radius > b[0] &&
          x - C.radius < b[3] &&
          z + C.radius > b[2] &&
          z - C.radius < b[5],
      );
    for (const team of ["A", "B"]) {
      const source = map.spawns[team][0].map(Math.round),
        queue = [source],
        seen = new Set([source.join(",")]);
      let i = 0;
      while (i < queue.length) {
        const [x, z] = queue[i++];
        for (const [dx, dz] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const a = x + dx,
            b = z + dz,
            k = a + "," + b;
          if (
            Math.abs(a) >= w / 2 - 1 ||
            Math.abs(b) >= d / 2 - 1 ||
            seen.has(k) ||
            !clear(a, b)
          )
            continue;
          seen.add(k);
          queue.push([a, b]);
        }
      }
      for (const site of map.sites)
        assert.ok(
          queue.some(([x, z]) => Math.hypot(x - site.x, z - site.z) < site.r),
          map.id + " " + team + " " + site.name,
        );
    }
  }
});
test("movement, friction, diagonal normalization, gravity and no double jump", () => {
  setMap("relay");
  const p = makePlayer("a", "A");
  p.x = -60;
  p.z = 0;
  for (let i = 0; i < 30; i++) step(p, { mz: 1 });
  assert.ok(p.z < -4);
  for (let i = 0; i < 20; i++) step(p);
  assert.ok(Math.abs(p.vz) < 1e-8);
  step(p, { jump: true });
  const vy = p.vy;
  step(p, { jump: true });
  assert.ok(p.vy < vy);
  for (let i = 0; i < 60; i++) step(p);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
  p.x = -60;
  p.z = 0;
  for (let i = 0; i < 20; i++) step(p, { mx: 1, mz: 1 });
  assert.ok(Math.hypot(p.vx, p.vz) <= C.speed + 0.01);
});
test("hard boundaries stop escapes above walls on every map", () => {
  for (const map of Object.values(MAPS)) {
    setMap(map.id);
    const p = makePlayer("p", "p");
    p.x = map.width / 2 - 2;
    p.z = map.depth / 2 - 2;
    p.y = 9;
    for (let i = 0; i < 50; i++) step(p, { mx: 1, mz: -1, sprint: true });
    assert.ok(p.x <= map.width / 2 - 0.5 - C.radius);
    assert.ok(p.z <= map.depth / 2 - 0.5 - C.radius);
  }
});
test("solid cover stops movement and bullets", () => {
  setMap("relay");
  const p = makePlayer("p", "p");
  p.x = -27;
  p.z = 20;
  for (let i = 0; i < 100; i++) step(p, { mz: 1 });
  assert.ok(p.z >= 14 + C.radius - 0.01);
  assert.equal(visible([-27, 1.5, 20], [-27, 1.5, -20]), false);
});
test("host caps room at ten and supports arbitrary split and reassignment", () => {
  const g = new HostGame();
  for (let i = 0; i < 10; i++) assert.ok(g.add("p" + i, "P"));
  assert.equal(g.add("extra", "X"), null);
  g.configure({ targetA: 1 });
  assert.equal([...g.players.values()].filter((p) => p.team === "A").length, 1);
  g.assign("p3", "A");
  assert.equal(g.players.get("p3").team, "A");
  g.configure({ targetA: 3 });
  assert.equal([...g.players.values()].filter((p) => p.team === "A").length, 3);
});
test("map voting selects winner deterministically and is lobby-only", () => {
  const g = new HostGame();
  g.add("a", "a");
  g.add("b", "b");
  g.vote("a", "tideport");
  g.vote("b", "tideport");
  g.start();
  assert.equal(g.map, "tideport");
  assert.equal(g.vote("a", "relay"), false);
  assert.equal(g.configure({ mode: "ffa" }), false);
});
test("buy phase freezes movement, rejects combat and validates currency", () => {
  const g = setup("elimination"),
    p = g.players.get("p0");
  assert.equal(g.phase, "buy");
  const x = p.x,
    z = p.z;
  g.receive(p.id, [{ ...idleInput(p, 1), mx: 1, fire: true }]);
  g.tick();
  assert.equal(p.x, x);
  assert.equal(p.z, z);
  assert.equal(p.ammo, 12);
  assert.equal(g.buy(p.id, "horizon"), false);
  assert.equal(g.buy(p.id, "ironclad"), true);
  assert.equal(p.credits, 0);
  assert.equal(g.buy(p.id, "flash"), false);
  ticks(g, 751);
  assert.equal(g.phase, "playing");
  assert.equal(g.buy(p.id, "sidekick"), false);
});
test("weapon switching, semi-auto gating, ammo and timed reload", () => {
  const g = setup(),
    p = g.players.get("p0");
  g.buy(p.id, "sidekick");
  g.switchWeapon(p, "secondary");
  p.nextShot = 0;
  p.x = -60;
  p.z = 0;
  g.receive(p.id, [{ ...idleInput(p, 1), fire: true }]);
  g.tick();
  const ammo = p.ammo;
  ticks(g, 10);
  assert.equal(p.ammo, ammo);
  g.receive(p.id, [{ ...idleInput(p, 2), fire: false }]);
  g.tick();
  g.receive(p.id, [{ ...idleInput(p, 3), fire: true }]);
  g.tick();
  assert.equal(p.ammo, ammo - 1);
  g.receive(p.id, [{ ...idleInput(p, 4), reload: true }]);
  g.tick();
  assert.ok(p.reload > g.time);
  ticks(g, 45);
  assert.equal(p.ammo, 12);
  assert.ok(p.reserve < 72);
});
test("automatic weapon obeys rate, damage is authoritative and FFA respawns", () => {
  const g = setup(),
    a = g.players.get("p0"),
    b = g.players.get("p1");
  Object.assign(a, { x: -60, z: 3, yaw: 0, pitch: -0.05, shield: 0 });
  Object.assign(b, { x: -60, z: -4, shield: 0, armor: 0 });
  g.time = 2;
  for (let i = 1; i <= 15; i++) {
    g.receive(a.id, [{ ...idleInput(a, i), fire: true }]);
    g.tick();
  }
  assert.equal(b.hp, 0);
  assert.equal(a.kills, 1);
  assert.ok(a.ammo >= 24, "600ish RPM capped");
  g.receive(a.id, [{ ...idleInput(a, 16), fire: false }]);
  ticks(g, 100);
  assert.equal(b.hp, 100);
});
test("armour absorbs damage and ordinary team gunfire cannot hurt teammates", () => {
  const g = setup("elimination", 3),
    a = g.players.get("p0"),
    friend = g.players.get("p1"),
    enemy = g.players.get("p2");
  a.team = friend.team = "A";
  enemy.team = "B";
  friend.shield = enemy.shield = 0;
  friend.armor = 50;
  enemy.armor = 50;
  g.damage(a, friend, 40);
  assert.equal(friend.hp, 100);
  g.damage(a, enemy, 40);
  assert.ok(enemy.hp > 60 && enemy.hp < 100);
  assert.ok(enemy.armor < 50);
});
test("elimination has no respawn, awards economy and keeps surviving gear", () => {
  const g = setup("elimination"),
    a = g.players.get("p0"),
    b = g.players.get("p1");
  a.credits = 9000;
  g.buy(a.id, "sovereign");
  ticks(g, 751);
  b.shield = 0;
  g.damage(a, b, 200);
  g.tick();
  assert.equal(g.phase, "roundend");
  assert.equal(g.scores.A, 1);
  const ac = a.credits,
    bc = b.credits;
  assert.ok(ac > 0 && bc >= 2600);
  ticks(g, 152);
  assert.equal(g.phase, "buy");
  assert.equal(a.weapons.primary, "sovereign");
  assert.equal(b.weapons.primary, null);
  assert.equal(b.hp, 100);
});
test("plant requires site, stillness and continuous hold; defuse wins round", () => {
  const g = setup("sabotage");
  ticks(g, 751);
  const a = g.players.get("p0"),
    b = g.players.get("p1");
  Object.assign(a, { x: -40, z: -20, vx: 0, vz: 0 });
  g.world();
  for (let i = 0; i < 95; i++) g.objective(a, { interact: true }, C.tick);
  assert.ok(g.bomb);
  assert.equal(g.bomb.site, "A");
  Object.assign(b, { x: a.x, z: a.z, vx: 0, vz: 0 });
  for (let i = 0; i < 152; i++) g.objective(b, { interact: true }, C.tick);
  assert.equal(g.phase, "roundend");
  assert.equal(g.roundWinner, "B");
});
test("planted objective survives attacker elimination and detonates", () => {
  const g = setup("sabotage");
  ticks(g, 751);
  const a = g.players.get("p0");
  g.bomb = { x: -40, z: -20, site: "A", explode: g.time + 0.2 };
  a.hp = 0;
  ticks(g, 3);
  assert.equal(g.phase, "playing");
  ticks(g, 6);
  assert.equal(g.roundWinner, "A");
});
test("sabotage timeout awards defenders; match ends at round goal", () => {
  const g = setup("sabotage");
  ticks(g, 751);
  g.time = g.end;
  g.tick();
  assert.equal(g.roundWinner, "B");
  g.scores.B = g.goal - 1;
  g.beginBuy();
  g.phase = "playing";
  g.endRound("B", "Test");
  assert.equal(g.phase, "results");
  assert.equal(g.winner, "B");
});
test("late tactical join spectates until the next buy phase", () => {
  const g = setup("elimination");
  ticks(g, 751);
  const p = g.add("late", "Late");
  assert.equal(p.hp, 0);
  g.beginBuy();
  assert.equal(p.hp, 100);
  const s = g.snapshot();
  assert.equal(s.mode, "elimination");
  assert.equal(s.players.length, 3);
  assert.equal(s.phase, "buy");
});
test("TDM scores kills; FFA timers/tie order and synchronized rematch", () => {
  const t = setup("tdm"),
    a = t.players.get("p0"),
    b = t.players.get("p1");
  b.shield = 0;
  t.damage(a, b, 300);
  assert.equal(t.scores.A, 1);
  const g = setup();
  g.players.get("p1").kills = 3;
  g.players.get("p0").kills = 3;
  g.players.get("p0").deaths = 2;
  g.time = g.end;
  g.tick();
  assert.equal(g.winner, "p1");
  g.ready("p0");
  assert.equal(g.phase, "results");
  g.ready("p1");
  assert.equal(g.phase, "playing");
  assert.equal(g.players.get("p0").kills, 0);
});
test("all eighteen weapons have working host data; grenade inventory is bounded", () => {
  assert.equal(Object.keys(WEAPONS).length, 18);
  const g = setup(),
    p = g.players.get("p0");
  for (const [id, w] of Object.entries(WEAPONS)) {
    g.buy(p.id, id);
    assert.ok(w.mag > 0 && w.rate > 0);
    const slot = w.slot || (w.shape === "pistol" ? "secondary" : "primary");
    g.switchWeapon(p, slot);
    assert.equal(p.ammo, w.mag);
  }
  g.buy(p.id, "flash");
  assert.equal(p.grenades.flash, 2);
  assert.equal(g.buy(p.id, "flash"), false);
});
test("grenade fuses create smoke; smoke blocks assistance but not bullets", () => {
  const g = setup(),
    p = g.players.get("p0");
  Object.assign(p, { x: -60, z: 0, yaw: 0, pitch: 0 });
  g.throwGrenade(p, "smoke");
  ticks(g, 46);
  assert.equal(g.projectiles.length, 0);
  assert.ok(g.effects.some((e) => e.kind === "smoke"));
  g.effects = [
    {
      id: 99,
      kind: "smoke",
      x: -60,
      y: 1.5,
      z: -5,
      radius: 3,
      expires: g.time + 12,
    },
  ];
  g.world();
  assert.equal(visible([-60, 1.5, 0], [-60, 1.5, -10]), false);
  assert.equal(visible([-60, 1.5, 0], [-60, 1.5, -10], false), true);
  const target = { id: "b", x: -60, y: 0, z: -10, hp: 100 };
  assert.equal(assist(p, [target], 0, -0.038, 0.1).friction, 1);
});
test("flash respects cover, distance and facing direction", () => {
  const g = setup(),
    a = g.players.get("p0"),
    b = g.players.get("p1");
  Object.assign(a, { x: -60, z: 0, yaw: 0, pitch: 0 });
  Object.assign(b, { x: -60, z: 0, yaw: Math.PI, pitch: 0 });
  g.detonate({ kind: "flash", owner: a.id, x: -60, y: 1.6, z: -5 });
  assert.ok(a.flashDuration > b.flashDuration);
  a.flashUntil = 0;
  Object.assign(a, { x: -27, z: 20 });
  g.detonate({ kind: "flash", owner: b.id, x: -27, y: 1.6, z: -20 });
  assert.equal(a.flashUntil, 0);
});
test("ten agent signatures are functional and charges/cooldowns are enforced", () => {
  assert.equal(Object.keys(AGENTS).length, 10);
  for (const [id, agent] of Object.entries(AGENTS)) {
    const g = setup(),
      p = g.players.get("p0");
    Object.assign(p, {
      agent: id,
      charges: agent.charges,
      x: -60,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 40,
      abilityCooldown: 0,
    });
    const epoch = p.epoch;
    assert.equal(g.ability(p), true, id);
    assert.equal(p.charges, agent.charges - 1);
    assert.equal(g.ability(p), false, "cooldown " + id);
    if (["smoke", "flash", "fire", "slow"].includes(agent.kind))
      assert.equal(g.projectiles[0].kind, agent.kind);
    if (agent.kind === "heal") assert.equal(p.hp, 90);
    if (agent.kind === "dash") assert.ok(p.dashUntil > g.time);
    if (agent.kind === "teleport") {
      assert.ok(p.epoch > epoch);
      assert.ok(p.z < 0);
    }
    if (["wall", "turret", "reveal"].includes(agent.kind))
      assert.ok(g.effects.some((e) => e.kind === agent.kind));
  }
});
test("deployed cover blocks bullets and movement; sentry attacks visible enemies", () => {
  const g = setup(),
    a = g.players.get("p0"),
    b = g.players.get("p1");
  Object.assign(a, { x: -60, z: 0, agent: "bulwark", charges: 1, yaw: 0 });
  g.ability(a);
  g.world();
  assert.equal(visible([-60, 1.5, 0], [-60, 1.5, -9]), false);
  g.effects = [];
  Object.assign(a, { agent: "bastion", charges: 1, abilityCooldown: 0 });
  g.ability(a);
  Object.assign(b, { x: -60, z: -9, shield: 0 });
  g.world();
  const before = b.hp;
  g.tickEffects(C.tick);
  assert.ok(b.hp < before);
});
test("slow field reduces speed and fire field deals damage including allies", () => {
  const g = setup("tdm", 3),
    p = g.players.get("p0");
  Object.assign(p, { x: -60, z: 0, shield: 0 });
  g.effects = [
    { id: 1, kind: "slow", x: -60, y: 0, z: 0, radius: 6, expires: g.time + 8 },
  ];
  g.receive(p.id, [{ ...idleInput(p, 1), mz: 1 }]);
  g.tick();
  assert.equal(p.slow, 0.5);
  const friend = g.players.get("p1");
  friend.team = p.team;
  Object.assign(friend, { x: -60, z: 0, shield: 0 });
  g.effects = [
    {
      id: 2,
      kind: "fire",
      owner: p.id,
      team: p.team,
      x: -60,
      y: 0,
      z: 0,
      radius: 5,
      expires: g.time + 8,
    },
  ];
  for (let i = 0; i < 30; i++) g.tickEffects(C.tick);
  assert.ok(friend.hp < 100);
});
test("mobile assistance rejects teammates, blind players, cover and out-of-range targets", () => {
  setMap("relay");
  const p = {
      id: "a",
      x: -60,
      y: 0,
      z: 0,
      hp: 100,
      team: "A",
      flashUntil: 0,
      serverTime: 1,
    },
    e = { id: "b", x: -59.8, y: 0, z: -10, hp: 100, team: "B" };
  const r = assist(p, [e], 0, -0.038, 0.1, 1, true, "tdm");
  assert.ok(r.friction < 1);
  assert.ok(Math.abs(r.yaw) <= C.aimAssist.maxCorrectionPerSecond * 0.1 + 1e-8);
  assert.equal(
    assist(p, [{ ...e, team: "A" }], 0, -0.038, 0.1, 1, true, "tdm").friction,
    1,
  );
  assert.equal(
    assist({ ...p, flashUntil: 2 }, [e], 0, -0.038, 0.1).friction,
    1,
  );
  assert.equal(assist(p, [{ ...e, z: -50 }], 0, 0, 0.1).friction, 1);
});
test("invalid input, stale controls and snapshot deep copies are safe", () => {
  const g = setup(),
    p = g.players.get("p0");
  assert.equal(validInput({ ...idleInput(p, 1), mx: Infinity }), false);
  g.receive(p.id, [{ ...idleInput(p, 1), mz: 1 }]);
  g.tick();
  ticks(g, 100);
  assert.ok(Math.abs(p.vz) < 1e-8);
  const s = g.snapshot();
  s.players[0].grenades.flash = 999;
  s.players[0].magazines[p.weapon].ammo = 999;
  assert.ok(p.grenades.flash < 3);
  assert.ok(p.magazines[p.weapon].ammo < 999);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(g.snapshot())));
});

test("ADS burst completes three shots after release and weapon switching cancels it", () => {
  const g = setup(),
    p = g.players.get("p0");
  g.buy(p.id, "arbiter");
  p.nextShot = 0;
  g.receive(p.id, [{ ...idleInput(p, 1), fire: true, ads: true }]);
  g.tick();
  assert.equal(p.ammo, 23);
  assert.equal(p.burstRemaining, 2);
  g.receive(p.id, [{ ...idleInput(p, 2), fire: false, ads: true }]);
  ticks(g, 10);
  assert.equal(p.ammo, 21);
  assert.equal(p.burstRemaining, 0);
  ticks(g, 15);
  g.receive(p.id, [{ ...idleInput(p, 3), fire: true, ads: true }]);
  g.tick();
  assert.equal(p.burstRemaining, 2);
  g.switchWeapon(p, "secondary");
  assert.equal(p.burstRemaining, 0);
});
test("friendly incendiary kills grant no credits or kills; dead players lose purchased utility", () => {
  const g = setup("elimination", 3),
    a = g.players.get("p0"),
    ally = g.players.get("p1");
  const money = a.credits,
    kills = a.kills;
  ally.shield = 0;
  ally.armor = 0;
  ally.grenades = { flash: 2, smoke: 2, frag: 2 };
  g.damage(a, ally, 200, false, true);
  assert.equal(ally.hp, 0);
  assert.equal(a.credits, money);
  assert.equal(a.kills, kills);
  g.beginBuy();
  assert.deepEqual(ally.grenades, { flash: 0, smoke: 0, frag: 0 });
  assert.equal(ally.weapon, "sidekick");
});
test("a nine-player team has separated spawns facing into the arena", () => {
  const g = new HostGame();
  for (let i = 0; i < 10; i++) g.add("p" + i, "P");
  g.configure({ targetA: 1 });
  g.start();
  const ps = [...g.players.values()].filter((p) => p.team === "B");
  for (let i = 0; i < ps.length; i++) {
    assert.ok(Math.cos(ps[i].yaw) * ps[i].z > 0);
    for (let j = i + 1; j < ps.length; j++)
      assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].z - ps[j].z) >= 1.5);
  }
});
