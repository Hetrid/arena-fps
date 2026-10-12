import { C } from "./config.js";
import { openPeer, request } from "./network.js";
const shuffle = (a) => a.sort(() => Math.random() - 0.5);
export class Matchmaking {
  constructor(network) {
    this.network = network;
    this.abort = null;
    this.scout = null;
  }
  cancel() {
    this.abort?.abort();
    this.scout?.destroy();
    this.scout = null;
    this.network.close();
  }
  async quick(name, status) {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      this.abort.abort();
    }, 55000);
    try {
      for (let round = 0; round < 2; round++) {
        status("Searching public rooms…");
        this.scout = await openPeer(undefined, signal);
        const rooms = [];
        const slots = shuffle(
          Array.from({ length: C.publicSlots }, (_, i) => C.publicPrefix + i),
        );
        let next = 0;
        const worker = async () => {
          while (next < slots.length && !signal.aborted) {
            const id = slots[next++];
            try {
              const { c, data } = await request(
                this.scout,
                id,
                { t: "probe" },
                C.probeTimeout,
                signal,
              );
              c.close();
              if (
                data.v === C.version &&
                data.public &&
                data.count < C.maxPlayers &&
                data.phase !== "results"
              )
                rooms.push({ id, ...data });
            } catch (e) {
              if (signal.aborted) throw e;
            }
          }
        };
        await Promise.all([worker(), worker(), worker()]);
        this.scout.destroy();
        this.scout = null;
        rooms.sort(
          (a, b) =>
            (a.phase === "lobby" ? 0 : 1) - (b.phase === "lobby" ? 0 : 1) ||
            b.count - a.count,
        );
        for (const room of rooms) {
          if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
          status("Joining public match…");
          try {
            return await this.network.join(name, room.id, signal);
          } catch (e) {
            if (signal.aborted) throw e;
            this.network.close();
          }
        }
        status("Creating public match…");
        for (const id of slots) {
          try {
            return await this.network.create(name, { publicId: id, signal });
          } catch (e) {
            if (signal.aborted) throw e;
            this.network.close();
          }
        }
      }
      throw new Error(
        "All public slots are occupied or unreachable. Try again, or use a private room.",
      );
    } catch (e) {
      this.scout?.destroy();
      this.scout = null;
      this.network.close();
      throw timedOut
        ? new Error(
            "Public discovery timed out. Try a private room or another network.",
          )
        : e;
    } finally {
      clearTimeout(deadline);
    }
  }
}
