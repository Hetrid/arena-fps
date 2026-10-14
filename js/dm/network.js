import { C } from "./config.js";
import { HostGame } from "./game.js";
const uid = () => crypto.randomUUID();
export function parseRoom(value) {
  let text = String(value || "").trim();
  try {
    if (/^https?:/i.test(text))
      text = new URL(text).searchParams.get("room") || "";
  } catch {}
  text = text
    .toUpperCase()
    .replace(/^ARENA-DM3-/, "")
    .replace(/[\s-]/g, "");
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(text))
    throw new Error(
      "Enter a six-character room code or paste an invite link from this version.",
    );
  return text;
}
export const code = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    (v) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[v % 32],
  ).join("");
export function send(c, m, volatile = false) {
  if (!c?.open) return;
  try {
    if (volatile && (c.bufferSize > 2 || c.dataChannel?.bufferedAmount > 32000))
      return;
    c.send(m);
  } catch {}
}
export function peerOptions() {
  let custom = {};
  try {
    custom = JSON.parse(localStorage.getItem("arena-connection") || "{}");
  } catch {}
  const options = {
    debug: 0,
    secure: true,
    config: {
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
          ],
        },
      ],
      iceCandidatePoolSize: 2,
    },
  };
  if (custom.host) {
    let host = String(custom.host).trim();
    if (/^https?:\/\//i.test(host)) {
      const url = new URL(host);
      options.secure = url.protocol === "https:";
      options.port = Number(url.port) || (options.secure ? 443 : 80);
      options.path = url.pathname;
      options.host = url.hostname;
    } else {
      options.host = host;
      options.port = Number(custom.port) || 443;
      options.path = custom.path || "/";
      options.secure = custom.secure !== false;
    }
  }
  if (custom.turnUrl)
    options.config.iceServers.push({
      urls: custom.turnUrl,
      username: custom.turnUser || "",
      credential: custom.turnPass || "",
    });
  return options;
}
export function openPeer(id, signal) {
  return new Promise((resolve, reject) => {
    if (!globalThis.Peer) return reject(new Error("PeerJS did not load."));
    const p = new Peer(id, peerOptions());
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
        finish(
          new Error(
            "Signalling service timed out. Check network or optional connection settings.",
          ),
        ),
      9000,
    );
    p.on("open", () => finish());
    p.on("error", (e) => {
      if (!done)
        finish(
          new Error(
            e.type === "unavailable-id" ? "Slot already occupied" : e.message,
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
      peer.off?.("error", peerError);
      if (err) {
        c.close();
        reject(err);
      } else resolve({ c, data });
    };
    const abort = () => finish(new DOMException("Cancelled", "AbortError"));
    const peerError = (e) => {
      if (e.type === "peer-unavailable" && (e.message || "").includes(id))
        finish(
          new Error(
            "Room not found. Check the six-character code, refresh both games, and keep the host tab open.",
          ),
        );
    };
    peer.on("error", peerError);
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Connection timed out. Keep the host tab open; try another network or add a TURN relay in Settings.",
          ),
        ),
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
// Native channel shares the accepted control connection's SCTP transport.
// PeerJS's datachannel handler is wrapped so it does not take over this channel.
function rawChannel(dc, onData) {
  const lane = {
    get open() {
      return dc.readyState === "open";
    },
    get dataChannel() {
      return dc;
    },
    bufferSize: 0,
    send(m) {
      dc.send(JSON.stringify(m));
    },
    close() {
      dc.close();
    },
  };
  dc.addEventListener("message", (e) => {
    try {
      onData(JSON.parse(e.data));
    } catch {}
  });
  return lane;
}
export class Network extends EventTarget {
  constructor() {
    super();
    this.generation = 0;
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
    this.hostId = null;
    this.token = null;
    this.lastState = 0;
    this.lastRx = performance.now();
    this.closing = false;
    this.reconnecting = false;
    this.transients = new Set();
    this.step = 0;
    this.retrySerial = 0;
    this.pendingAbort = null;
  }
  emit(t, detail) {
    this.dispatchEvent(new CustomEvent(t, { detail }));
  }
  async create(name, { signal = null, offline = false } = {}) {
    this.close();
    this.closing = false;
    this.room = code();
    this.public = false;
    this.host = true;
    const generation = this.generation;
    const abort = (this.pendingAbort = new AbortController());
    signal?.addEventListener("abort", () => abort.abort(), { once: true });
    if (signal?.aborted) abort.abort();
    if (abort.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (!offline) {
      const peer = await openPeer(C.privatePrefix + this.room, abort.signal);
      if (generation !== this.generation || abort.signal.aborted) {
        peer.destroy();
        throw new DOMException("Cancelled", "AbortError");
      }
      this.peer = peer;
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
    const peer = this.peer;
    peer.on("connection", (c) => {
      if (this.peer !== peer || this.closing || !this.game) {
        c.close();
        return;
      }
      if (c.metadata?.v !== C.version) {
        const reject = () =>
          send(c, {
            t: "reject",
            reason:
              "Different game version. Both players must refresh the updated game.",
          });
        if (c.open) reject();
        else c.on("open", reject);
        setTimeout(() => c.close(), 600);
        return;
      }
      if (c.metadata.kind === "fast") {
        const entry = [...this.clients.entries()].find(
          ([id, x]) => x.token === c.metadata.token && x.peer === c.peer,
        );
        if (!entry) {
          c.close();
          return;
        }
        const [id, client] = entry;
        client.fast?.close();
        client.fast = c;
        c.on("data", (m) => this.hostMessage(id, m));
        c.on("error", () => {});
        return;
      }
      if (this.transients.size > 48) {
        c.close();
        return;
      }
      this.transients.add(c);
      let accepted = false,
        playerId = null;
      const timer = setTimeout(() => {
        if (!accepted) c.close();
      }, C.connectTimeout + 2000);
      const pc = c.peerConnection;
      if (pc) {
        const handler = pc.ondatachannel;
        pc.ondatachannel = (e) => {
          if (e.channel.label === "arena-state-dm3") {
            const client = this.clients.get(playerId);
            if (!client) {
              e.channel.close();
              return;
            }
            client.fast?.close();
            client.fast = rawChannel(e.channel, (m) =>
              this.hostMessage(playerId, m),
            );
          } else handler?.call(pc, e);
        };
      }
      c.on("data", (m) => {
        if (this.peer !== peer || this.closing || !this.game) {
          c.close();
          return;
        }
        if (!m || typeof m !== "object") return;
        if (!accepted && m.t === "probe") {
          send(c, {
            t: "info",
            v: C.version,
            public: this.public,
            count: this.game.humanCount(),
            phase: this.game.phase,
          });
          setTimeout(() => c.close(), 150);
          return;
        }
        if (!accepted && m.t === "join") {
          let client =
            (m.joinKey &&
              [...this.clients.values()].find(
                (x) => x.peer === c.peer && x.joinKey === m.joinKey,
              )) ||
            null;
          if (client)
            playerId = [...this.clients].find(([, x]) => x === client)[0];
          const resume = m.resume && this.clients.get(m.resume.id);
          if (resume && resume.token === m.resume.token) {
            playerId = m.resume.id;
            client = resume;
          } else if (m.resume) {
            send(c, { t: "reject", reason: "Reconnect session expired." });
            setTimeout(() => c.close(), 100);
            return;
          }
          let reason = "";
          if (m.v !== C.version) reason = "Game version mismatch.";
          else if (!client && this.game.humanCount() >= C.maxPlayers)
            reason = "Room is full (ten players).";
          else if (!client && this.game.players.has(c.peer))
            reason = "Already connected.";
          if (reason) {
            send(c, { t: "reject", reason });
            setTimeout(() => c.close(), 120);
            return;
          }
          if (!client) {
            playerId = c.peer;
            this.game.add(playerId, m.name);
            client = {
              joinKey: m.joinKey,
              control: c,
              fast: null,
              token: uid(),
              peer: c.peer,
              last: performance.now(),
              ping: 0,
              pings: new Map(),
              graceUntil: 0,
            };
            this.clients.set(playerId, client);
          } else {
            const old = client.control;
            client.control = c;
            client.fast?.close();
            client.fast = null;
            old?.close();
            client.peer = c.peer;
            client.last = performance.now();
            client.graceUntil = 0;
            this.game.players.get(playerId).connected = true;
          }
          accepted = true;
          clearTimeout(timer);
          this.transients.delete(c);
          send(c, {
            t: "welcome",
            id: playerId,
            token: client.token,
            room: this.room,
            public: this.public,
            state: this.game.snapshot(),
          });
          this.publish();
          return;
        }
        if (accepted) this.hostMessage(playerId, m);
      });
      c.on("close", () => {
        clearTimeout(timer);
        this.transients.delete(c);
        const client = this.clients.get(playerId);
        if (accepted && client?.control === c) {
          client.fast?.close();
          client.fast = null;
          client.graceUntil = performance.now() + 15000;
          const p = this.game?.players.get(playerId);
          if (p) p.connected = false;
          this.publish();
        }
      });
      c.on("error", () => {});
    });
    this.watchSignaling(peer);
  }
  watchSignaling(peer) {
    if (peer._arenaWatched) return;
    peer._arenaWatched = true;
    const retry = (attempt = 0) => {
      if (
        this.peer !== peer ||
        this.closing ||
        peer.destroyed ||
        !peer.disconnected
      )
        return;
      try {
        peer.reconnect();
      } catch {}
      if (attempt < 4)
        setTimeout(
          () => retry(attempt + 1),
          Math.min(1000 * 2 ** attempt, 8000),
        );
    };
    peer.on("disconnected", () => {
      if (this.peer !== peer || this.closing) return;
      this.emit(
        "status",
        "Room service disconnected. Existing players can continue; retrying…",
      );
      retry();
    });
    peer.on("open", () => {
      if (this.peer === peer && !this.closing)
        this.emit("status", "Room service connected.");
    });
    peer.on("error", (e) => {
      if (this.peer !== peer || this.closing) return;
      if (["network", "socket-error", "server-error"].includes(e.type))
        this.emit(
          "status",
          "Room service unreachable. Check your network or saved connection settings.",
        );
    });
  }
  hostMessage(id, m) {
    const client = this.clients.get(id);
    if (!client || !this.game || !m || typeof m !== "object") return;
    client.last = performance.now();
    const p = this.game.players.get(id);
    if (!p) return;
    if (m.t === "inputs") this.game.receive(id, m.inputs, m.round);
    else if (m.t === "action") {
      this.applyAction(id, m.action);
      this.publish();
    } else if (m.t === "pong") {
      const start = client.pings.get(m.n);
      if (start !== undefined) {
        const rtt = performance.now() - start;
        client.ping = client.ping ? client.ping * 0.7 + rtt * 0.3 : rtt;
        p.ping = Math.round(client.ping);
        client.pings.delete(m.n);
      }
    } else if (m.t === "leave") {
      const c = client.control;
      this.clients.delete(id);
      this.game.remove(id);
      client.fast?.close();
      c.close();
      this.publish();
    }
  }
  applyAction(id, a) {
    if (!a || typeof a !== "object") return;
    if (a.type === "equip") this.game.equip(id, a.item);
    if (id === this.self) {
      if (a.type === "configure") this.game.configure(a.options || {});
      if (a.type === "restart") this.game.start();
    }
  }

  async join(name, hostId, signal) {
    this.close();
    this.closing = false;
    const generation = this.generation;
    const abort = (this.pendingAbort = new AbortController());
    signal?.addEventListener("abort", () => abort.abort(), { once: true });
    if (signal?.aborted) abort.abort();
    this.name = name;
    this.hostId = hostId;
    this.joinKey = uid();
    const peer = await openPeer(undefined, abort.signal);
    if (generation !== this.generation || abort.signal.aborted) {
      peer.destroy();
      throw new DOMException("Cancelled", "AbortError");
    }
    this.peer = peer;
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        this.emit(
          "status",
          attempt ? "Retrying room handshake…" : "Contacting host…",
        );
        response = await request(
          peer,
          hostId,
          { t: "join", name, v: C.version, joinKey: this.joinKey },
          C.connectTimeout,
          abort.signal,
        );
        break;
      } catch (e) {
        if (
          abort.signal.aborted ||
          generation !== this.generation ||
          attempt ||
          !/timed out|Connection failed|closed/i.test(e.message)
        )
          throw e;
      }
    }
    if (generation !== this.generation || abort.signal.aborted) {
      response.c.close();
      throw new DOMException("Cancelled", "AbortError");
    }
    this.attach(response.c, response.data, false);
    return this;
  }
  attach(c, data, resume) {
    this.self = data.id;
    this.room = data.room;
    this.public = data.public;
    this.token = data.token;
    this.control = c;
    this.lastState = 0;
    this.lastRx = performance.now();
    this.reconnecting = false;
    c.on("data", (m) => {
      if (this.control === c && !this.closing) this.clientMessage(m);
    });
    c.on("close", () => {
      if (!this.closing && this.control === c) this.recover();
    });
    c.on("error", () => {});
    try {
      if (c.peerConnection) {
        const dc = c.peerConnection.createDataChannel("arena-state-dm3", {
          ordered: false,
          maxRetransmits: 0,
        });
        this.fast = rawChannel(dc, (m) => this.clientMessage(m));
      } else throw new Error("native channel unavailable");
    } catch {
      this.fast = null;
    }
    this.watchSignaling(this.peer);
    this.emit(resume ? "recovered" : "joined", {
      host: false,
      room: this.room,
      public: this.public,
    });
    this.clientMessage(data.state);
  }
  async recover() {
    if (this.reconnecting || this.closing || this.host || !this.peer) return;
    this.reconnecting = true;
    const generation = this.generation;
    const abort = (this.pendingAbort = new AbortController());
    this.emit("status", "Reconnecting to the host…");
    this.fast?.close();
    const oldPeer = this.peer;
    for (let attempt = 0; attempt < 2; attempt++) {
      let peer;
      try {
        peer = await openPeer(undefined, abort.signal);
        if (this.closing || generation !== this.generation) {
          peer.destroy();
          return;
        }
        const { c, data } = await request(
          peer,
          this.hostId,
          {
            t: "join",
            name: this.name,
            v: C.version,
            resume: { id: this.self, token: this.token },
          },
          7000,
          abort.signal,
        );
        if (this.closing || generation !== this.generation) {
          peer.destroy();
          return;
        }
        this.peer = peer;
        this.attach(c, data, true);
        oldPeer.destroy();
        this.emit("status", "Connected.");
        return;
      } catch {
        peer?.destroy();
        if (this.closing || generation !== this.generation) return;
      }
    }
    this.fail(
      "Host could not be reached. Keep the host tab open and try joining again.",
    );
  }
  clientMessage(m) {
    if (!m || typeof m !== "object") return;
    this.lastRx = performance.now();
    if (m.t === "shutdown") {
      this.fail("Host unavailable. The host closed this room.");
      return;
    }
    if (m.t === "state") {
      if (m.n <= this.lastState) return;
      this.lastState = m.n;
      this.emit("state", m);
    } else if (m.t === "ping") send(this.control, { t: "pong", n: m.n });
    else this.emit("event", m);
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
    else if (!this.reconnecting)
      send(
        this.fast?.open ? this.fast : this.control,
        { t: "inputs", inputs, round },
        true,
      );
  }
  action(a) {
    if (this.host) {
      this.applyAction(this.self, a);
      this.publish();
    } else send(this.control, { t: "action", action: a });
  }
  start() {
    if (this.host) {
      this.game.start();
      this.publish();
    }
  }
  tick() {
    if (this.host && this.game) {
      this.game.tick();
      if (++this.step % C.snapshotEvery === 0 && this.game.phase === "playing")
        this.publish();
    } else if (
      this.control &&
      !this.reconnecting &&
      performance.now() - this.lastRx > 4500
    )
      this.recover();
  }
  heartbeat() {
    if (!this.host) {
      if (this.control?.open) send(this.control, { t: "pong", n: "keepalive" });
      return;
    }
    const now = performance.now();
    for (const [id, c] of this.clients) {
      if (c.graceUntil) {
        if (now >= c.graceUntil) {
          this.clients.delete(id);
          this.game.remove(id);
          this.publish();
        }
        continue;
      }
      if (now - c.last > 8000) {
        c.control.close();
        continue;
      }
      const n = uid();
      c.pings.set(n, now);
      for (const [nonce, t] of c.pings)
        if (now - t > 6000) c.pings.delete(nonce);
      send(c.control, { t: "ping", n });
    }
    if (["lobby", "results"].includes(this.game.phase)) this.publish();
  }
  fail(m) {
    this.close();
    this.emit("failure", m);
  }
  close() {
    this.generation++;
    this.pendingAbort?.abort();
    this.closing = true;
    this.retrySerial++;
    const control = this.control,
      peer = this.peer;
    if (this.host) this.broadcast({ t: "shutdown" });
    else send(control, { t: "leave" });
    this.fast?.close();
    for (const c of this.clients.values()) c.fast?.close();
    const sockets = [...this.clients.values()].map((c) => c.control);
    const transients = [...this.transients];
    // Give ordered leave/shutdown events time to enter the data channel before teardown.
    setTimeout(() => {
      control?.close();
      for (const c of sockets) c.close();
      for (const c of transients) c.close();
      peer?.destroy();
    }, 120);
    this.reset();
    this.closing = true;
  }
}
