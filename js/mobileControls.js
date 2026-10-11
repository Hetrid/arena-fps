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
      dx = e.clientX - r.left - r.width / 2,
      dy = e.clientY - r.top - r.height / 2,
      l = Math.hypot(dx, dy),
      scale = l > 40 ? 40 / l : 1;
    c.mx = (dx * scale) / 40;
    c.mz = (-dy * scale) / 40;
    stick.style.transform = `translate(${dx * scale}px,${dy * scale}px)`;
  }
  joystick.addEventListener("pointermove", update);
  const release = (e) => {
    if (pointers.get("move") === e.pointerId) {
      pointers.delete("move");
      c.mx = c.mz = 0;
      stick.style.transform = "";
    }
  };
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    joystick.addEventListener(type, release);
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
  const fire = document.querySelector("#fire");
  let fireId = null;
  fire.addEventListener("pointerdown", (e) => {
    capture(fire, e);
    fireId = e.pointerId;
    c.fire = true;
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    fire.addEventListener(type, (e) => {
      if (e.pointerId === fireId) {
        fireId = null;
        c.fire = false;
      }
    });
  for (const [id, key] of [
    ["jump", "jump"],
    ["reload", "reload"],
  ])
    document.querySelector("#" + id).addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onGesture?.();
      c[key] = true;
    });
  document.querySelector("#sprint").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    c.sprint = !c.sprint;
    e.currentTarget.classList.toggle("active", c.sprint);
  });
}
