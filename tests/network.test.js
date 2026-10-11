// In-memory PeerJS transport double: exercises protocol code, NOT real WebRTC/ICE.
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Network } from "../js/network.js";
import { Matchmaking } from "../js/matchmaking.js";
import { C } from "../js/config.js";
import { idleInput } from "../js/player.js";
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
const cleanup = (ns) => {
  for (const n of ns) n.close();
};
test("private handshake, state, fast inputs, combat events, ping and disconnect", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    assert.match(h.room, /^[A-HJ-NP-Z2-9]{10}$/);
    let latest,
      shots = 0;
    c.addEventListener("state", (e) => (latest = e.detail));
    c.addEventListener("event", (e) => {
      if (e.detail.t === "shot") shots++;
    });
    await c.join("Client", C.privatePrefix + h.room);
    await settle();
    assert.equal(h.clients.size, 1);
    assert.equal(latest.players.length, 2);
    assert.equal(c.fast.open, true);
    h.start();
    await settle();
    const a = h.game.players.get(h.self),
      b = h.game.players.get(c.self);
    Object.assign(a, { x: -17, z: -5, shield: 0 });
    Object.assign(b, { x: -17, z: 2, shield: 0 });
    h.game.time = 2;
    h.publish();
    await settle();
    c.inputs(
      [{ ...idleInput(b, 1), mz: 1, fire: true, pitch: -0.04 }],
      h.game.round,
    );
    await settle();
    h.tick();
    await settle();
    assert.ok(b.z < 2);
    assert.equal(b.ack, 1);
    assert.ok(a.hp < 100);
    assert.equal(shots, 1);
    h.heartbeat();
    await settle();
    assert.ok(h.clients.get(c.self).ping >= 0);
    c.close();
    await settle();
    assert.equal(h.clients.size, 0);
    assert.equal(h.game.players.size, 1);
  } finally {
    cleanup([h, c]);
  }
});
test("full room rejects a seventh participant without changing room state", async () => {
  const h = new Network(),
    clients = [];
  try {
    await h.create("Host");
    for (let i = 0; i < 5; i++) {
      const c = new Network();
      clients.push(c);
      await c.join("Guest" + i, C.privatePrefix + h.room);
    }
    const extra = new Network();
    clients.push(extra);
    await assert.rejects(
      extra.join("Seventh", C.privatePrefix + h.room),
      /full/,
    );
    assert.equal(h.game.players.size, 6);
  } finally {
    cleanup([h, ...clients]);
  }
});
test("host disconnect notifies client; join unavailable room fails", async () => {
  const h = new Network(),
    c = new Network();
  try {
    await h.create("Host");
    await c.join("Client", C.privatePrefix + h.room);
    let failure;
    c.addEventListener("failure", (e) => (failure = e.detail));
    h.close();
    await settle();
    assert.match(failure, /Host disconnected/);
    await assert.rejects(c.join("Client", "missing"), /unavailable/);
  } finally {
    cleanup([h, c]);
  }
});
test("Quick Play creates a genuine discoverable slot, then joins it", async () => {
  const a = new Network(),
    b = new Network();
  try {
    const ma = new Matchmaking(a),
      mb = new Matchmaking(b),
      statuses = [];
    await ma.quick("First", (s) => statuses.push(s));
    assert.equal(a.host, true);
    assert.equal(a.public, true);
    assert.ok(a.peer.id.startsWith(C.publicPrefix));
    await mb.quick("Second", (s) => statuses.push(s));
    assert.equal(b.host, false);
    assert.equal(a.game.players.size, 2);
    assert.ok(statuses.includes("Joining public match…"));
    assert.ok(statuses.includes("Creating public match…"));
  } finally {
    cleanup([a, b]);
  }
});
test("Quick Play prefers a waiting room over an active room; private rooms are excluded", async () => {
  const live = new Network(),
    lobby = new Network(),
    privateRoom = new Network(),
    joiner = new Network();
  try {
    await live.create("Active", { publicId: C.publicPrefix + "0" });
    live.start();
    await lobby.create("Waiting", { publicId: C.publicPrefix + "1" });
    await privateRoom.create("Private");
    await new Matchmaking(joiner).quick("Guest", () => {});
    assert.equal(lobby.game.players.size, 2);
    assert.equal(live.game.players.size, 1);
    assert.equal(privateRoom.game.players.size, 1);
  } finally {
    cleanup([live, lobby, privateRoom, joiner]);
  }
});
test("matchmaking cancellation closes peer and stops operation", async () => {
  const n = new Network(),
    m = new Matchmaking(n);
  const promise = m.quick("Cancelled", () => {});
  m.cancel();
  await assert.rejects(promise, (e) => e.name === "AbortError");
  n.close();
  assert.equal(registry.size, 0);
});

test("occupied public IDs are rejected with bounded retries", async () => {
  const rooms = [],
    guest = new Network();
  try {
    for (let i = 0; i < C.publicSlots; i++) {
      const n = new Network();
      rooms.push(n);
      await n.create("Host", { publicId: C.publicPrefix + i });
      for (let j = 0; j < 5; j++) n.game.add("extra" + j, "Full");
    }
    await assert.rejects(
      new Matchmaking(guest).quick("Guest", () => {}),
      /occupied or unreachable/,
    );
  } finally {
    cleanup([...rooms, guest]);
  }
});
