// Input: keyboard state, mouse look deltas, pointer lock and firing. The game
// reads this state once per fixed step, never from event handlers directly.
export function createInput(canvas, callbacks) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let firing = false;
  let locked = false;
  let ads = false;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, true);
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    if (callbacks.onKey) callbacks.onKey(e.code, false);
  }
  function onMouseMove(e) {
    if (!locked) return;
    look.x += e.movementX || 0;
    look.y += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) firing = true;
    if (e.button === 2) ads = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
    if (e.button === 2) ads = false;
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (callbacks.onLockChange) callbacks.onLockChange(locked);
    if (!locked) { firing = false; ads = false; }
  }
  function onContextMenu(e) { e.preventDefault(); }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('contextmenu', onContextMenu);

  return {
    keys,
    get firing() { return firing; },
    get ads() { return ads; },
    get locked() { return locked; },
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    requestLock() {
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(() => canvas.requestPointerLock());
      } catch {
        try { canvas.requestPointerLock(); } catch { /* headless: no lock */ }
      }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    clear() { keys.clear(); firing = false; ads = false; },
  };
}
