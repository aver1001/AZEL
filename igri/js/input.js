// Keyboard + mouse + gamepad. Movement is camera-relative with north = up.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, down: false, rdown: false, moved: false };
    this.mouseWorld = null; // set by the game each frame (ground point under the cursor)
    this.el = el;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'tab'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' && this.touches.size > 1 && e.pointerId !== [...this.touches][0]) return;
      this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
      this.mouse.moved = true;
    });
    this.touches = new Set();
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touches.add(e.pointerId);
        // first finger steers, any extra finger tap is a dash
        if (this.touches.size >= 2) {
          this.pressed.add('dash');
          return;
        }
        this.mouse.x = (e.clientX / innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / innerHeight) * 2 + 1;
      }
      if (e.button === 0) this.mouse.down = true;
      if (e.button === 2) {
        this.mouse.rdown = true;
        this.pressed.add('dash');
      }
    });
    const lift = (e) => {
      if (e.pointerType === 'touch') {
        this.touches.delete(e.pointerId);
        if (this.touches.size > 0) return;
      }
      if (e.button === 0 || e.pointerType === 'touch') this.mouse.down = false;
    };
    addEventListener('pointercancel', lift);
    addEventListener('pointerup', (e) => {
      lift(e);
      if (e.button === 2) this.mouse.rdown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.padPrev = {};
  }

  /** Movement vector in world XZ (unnormalized, length ≤ 1). */
  move(playerPos) {
    let x = 0, z = 0;
    const k = this.keys;
    if (k.has('w') || k.has('arrowup')) z -= 1;
    if (k.has('s') || k.has('arrowdown')) z += 1;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    const pad = this.pad();
    if (pad) {
      const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
      if (Math.hypot(ax, az) > 0.18) {
        x += ax;
        z += az;
      }
    }
    if (x === 0 && z === 0 && this.mouse.down && this.mouseWorld && playerPos) {
      const dx = this.mouseWorld.x - playerPos.x, dz = this.mouseWorld.z - playerPos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.05) {
        x = dx / d;
        z = dz / d;
      }
    }
    const l = Math.hypot(x, z);
    if (l > 1) {
      x /= l;
      z /= l;
    }
    return { x, z };
  }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Edge-triggered actions consumed once per frame. */
  poll() {
    const p = this.pressed;
    const pad = this.pad();
    const padBtn = (i) => {
      const now = !!(pad && pad.buttons[i] && pad.buttons[i].pressed);
      const was = !!this.padPrev[i];
      this.padPrev[i] = now;
      return now && !was;
    };
    const out = {
      dash: p.has(' ') || p.has('shift') || p.has('dash') || padBtn(0) || padBtn(5),
      pause: p.has('escape') || p.has('p') || padBtn(9),
      mute: p.has('m'),
      pick1: p.has('1'),
      pick2: p.has('2'),
      pick3: p.has('3'),
      confirm: p.has('enter') || padBtn(0),
      padLeft: padBtn(14),
      padRight: padBtn(15),
    };
    p.clear();
    return out;
  }
}
