export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.items = [];
    this.yaw = 0;
    this.fireHeld = false;
    this.touchAim = null;
    this.moveTouch = null;
    this.touchMovement = { x: 0, y: 0 };
    this.bindKeyboard();
    this.bindMouse();
    this.bindTouch();
  }

  bindKeyboard() {
    window.addEventListener("keydown", event => {
      this.keys.add(event.code);
      if (event.repeat) return;
      const slots = { Digit1: "primary", Digit2: "secondary", Digit3: "melee" };
      if (slots[event.code]) this.items.push(["weaponSlot", slots[event.code]]);
      if (event.code === "KeyG") this.items.push(["grenade"]);
      if (event.code === "KeyB") this.items.push(["backpack"]);
      if (event.code === "KeyF") this.items.push(["interact"]);
      if (event.code === "Escape") this.items.push(["pause"]);
    });
    window.addEventListener("keyup", event => this.keys.delete(event.code));
  }

  bindMouse() {
    this.canvas.addEventListener("contextmenu", event => event.preventDefault());
    this.canvas.addEventListener("mousemove", event => {
      if (document.pointerLockElement === this.canvas) this.yaw += event.movementX * .00215;
    });
    this.canvas.addEventListener("mousedown", event => {
      if (event.button === 0) { this.fireHeld = true; this.items.push(["fire"]); }
      if (event.button === 2) this.items.push(["scope"]);
      if (typeof this.canvas.requestPointerLock === "function" && navigator.maxTouchPoints === 0) {
        try {
          const request = this.canvas.requestPointerLock();
          if (request && typeof request.catch === "function") request.catch(() => {});
        } catch (error) {}
      }
    });
    window.addEventListener("mouseup", event => { if (event.button === 0) this.fireHeld = false; });
  }

  bindTouch() {
    const pad = document.querySelector("#move-pad");
    const stick = document.querySelector("#move-stick");
    if (pad) {
      const updatePad = touch => {
        const rect = pad.getBoundingClientRect();
        const x = touch.clientX - (rect.left + rect.width / 2);
        const y = touch.clientY - (rect.top + rect.height / 2);
        const radius = rect.width * .34;
        const length = Math.hypot(x, y) || 1;
        const scale = Math.min(1, radius / length);
        const px = x * scale;
        const py = y * scale;
        this.touchMovement = { x: px / radius, y: py / radius };
        if (stick) stick.style.transform = `translate(${px}px, ${py}px)`;
      };
      pad.addEventListener("touchstart", event => {
        event.preventDefault();
        const touch = event.changedTouches[0];
        this.moveTouch = touch.identifier;
        updatePad(touch);
      }, { passive: false });
      pad.addEventListener("touchmove", event => {
        const touch = [...event.changedTouches].find(item => item.identifier === this.moveTouch);
        if (!touch) return;
        event.preventDefault();
        updatePad(touch);
      }, { passive: false });
      const release = event => {
        if (![...event.changedTouches].some(item => item.identifier === this.moveTouch)) return;
        this.moveTouch = null;
        this.touchMovement = { x: 0, y: 0 };
        if (stick) stick.style.transform = "translate(0, 0)";
      };
      pad.addEventListener("touchend", release, { passive: true });
      pad.addEventListener("touchcancel", release, { passive: true });
    }

    this.canvas.addEventListener("touchstart", event => {
      const touch = event.changedTouches[0];
      if (!touch || event.target !== this.canvas) return;
      this.touchAim = { id: touch.identifier, x: touch.clientX };
    }, { passive: true });
    this.canvas.addEventListener("touchmove", event => {
      if (!this.touchAim) return;
      const touch = [...event.changedTouches].find(item => item.identifier === this.touchAim.id);
      if (!touch) return;
      event.preventDefault();
      this.yaw += (touch.clientX - this.touchAim.x) * .0052;
      this.touchAim.x = touch.clientX;
    }, { passive: false });
    this.canvas.addEventListener("touchend", event => {
      if (this.touchAim && [...event.changedTouches].some(item => item.identifier === this.touchAim.id)) this.touchAim = null;
    }, { passive: true });

    document.querySelectorAll("#mobile-controls [data-action]").forEach(button => {
      const action = button.dataset.action;
      button.addEventListener("touchstart", event => {
        event.preventDefault();
        if (action === "fire") this.fireHeld = true;
        this.items.push([action]);
      }, { passive: false });
      button.addEventListener("touchend", event => {
        event.preventDefault();
        if (action === "fire") this.fireHeld = false;
      }, { passive: false });
      button.addEventListener("mousedown", () => {
        if (action === "fire") this.fireHeld = true;
        this.items.push([action]);
      });
      button.addEventListener("mouseup", () => { if (action === "fire") this.fireHeld = false; });
    });
  }

  movement() {
    const x = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0) + this.touchMovement.x;
    const y = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0) + this.touchMovement.y;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  consume() {
    const state = { yaw: this.yaw, items: this.items.splice(0) };
    this.yaw = 0;
    return state;
  }
}
