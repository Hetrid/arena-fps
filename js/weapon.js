import * as THREE from "three";
export function rifle() {
  const group = new THREE.Group();
  const steel = new THREE.MeshLambertMaterial({ color: 0x28333e }),
    dark = new THREE.MeshLambertMaterial({ color: 0x121923 }),
    accent = new THREE.MeshLambertMaterial({ color: 0x9cab9b });
  const part = (w, h, d, x, y, z, mat = steel) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  part(0.13, 0.16, 0.48, 0, 0, 0);
  part(0.1, 0.1, 0.5, 0, 0.02, -0.4);
  part(0.07, 0.07, 0.28, 0, 0.02, -0.72, dark);
  part(0.12, 0.13, 0.23, 0, -0.07, 0.3, dark);
  const grip = part(0.08, 0.2, 0.1, 0, -0.14, 0.05, dark);
  grip.rotation.x = -0.2;
  const mag = part(0.09, 0.23, 0.15, 0, -0.17, -0.1, accent);
  mag.rotation.x = 0.12;
  part(0.045, 0.045, 0.1, 0, 0.115, -0.1, dark);
  part(0.045, 0.06, 0.045, 0, 0.105, -0.56, accent);
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.22, 5),
    new THREE.MeshBasicMaterial({
      color: 0xffd984,
      transparent: true,
      opacity: 0.95,
    }),
  );
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0, 0.02, -0.98);
  flash.visible = false;
  group.add(flash);
  group.userData.flash = flash;
  return group;
}
export class AudioFX {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.noise = null;
  }
  unlock() {
    try {
      if (!this.context) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        const buffer = this.context.createBuffer(
            1,
            this.context.sampleRate * 0.15,
            this.context.sampleRate,
          ),
          data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.noise = buffer;
      }
      this.context.resume();
    } catch {}
  }
  shot(distance = 0) {
    if (
      !this.context ||
      this.context.state !== "running" ||
      this.settings.volume <= 0
    )
      return;
    const ctx = this.context,
      t = ctx.currentTime,
      source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = "lowpass";
    filter.frequency.value = 1700;
    gain.gain.setValueAtTime(
      (this.settings.volume * 0.45) / (1 + distance * 0.2),
      t,
    );
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    source.stop(t + 0.15);
  }
}
