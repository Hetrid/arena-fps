export function mobileControls(c, onGesture) {
  const pointers = new Map(),
    joystick = document.querySelector("#joystick"),
    stick = document.querySelector("#stick"),
    zone = document.querySelector("#lookZone");
  const capture = (el, e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    onGesture?.();
  };
  joystick.addEventListener("pointerdown", (e) => {
    if (pointers.has("move")) return;
    capture(joystick, e);
    pointers.set("move", e.pointerId);
    update(e);
  });
  function update(e) {
    if (pointers.get("move") !== e.pointerId) return;
    const r = joystick.getBoundingClientRect(),
      radius = r.width * 0.36,
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2,
      l = Math.hypot(dx, dy),
      scale = l > radius ? radius / l : 1;
    c.mx = (dx * scale) / radius;
    c.mz = (-dy * scale) / radius;
    stick.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  }
  joystick.addEventListener("pointermove", update);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    joystick.addEventListener(type, (e) => {
      if (pointers.get("move") === e.pointerId) {
        pointers.delete("move");
        c.mx = c.mz = 0;
        stick.style.transform = "";
      }
    });
  zone.addEventListener("pointerdown", (e) => {
    if (pointers.has("look")) return;
    capture(zone, e);
    pointers.set("look", e.pointerId);
    pointers.set("pos", [e.clientX, e.clientY]);
    c.touchAim = true;
  });
  zone.addEventListener("pointermove", (e) => {
    if (pointers.get("look") !== e.pointerId) return;
    const p = pointers.get("pos");
    c.lookX += e.clientX - p[0];
    c.lookY += e.clientY - p[1];
    pointers.set("pos", [e.clientX, e.clientY]);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    zone.addEventListener(type, (e) => {
      if (pointers.get("look") === e.pointerId) {
        pointers.delete("look");
        c.touchAim = false;
      }
    });
  for (const [id, key] of [
    ["fire", "fire"],
    ["interact", "interact"],
  ]) {
    const el = document.querySelector("#" + id);
    let pointer = null;
    el.addEventListener("pointerdown", (e) => {
      capture(el, e);
      pointer = e.pointerId;
      c[key] = true;
    });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
      el.addEventListener(type, (e) => {
        if (pointer === e.pointerId) {
          pointer = null;
          c[key] = false;
        }
      });
  }
  for (const [id, key] of [
    ["jump", "jump"],
    ["reload", "reload"],
    ["ability", "ability"],
  ])
    document.querySelector("#" + id).addEventListener("pointerdown", (e) => {
      capture(e.currentTarget, e);
      c[key] = true;
    });
  for (const id of ["frag", "flash", "smoke"])
    document.querySelector("#" + id).addEventListener("pointerdown", (e) => {
      capture(e.currentTarget, e);
      c.throw = id;
    });
  for (const [id, key] of [
    ["sprint", "sprint"],
    ["ads", "ads"],
    ["crouch", "crouch"],
  ])
    document.querySelector("#" + id).addEventListener("pointerdown", (e) => {
      capture(e.currentTarget, e);
      c[key] = !c[key];
      e.currentTarget.classList.toggle("active", c[key]);
    });
  document.querySelector("#switchGun").addEventListener("pointerdown", (e) => {
    capture(e.currentTarget, e);
    c.slot = c.lastSlot === "secondary" ? "primary" : "secondary";
    c.lastSlot = c.slot;
  });
  // Touch gestures are disabled only on the game/control surface; text inputs stay editable.
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    document.addEventListener(type, (e) => e.preventDefault(), {
      passive: false,
    });
  document.addEventListener("contextmenu", (e) => {
    if (!e.target.closest("input,textarea")) e.preventDefault();
  });
  document.addEventListener("selectstart", (e) => {
    if (!e.target.closest("input,textarea")) e.preventDefault();
  });
  document
    .querySelector("#touch")
    .addEventListener("touchmove", (e) => e.preventDefault(), {
      passive: false,
    });
  const resetPointers = () => {
    pointers.clear();
    stick.style.transform = "";
    c.mx = c.mz = c.lookX = c.lookY = 0;
    c.touchAim = c.fire = c.interact = false;
  };
  addEventListener("blur", resetPointers);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) resetPointers();
  });
}
