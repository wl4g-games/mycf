export class TouchAimState {
  constructor(sensitivity = .0052) {
    this.sensitivity = sensitivity;
    this.pointers = new Map();
    this.firePointers = new Set();
    this.yaw = 0;
  }

  begin(identifier, x, fire = false) {
    if (identifier == null || !Number.isFinite(x)) return;
    this.pointers.set(identifier, { x });
    if (fire) this.firePointers.add(identifier);
  }

  move(identifier, x) {
    const pointer = this.pointers.get(identifier);
    if (!pointer || !Number.isFinite(x)) return 0;
    const delta = (x - pointer.x) * this.sensitivity;
    pointer.x = x;
    this.yaw += delta;
    return delta;
  }

  end(identifier) {
    this.pointers.delete(identifier);
    this.firePointers.delete(identifier);
  }

  clear() {
    this.pointers.clear();
    this.firePointers.clear();
    this.yaw = 0;
  }

  consumeYaw() {
    const yaw = this.yaw;
    this.yaw = 0;
    return yaw;
  }

  get fireHeld() { return this.firePointers.size > 0; }
}

export class InputController {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.items = [];
    this.yaw = 0;
    this.mouseFireHeld = false;
    this.touchAim = new TouchAimState();
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
      if (event.button === 0) { this.mouseFireHeld = true; this.items.push(["fire"]); }
      if (event.button === 2) this.items.push(["scope"]);
      if (typeof this.canvas.requestPointerLock === "function" && navigator.maxTouchPoints === 0) {
        try {
          const request = this.canvas.requestPointerLock();
          if (request && typeof request.catch === "function") request.catch(() => {});
        } catch (error) {}
      }
    });
    window.addEventListener("mouseup", event => { if (event.button === 0) this.mouseFireHeld = false; });
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

    const beginAim = (event, fire = false) => {
      for (const touch of event.changedTouches) this.touchAim.begin(touch.identifier, touch.clientX, fire);
    };
    const moveAim = event => {
      let handled = false;
      for (const touch of event.changedTouches) {
        if (!this.touchAim.pointers.has(touch.identifier)) continue;
        this.touchAim.move(touch.identifier, touch.clientX);
        handled = true;
      }
      if (handled && event.cancelable) event.preventDefault();
    };
    const endAim = event => {
      for (const touch of event.changedTouches) this.touchAim.end(touch.identifier);
    };

    this.canvas.addEventListener("touchstart", event => {
      if (event.target === this.canvas) beginAim(event);
    }, { passive: true });
    this.canvas.addEventListener("touchmove", event => {
      moveAim(event);
    }, { passive: false });
    this.canvas.addEventListener("touchend", endAim, { passive: true });
    this.canvas.addEventListener("touchcancel", endAim, { passive: true });

    document.querySelectorAll("#mobile-controls [data-action]").forEach(button => {
      const action = button.dataset.action;
      button.addEventListener("touchstart", event => {
        event.preventDefault();
        if (action === "fire") beginAim(event, true);
        this.items.push([action]);
      }, { passive: false });
      if (action === "fire") button.addEventListener("touchmove", moveAim, { passive: false });
      button.addEventListener("touchend", event => {
        event.preventDefault();
        if (action === "fire") endAim(event);
      }, { passive: false });
      button.addEventListener("touchcancel", event => {
        if (event.cancelable) event.preventDefault();
        if (action === "fire") endAim(event);
      }, { passive: false });
      button.addEventListener("mousedown", () => {
        if (action === "fire") this.mouseFireHeld = true;
        this.items.push([action]);
      });
      button.addEventListener("mouseup", () => { if (action === "fire") this.mouseFireHeld = false; });
      button.addEventListener("mouseleave", event => {
        if (action === "fire" && event.buttons === 0) this.mouseFireHeld = false;
      });
    });
  }

  movement() {
    const x = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0) + this.touchMovement.x;
    const y = (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0) + this.touchMovement.y;
    const length = Math.hypot(x, y);
    return length > 1 ? { x: x / length, y: y / length } : { x, y };
  }

  consume() {
    const state = {
      yaw: this.yaw + this.touchAim.consumeYaw(),
      items: this.items.splice(0),
      movement: this.movement(),
      fireHeld: this.mouseFireHeld || this.touchAim.fireHeld,
    };
    this.yaw = 0;
    return state;
  }

  resetTransient() {
    this.keys.clear();
    this.items.length = 0;
    this.yaw = 0;
    this.mouseFireHeld = false;
    this.touchAim.clear();
    this.moveTouch = null;
    this.touchMovement = { x: 0, y: 0 };
  }
}
