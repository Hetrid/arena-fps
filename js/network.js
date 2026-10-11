import { C } from "./config.js";
import { HostGame } from "./game.js";
const uid = () => crypto.randomUUID();
export const code = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (v) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[v % 32],
  ).join("");
export function send(conn, msg, volatile = false) {
  if (!conn?.open) return;
  try {
    if (
      volatile &&
      (conn.bufferSize > 2 || conn.dataChannel?.bufferedAmount > 24000)
    )
      return;
    conn.send(msg);
  } catch {}
}
export function openPeer(id, signal) {
  return new Promise((resolve, reject) => {
    if (!globalThis.Peer)
      return reject(
        new Error("PeerJS did not load. Check your internet connection."),
      );
    const p = new Peer(id, { debug: 0 });
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (err) {
        p.destroy();
        reject(err);
      } else resolve(p);
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () =>
        finish(new Error("Signalling service timed out. Please try again.")),
      7000,
    );
    p.on("open", () => finish());
    p.on("error", (err) => {
      if (!done)
        finish(
          new Error(
            err.type === "unavailable-id"
              ? "Slot already occupied"
              : err.message,
          ),
        );
    });
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export function request(peer, id, msg, timeout = C.connectTimeout, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Cancelled", "AbortError"));
    const c = peer.connect(id, {
      reliable: true,
      serialization: "json",
      metadata: { v: C.version, kind: msg.t === "probe" ? "probe" : "control" },
    });
    let done = false;
    const finish = (err, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (err) {
        c.close();
        reject(err);
      } else resolve({ c, data });
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const timer = setTimeout(
      () => finish(new Error("Room unavailable or blocked by your network.")),
      timeout,
    );
    c.on("open", () => send(c, msg));
    c.on("data", (d) => {
      if (d?.t === "welcome" || d?.t === "info") finish(null, d);
      else if (d?.t === "reject") finish(new Error(d.reason));
    });
    c.on("error", (e) => finish(new Error(e.message || "Connection failed")));
    c.on("close", () => finish(new Error("Room connection closed.")));
    signal?.addEventListener("abort", abort, { once: true });
  });
}
export class Network extends EventTarget {
  constructor() {
    super();
    this.reset();
  }
  reset() {
    this.peer = null;
    this.control = null;
    this.fast = null;
    this.game = null;
    this.clients = new Map();
    this.self = null;
    this.host = false;
    this.public = false;
    this.room = "";
    this.lastState = 0;
    this.lastRx = performance.now();
    this.closing = false;
    this.transients = new Set();
  }
  emit(t, detail) {
    this.dispatchEvent(new CustomEvent(t, { detail }));
  }
  async create(name, { publicId = null, signal = null, offline = false } = {}) {
    this.close();
    this.closing = false;
    this.room = publicId ? "PUBLIC" : code();
    this.public = !!publicId;
    this.host = true;
    if (!offline)
      this.peer = await openPeer(
        publicId || C.privatePrefix + this.room,
        signal,
      );
    if (signal?.aborted) {
      this.close();
      throw new DOMException("Cancelled", "AbortError");
    }
    this.self = this.peer?.id || "practice";
    this.game = new HostGame((e) => {
      this.broadcast(e);
      this.emit("event", e);
    });
    this.game.add(this.self, name);
    if (this.peer) this.setupHost();
    this.emit("joined", {
      host: true,
      room: this.room,
      public: this.public,
      offline,
    });
    this.publish();
    return this;
  }
  setupHost() {
    const p = this.peer;
    p.on("connection", (c) => {
      if (c.metadata?.v !== C.version) {
        c.close();
        return;
      }
      if (c.metadata.kind === "fast") {
        const client = this.clients.get(c.peer);
        if (!client || client.token !== c.metadata.token) {
          c.close();
          return;
        }
        client.fast?.close();
        client.fast = c;
        c.on("data", (m) => this.hostMessage(c.peer, m));
        c.on("error", () => {});
        return;
      }
      if (this.transients.size > 48) {
        c.close();
        return;
      }
      this.transients.add(c);
      let accepted = false;
      const timer = setTimeout(() => {
        if (!accepted) c.close();
      }, 6000);
      c.on("data", (m) => {
        if (!m || typeof m !== "object") return;
        if (!accepted && m.t === "probe") {
          send(c, {
            t: "info",
            v: C.version,
            public: this.public,
            count: this.game.players.size,
            phase: this.game.phase,
          });
          setTimeout(() => c.close(), 150);
          return;
        }
        if (!accepted && m.t === "join") {
          let reason = "";
          if (m.v !== C.version) reason = "Game version mismatch.";
          else if (this.clients.has(c.peer)) reason = "Already connected.";
          else if (this.game.players.size >= C.maxPlayers)
            reason = "Room is full (six players).";
          if (reason) {
            send(c, { t: "reject", reason });
            setTimeout(() => c.close(), 150);
            return;
          }
          const player = this.game.add(c.peer, m.name);
          if (!player) return;
          accepted = true;
          clearTimeout(timer);
          this.transients.delete(c);
          const token = uid();
          this.clients.set(c.peer, {
            control: c,
            fast: null,
            token,
            last: performance.now(),
            ping: 0,
            pings: new Map(),
          });
          send(c, {
            t: "welcome",
            id: c.peer,
            token,
            room: this.room,
            public: this.public,
            state: this.game.snapshot(),
          });
          this.publish();
          return;
        }
        if (accepted) this.hostMessage(c.peer, m);
      });
      c.on("close", () => {
        clearTimeout(timer);
        this.transients.delete(c);
        if (accepted && this.clients.get(c.peer)?.control === c) {
          this.clients.get(c.peer).fast?.close();
          this.clients.delete(c.peer);
          this.game.remove(c.peer);
          this.publish();
        }
      });
      c.on("error", () => {});
    });
    p.on("disconnected", () => {
      this.emit("status", "Signalling disconnected; existing match continues.");
      try {
        p.reconnect();
      } catch {}
    });
  }
  hostMessage(id, m) {
    const client = this.clients.get(id);
    if (!client || !m || typeof m !== "object") return;
    client.last = performance.now();
    if (m.t === "inputs") this.game.receive(id, m.inputs, m.round);
    else if (m.t === "ready") {
      this.game.ready(id);
      this.publish();
    } else if (m.t === "pong") {
      const sent = client.pings.get(m.n);
      if (sent !== undefined) {
        const rtt = performance.now() - sent;
        client.ping = client.ping * 0.7 + rtt * 0.3;
        const p = this.game.players.get(id);
        if (p) p.ping = Math.round(client.ping);
        client.pings.delete(m.n);
      }
    } else if (m.t === "leave") client.control.close();
  }
  async join(name, hostId, signal, existingPeer = null) {
    this.close();
    this.closing = false;
    const peer = existingPeer || (await openPeer(undefined, signal));
    this.peer = peer;
    const { c, data } = await request(
      peer,
      hostId,
      { t: "join", name, v: C.version },
      C.connectTimeout,
      signal,
    );
    if (signal?.aborted) {
      this.close();
      throw new DOMException("Cancelled", "AbortError");
    }
    this.self = data.id;
    this.room = data.room;
    this.public = data.public;
    this.control = c;
    this.lastState = 0;
    this.lastRx = performance.now();
    c.on("data", (m) => this.clientMessage(m));
    c.on("close", () => {
      if (!this.closing)
        this.fail(
          "Host disconnected. Return to the menu and rejoin the room if it reopens.",
        );
    });
    c.on("error", () => {});
    this.fast = peer.connect(hostId, {
      reliable: false,
      serialization: "json",
      metadata: { v: C.version, kind: "fast", token: data.token },
    });
    this.fast.on("data", (m) => this.clientMessage(m));
    this.fast.on("error", () => {});
    peer.on("disconnected", () => {
      try {
        peer.reconnect();
      } catch {}
    });
    this.emit("joined", { host: false, room: this.room, public: this.public });
    this.clientMessage(data.state);
    return this;
  }
  clientMessage(m) {
    if (!m || typeof m !== "object") return;
    this.lastRx = performance.now();
    if (m.t === "state") {
      if (m.n <= this.lastState) return;
      this.lastState = m.n;
      this.emit("state", m);
    } else if (m.t === "ping") {
      send(this.control, { t: "pong", n: m.n });
    } else this.emit("event", m);
  }
  broadcast(m, volatile = false) {
    for (const c of this.clients.values())
      send(volatile && c.fast?.open ? c.fast : c.control, m, volatile);
  }
  publish() {
    if (!this.game) return;
    const s = this.game.snapshot();
    this.broadcast(s, true);
    this.emit("state", s);
  }
  inputs(inputs, round) {
    if (this.host) this.game.receive(this.self, inputs, round);
    else
      send(
        this.fast?.open ? this.fast : this.control,
        { t: "inputs", inputs, round },
        true,
      );
  }
  start() {
    if (this.host) {
      this.game.start();
      this.publish();
    }
  }
  ready() {
    if (this.host) {
      this.game.ready(this.self);
      this.publish();
    } else send(this.control, { t: "ready" });
  }
  tick() {
    if (this.host && this.game) {
      this.game.tick();
      if (++this.step % C.snapshotEvery === 0) this.publish();
    } else if (this.control && performance.now() - this.lastRx > 10000)
      this.fail("Host stopped responding. The match has closed.");
  }
  heartbeat() {
    if (!this.host) return;
    const now = performance.now();
    for (const [id, c] of this.clients) {
      if (now - c.last > 12000) {
        c.control.close();
        continue;
      }
      const n = uid();
      c.pings.clear();
      c.pings.set(n, now);
      send(c.control, { t: "ping", n });
    }
  }
  fail(message) {
    this.close();
    this.emit("failure", message);
  }
  close() {
    this.closing = true;
    send(this.control, { t: "leave" });
    this.fast?.close();
    this.control?.close();
    for (const c of this.clients.values()) {
      c.fast?.close();
      c.control?.close();
    }
    for (const c of this.transients) c.close();
    this.peer?.destroy();
    this.reset();
    this.step = 0;
  }
}
