import { clamp } from "./config.js";
export class Controls {
  constructor(canvas, onPause, onScore, onBuy) {
    Object.assign(this, {
      canvas,
      onPause,
      onScore,
      onBuy,
      keys: new Set(),
      yaw: 0,
      pitch: 0,
      fire: false,
      jump: false,
      reload: false,
      slot: null,
      ads: false,
      crouch: false,
      touchAim: false,
      active: false,
      mobile: false,
      mx: 0,
      mz: 0,
      sprint: false,
      lookX: 0,
      lookY: 0,
    });
    addEventListener("keydown", (e) => {
      if (e.target?.matches?.("input,select,textarea")) return;
      if (e.code === "KeyB") {
        e.preventDefault();
        onBuy?.();
        return;
      }
      if (!this.active) return;
      if (
        ["Space", "Tab", "ControlLeft", "ControlRight", "AltLeft"].includes(
          e.code,
        )
      )
        e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      const actions = { Space: "jump", KeyR: "reload" };
      if (actions[e.code]) this[actions[e.code]] = true;
      if (e.code === "Digit1") this.slot = "primary";
      if (e.code === "Digit2") this.slot = "secondary";
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
      if (!this.active) return;
      if (e.button === 0) {
        this.fire = true;
        this.lock();
      }
      if (e.button === 2) this.ads = true;
    });
    addEventListener("mouseup", (e) => {
      if (e.button === 0) this.fire = false;
      if (e.button === 2) this.ads = false;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        if (this.active) {
          e.preventDefault();
          this.slot = this.slot === "primary" ? "secondary" : "primary";
        }
      },
      { passive: false },
    );
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
        this.canvas.requestPointerLock()?.catch?.(() => this.onPause());
      } catch {
        this.onPause();
      }
    }
  }
  clear() {
    this.keys.clear();
    this.fire =
      this.jump =
      this.reload =
      this.ads =
      this.crouch =
      this.sprint =
        false;
    this.slot = null;
    this.mx = this.mz = this.lookX = this.lookY = 0;
    this.touchAim = false;
    for (const id of ["ads", "crouch", "sprint"])
      document.getElementById(id)?.classList.remove("active");
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
      sprint: this.mobile ? this.sprint : this.keys.has("ShiftLeft"),
      crouch: this.mobile
        ? this.crouch
        : this.keys.has("ControlLeft") || this.keys.has("ControlRight"),
      ads: this.ads,
      slot: this.slot,
      stamp: performance.now(),
    };
    this.jump = this.reload = false;
    this.slot = null;
    return i;
  }
}
