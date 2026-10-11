import { clamp } from "./config.js";
export class Controls {
  constructor(canvas, onPause, onScore) {
    this.canvas = canvas;
    this.keys = new Set();
    this.yaw = 0;
    this.pitch = 0;
    this.fire = false;
    this.jump = false;
    this.reload = false;
    this.touchAim = false;
    this.active = false;
    this.mobile = false;
    this.mx = 0;
    this.mz = 0;
    this.sprint = false;
    this.lookX = 0;
    this.lookY = 0;
    this.onPause = onPause;
    addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (["Space", "Tab", "ArrowUp", "ArrowDown"].includes(e.code))
        e.preventDefault();
      this.keys.add(e.code);
      if (e.code === "Space" && !e.repeat) this.jump = true;
      if (e.code === "KeyR" && !e.repeat) this.reload = true;
      if (e.code === "Tab") onScore(true);
    });
    addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "Tab") onScore(false);
    });
    addEventListener("mousemove", (e) => {
      if (document.pointerLockElement === canvas && this.active) {
        this.touchAim = false;
        this.yaw -= e.movementX * 0.0022;
        this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      if (this.active && e.button === 0) {
        this.fire = true;
        this.lock();
      }
    });
    addEventListener("mouseup", () => (this.fire = false));
    addEventListener("blur", () => this.clear());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.clear();
        if (this.active) onPause();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      if (!document.pointerLockElement && this.active && !this.mobile) {
        this.clear();
        onPause();
      }
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  lock() {
    if (!this.mobile && this.active) {
      try {
        const p = this.canvas.requestPointerLock();
        p?.catch?.(() => this.onPause());
      } catch {
        this.onPause();
      }
    }
  }
  clear() {
    this.keys.clear();
    this.fire = false;
    this.jump = false;
    this.reload = false;
    this.mx = this.mz = 0;
    this.lookX = this.lookY = 0;
    this.touchAim = false;
  }
  sample(seq) {
    const i = {
      seq,
      mx: this.mobile
        ? this.mx
        : +this.keys.has("KeyD") - +this.keys.has("KeyA"),
      mz: this.mobile
        ? this.mz
        : +this.keys.has("KeyW") - +this.keys.has("KeyS"),
      yaw: this.yaw,
      pitch: this.pitch,
      jump: this.jump,
      reload: this.reload,
      fire: this.fire,
      sprint: this.mobile
        ? this.sprint
        : this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      stamp: performance.now(),
    };
    this.jump = false;
    this.reload = false;
    return i;
  }
}
