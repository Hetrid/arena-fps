// In-memory PeerJS transport double: exercises protocol code, NOT real WebRTC/ICE.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  Network,
  request,
  openPeer,
  parseRoom,
  code,
} from "../js/dm/network.js";
import { C } from "../js/dm/config.js";
import { idleInput } from "../js/dm/player.js";
const registry = new Map();
let serial = 0;
class Connection extends EventEmitter {
  constructor(peer, metadata = {}) {
    super();
    this.peer = peer;
    this.metadata = metadata;
    this.open = false;
    this.bufferSize = 0;
    this.dataChannel = { bufferedAmount: 0 };
  }
  send(m) {
    if (!this.open) throw new Error("closed");
    const copy = structuredClone(m);
    queueMicrotask(() => {
      if (this.other.open) this.other.emit("data", copy);
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    this.emit("close");
    if (this.other && !this.other.closed) this.other.close();
  }
}
class MockPeer extends EventEmitter {
  constructor(id) {
    super();
    this.id = id || "test-peer-" + ++serial;
    this.connections = [];
    queueMicrotask(() => {
      if (registry.has(this.id))
        this.emit("error", { type: "unavailable-id", message: "taken" });
      else if (!this.destroyed) {
        registry.set(this.id, this);
        this.emit("open", this.id);
      }
    });
  }
  connect(id, options = {}) {
    const a = new Connection(id, options.metadata);
    this.connections.push(a);
    setTimeout(() => {
      const host = registry.get(id);
      if (!host) {
        a.emit("error", new Error("unavailable"));
        return;
      }
      const b = new Connection(this.id, options.metadata);
      a.other = b;
      b.other = a;
      host.connections.push(b);
      host.emit("connection", b);
      if (a.closed || b.closed) return;
      a.open = b.open = true;
      b.emit("open");
      a.emit("open");
    }, 1);
    return a;
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (registry.get(this.id) === this) registry.delete(this.id);
    for (const c of this.connections) c.close();
  }
  reconnect() {}
}
globalThis.Peer = MockPeer;
const settle = () => new Promise((r) => setTimeout(r, 10));
const cleanup = async (ns) => {
  for (const n of ns) n.close();
  await new Promise((r) => setTimeout(r, 150));
};
test("room codes accept lowercase, spacing and invite links", () => {
  assert.equal(parseRoom("ab-c2 34"), "ABC234");
  assert.equal(parseRoom("https://example.com/game/?room=ABC234"), "ABC234");
  assert.equal(parseRoom(C.privatePrefix + "ABC234"), "ABC234");
  assert.match(code(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.throws(() => parseRoom("invalid"), /six-character/);
});
test("private join, snapshots and reliable transport fallback work", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    let state;
    c.addEventListener("state", (e) => (state = e.detail));
    await c.join("Guest", h.peer.id);
    await settle();
    assert.equal(h.game.humanCount(), 2);
    assert.equal(state.players.length, 2);
    assert.equal(c.fast, null);
    h.start();
    await settle();
    const a = h.game.players.get(h.self),
      b = h.game.players.get(c.self);
    Object.assign(a, { x: -60, z: -6, shield: 0, hp: 1 });
    Object.assign(b, { x: -60, z: 0, yaw: 0, shield: 0 });
    c.inputs([{ ...idleInput(b, 1), fire: true }], h.game.round);
    await settle();
    h.tick();
    await settle();
    assert.equal(a.hp, 0);
    assert.equal(b.kills, 1);
    h.heartbeat();
    await settle();
    assert.ok(h.clients.get(c.self).ping >= 0);
  } finally {
    await cleanup([h, c]);
  }
});
test("human joins replace full bot slots; ten humans reject an eleventh", async () => {
  const h = new Network(),
    clients = [];
  try {
    await h.create("Host");
    h.game.configure({ bots: 9 });
    for (let i = 0; i < 9; i++) {
      const c = new Network();
      clients.push(c);
      await c.join("Guest" + i, h.peer.id);
    }
    assert.equal(h.game.humanCount(), 10);
    assert.equal([...h.game.players.values()].filter((p) => p.bot).length, 0);
    const extra = new Network();
    clients.push(extra);
    await assert.rejects(extra.join("Extra", h.peer.id), /full/);
  } finally {
    await cleanup([h, ...clients]);
  }
});
test("fresh-transport reconnect retains the same seat, gun and score", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    await c.join("Guest", h.peer.id);
    const id = c.self,
      oldPeer = c.peer.id,
      p = h.game.players.get(id);
    h.game.equip(id, "horizon");
    p.kills = 4;
    let count = 0;
    c.addEventListener("recovered", () => count++);
    c.control.close();
    await settle();
    await settle();
    assert.equal(count, 1);
    assert.equal(c.self, id);
    assert.notEqual(c.peer.id, oldPeer);
    assert.equal(h.game.humanCount(), 2);
    assert.equal(p.connected, true);
    assert.equal(p.kills, 4);
    assert.equal(p.weapon, "horizon");
  } finally {
    await cleanup([h, c]);
  }
});
test("wrong reconnect token cannot take another seat", async () => {
  const h = new Network(),
    c = new Network();
  let attacker;
  try {
    await h.create("Host");
    await c.join("Guest", h.peer.id);
    attacker = await openPeer();
    await assert.rejects(
      request(
        attacker,
        h.peer.id,
        { t: "join", v: C.version, resume: { id: c.self, token: "forged" } },
        500,
      ),
      /expired/,
    );
    assert.equal(h.game.humanCount(), 2);
  } finally {
    attacker?.destroy();
    await cleanup([h, c]);
  }
});
test("guests can change only their own gun, not host bot settings or restart", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    await c.join("Guest", h.peer.id);
    c.action({ type: "configure", options: { bots: 9 } });
    c.action({ type: "restart" });
    c.action({ type: "equip", id: h.self, item: "horizon" });
    await settle();
    assert.equal(h.game.players.size, 2);
    assert.equal(h.game.phase, "lobby");
    assert.equal(h.game.players.get(h.self).weapon, "specter");
    assert.equal(h.game.players.get(c.self).weapon, "horizon");
  } finally {
    await cleanup([h, c]);
  }
});
test("host leaving notifies guests; intentional guest leave removes seat", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    await c.join("Guest", h.peer.id);
    c.close();
    await settle();
    assert.equal(h.game.humanCount(), 1);
    await new Promise((r) => setTimeout(r, 150));
    await c.join("Guest", h.peer.id);
    let message;
    c.addEventListener("failure", (e) => (message = e.detail));
    h.close();
    await settle();
    assert.match(message, /host/i);
  } finally {
    await cleanup([h, c]);
  }
});
test("cancel during peer creation never publishes a stale room", async () => {
  const n = new Network();
  let joined = 0;
  n.addEventListener("joined", () => joined++);
  const pending = n.create("Cancelled");
  n.close();
  await assert.rejects(pending, { name: "AbortError" });
  await settle();
  assert.equal(joined, 0);
  assert.equal(n.game, null);
  await cleanup([n]);
});
test("retrying the same join nonce does not duplicate a player", async () => {
  const h = new Network();
  let peer;
  try {
    await h.create("Host");
    peer = await openPeer();
    const join = {
      t: "join",
      v: C.version,
      name: "Guest",
      joinKey: "secret-nonce",
    };
    const a = await request(peer, h.peer.id, join, 500);
    const b = await request(peer, h.peer.id, join, 500);
    assert.equal(a.data.id, b.data.id);
    assert.equal(h.game.humanCount(), 2);
    assert.equal(h.clients.size, 1);
  } finally {
    peer?.destroy();
    await cleanup([h]);
  }
});
