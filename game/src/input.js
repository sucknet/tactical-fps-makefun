// Input: pointer lock, key states, per-frame mouse deltas, weapon slots and buy-menu keys.
// One place owns every DOM listener; the simulation only reads takeLook() and state.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();     // keys pressed this frame (cleared by takePressed)
  const state = {
    keys,
    firing: false,
    scopeHeld: false,
    wheel: 0,
  };
  let lookX = 0;
  let lookY = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (['Space', 'Tab', 'ControlLeft'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
  }
  function onMouseDown(e) {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.scopeHeld = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.scopeHeld = false;
  }
  function onMouseMove(e) {
    if (document.pointerLockElement !== canvas) return;
    lookX += e.movementX;
    lookY += e.movementY;
  }
  function onWheel(e) {
    state.wheel += Math.sign(e.deltaY);
    e.preventDefault();
  }
  function onContext(e) {
    e.preventDefault();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('contextmenu', onContext);

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === canvas;
    if (!locked) {
      keys.clear();
      state.firing = false;
      state.scopeHeld = false;
    }
    onLockChange(locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const out = { x: lookX, y: lookY };
      lookX = 0;
      lookY = 0;
      return out;
    },
    takePressed() {
      const out = pressed;
      pressed.clear === undefined ? null : null;
      const fresh = new Set(pressed);
      pressed.clear();
      return fresh;
    },
  };
}
