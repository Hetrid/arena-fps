import { clamp } from "./config.js";
const defaults = {
  joystick: [0.105, 0.74, 110],
  fire: [0.91, 0.73, 76],
  jump: [0.8, 0.87, 48],
  reload: [0.8, 0.68, 46],
  sprint: [0.23, 0.86, 48],
  ads: [0.92, 0.5, 48],
  crouch: [0.72, 0.88, 46],
  switchGun: [0.72, 0.7, 46],
};
export class TouchLayout {
  constructor() {
    this.editing = false;
    this.selected = "fire";
    this.opacity = 0.8;
    this.layout = {};
    try {
      const saved = JSON.parse(
        localStorage.getItem("arena-touch-layout") || "{}",
      );
      this.layout = saved.layout || {};
      this.opacity = saved.opacity || 0.8;
    } catch {}
    this.drag = null;
    for (const el of document.querySelectorAll("[data-control]")) {
      el.addEventListener(
        "pointerdown",
        (e) => {
          if (!this.editing) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          this.select(el.id);
          el.setPointerCapture(e.pointerId);
          const r = el.getBoundingClientRect();
          this.drag = {
            id: el.id,
            pointer: e.pointerId,
            dx: e.clientX - r.left - r.width / 2,
            dy: e.clientY - r.top - r.height / 2,
          };
        },
        true,
      );
      el.addEventListener(
        "pointermove",
        (e) => {
          if (!this.editing || this.drag?.pointer !== e.pointerId) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          const p = this.position(el.id);
          this.layout[el.id] = {
            ...p,
            x: clamp((e.clientX - this.drag.dx) / innerWidth, 0.02, 0.98),
            y: clamp((e.clientY - this.drag.dy) / innerHeight, 0.05, 0.95),
          };
          this.apply();
        },
        true,
      );
      for (const t of ["pointerup", "pointercancel", "lostpointercapture"])
        el.addEventListener(
          t,
          (e) => {
            if (this.editing) {
              e.stopImmediatePropagation();
              if (this.drag?.pointer === e.pointerId) this.drag = null;
            }
          },
          true,
        );
    }
    document.getElementById("controlSize").oninput = (e) => {
      const p = this.position(this.selected);
      this.layout[this.selected] = { ...p, scale: Number(e.target.value) };
      this.apply();
    };
    document.getElementById("controlOpacity").oninput = (e) => {
      this.opacity = Number(e.target.value);
      this.apply();
    };
    document.getElementById("layoutReset").onclick = () => {
      this.layout = {};
      this.opacity = 0.8;
      this.select("fire");
      this.apply();
    };
    addEventListener("resize", () => this.apply());
    this.apply();
  }
  position(id) {
    const d = defaults[id],
      portrait = innerHeight > innerWidth;
    let x = d[0];
    return { ...{ x, y: d[1], scale: 1 }, ...(this.layout[id] || {}) };
  }
  apply() {
    const safe = getComputedStyle(document.getElementById("touch"));
    const inset = (side) => parseFloat(safe["padding" + side]) || 0;
    for (const [id, d] of Object.entries(defaults)) {
      const el = document.getElementById(id),
        p = this.position(id),
        base = id === "joystick" ? Math.min(d[2], innerHeight * 0.28) : d[2],
        size = base * clamp(p.scale, 0.65, 1.8),
        margin = 12;
      const x = clamp(
          p.x * innerWidth,
          size / 2 + margin + inset("Left"),
          innerWidth - size / 2 - margin - inset("Right"),
        ),
        y = clamp(
          p.y * innerHeight,
          size / 2 + 56 + inset("Top"),
          innerHeight - size / 2 - margin - 8 - inset("Bottom"),
        );
      Object.assign(el.style, {
        left: x - size / 2 + "px",
        top: y - size / 2 + "px",
        right: "auto",
        bottom: "auto",
        width: size + "px",
        height: size + "px",
        opacity: this.opacity,
      });
    }
  }
  select(id) {
    this.selected = id;
    document.getElementById("selectedControl").textContent =
      id === "joystick" ? "Movement stick" : id;
    document.getElementById("controlSize").value = this.position(id).scale;
    document.getElementById("controlOpacity").value = this.opacity;
    for (const el of document.querySelectorAll("[data-control]"))
      el.classList.toggle("selectedControl", el.id === id);
  }
  open() {
    this.editing = true;
    document.body.classList.add("editing");
    document.getElementById("touch").hidden = false;
    document.getElementById("layoutEditor").hidden = false;
    this.select(this.selected);
    this.apply();
  }
  close() {
    this.editing = false;
    this.drag = null;
    document.body.classList.remove("editing");
    document.getElementById("layoutEditor").hidden = true;
    try {
      localStorage.setItem(
        "arena-touch-layout",
        JSON.stringify({ layout: this.layout, opacity: this.opacity }),
      );
    } catch {}
  }
}
