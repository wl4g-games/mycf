export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.queue = [];
    this.fireHeld = false;
    this.yaw = 0;
    this.touchMove = { x: 0, y: 0 };
    this.aimTouch = null;
    this.bindDesktop();
    this.bindTouch();
  }

  bindDesktop() {
    window.addEventListener("keydown", event => {
      this.keys.add(event.code);
      const actions = { Digit1: ["weapon", "sniper"], Digit2: ["weapon", "grenade"], Digit3: ["weapon", "knife"], KeyG: ["grenade"], KeyF: ["interact"], KeyR: ["reset"], Escape: ["pause"] };
      if (!event.repeat && actions[event.code]) this.queue.push(actions[event.code]);
    });
    window.addEventListener("keyup", event => this.keys.delete(event.code));
    window.addEventListener("mousemove", event => {
      if (document.pointerLockElement === this.canvas) this.yaw += event.movementX * .00215;
    });
    this.canvas.addEventListener("mousedown", event => {
      if (document.pointerLockElement !== this.canvas) {
        const request = this.canvas.requestPointerLock?.();
        request?.catch?.(() => {});
        return;
      }
      if (event.button === 0) { this.fireHeld = true; this.queue.push(["fire"]); }
      if (event.button === 2) this.queue.push(["scope"]);
    });
    window.addEventListener("mouseup", event => { if (event.button === 0) this.fireHeld = false; });
    this.canvas.addEventListener("contextmenu", event => event.preventDefault());
  }

  bindTouch() {
    const pad = document.querySelector("#move-pad");
    const stick = document.querySelector("#move-stick");
    if (!pad) return;
    const updatePad = touch => {
      const rect = pad.getBoundingClientRect();
      const x = touch.clientX - rect.left - rect.width / 2;
      const y = touch.clientY - rect.top - rect.height / 2;
      const length = Math.hypot(x, y) || 1;
      const radius = Math.min(34, length);
      this.touchMove = { x: x / Math.max(34, length), y: y / Math.max(34, length) };
      stick.style.transform = `translate(${x / length * radius}px,${y / length * radius}px)`;
    };
    pad.addEventListener("touchstart", event => { event.preventDefault(); updatePad(event.changedTouches[0]); }, { passive: false });
    pad.addEventListener("touchmove", event => { event.preventDefault(); updatePad(event.changedTouches[0]); }, { passive: false });
    const releasePad = () => { this.touchMove = { x: 0, y: 0 }; stick.style.transform = ""; };
    pad.addEventListener("touchend", releasePad); pad.addEventListener("touchcancel", releasePad);

    this.canvas.addEventListener("touchstart", event => {
      const touch = [...event.changedTouches].find(item => item.clientX > innerWidth * .42);
      if (touch) this.aimTouch = { id: touch.identifier, x: touch.clientX };
    }, { passive: true });
    this.canvas.addEventListener("touchmove", event => {
      const touch = [...event.changedTouches].find(item => item.identifier === this.aimTouch?.id);
      if (!touch) return;
      this.yaw += (touch.clientX - this.aimTouch.x) * .006;
      this.aimTouch.x = touch.clientX;
    }, { passive: true });
    this.canvas.addEventListener("touchend", event => {
      if ([...event.changedTouches].some(item => item.identifier === this.aimTouch?.id)) this.aimTouch = null;
    });

    document.querySelectorAll("[data-action]").forEach(button => {
      const action = button.dataset.action;
      const start = event => { event.preventDefault(); action === "fire" ? (this.fireHeld = true) : null; this.queue.push([action]); };
      button.addEventListener("touchstart", start, { passive: false });
      button.addEventListener("mousedown", start);
      const stop = () => { if (action === "fire") this.fireHeld = false; };
      button.addEventListener("touchend", stop); button.addEventListener("mouseup", stop);
    });
  }

  movement() {
    const x = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0) + this.touchMove.x;
    const y = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0) + this.touchMove.y;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  consume() { const items = this.queue.splice(0); const yaw = this.yaw; this.yaw = 0; return { items, yaw }; }
}
