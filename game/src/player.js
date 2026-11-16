// The player: acceleration-based movement with crouch, jump, recoil and health.
// Position is feet; eye height 1.62 standing, 1.12 crouched. One fixed step moves
// it; rendering only reads the state.
import { moveCircle } from './collision.js';
import { WEAPONS } from './weapons.js';

const RADIUS = 0.36;
const EYE_STAND = 1.62;
const EYE_CROUCH = 1.12;
const HEIGHT_STAND = 1.75;
const HEIGHT_CROUCH = 1.2;
const GRAVITY = 22;
const JUMP_VEL = 7.2;

export function createPlayer(colliders, spawn) {
  const state = {
    position: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw,
    pitch: 0,
    eye: EYE_STAND,
    height: HEIGHT_STAND,
    crouching: false,
    onGround: true,
    health: 100,
    armor: 0,
    helmet: false,
    alive: true,
    recoilPitch: 0,
    recoilYaw: 0,
    speed: 0,
    money: 800,
    primary: null,
    sidearm: 'pistol',
    activeSlot: 'primary',
    grenades: { frag: 0, smoke: 0, flash: 0 },
    hasBomb: false,
    kills: 0,
    deaths: 0,
  };

  function currentWeaponDef() {
    const id = state.activeSlot === 'primary' ? state.primary : state.sidearm;
    return WEAPONS[id || 'pistol'];
  }

  function step(dt, keys, ads) {
    if (!state.alive) return;
    const def = currentWeaponDef();
    const crouch = keys.has('ControlLeft') || keys.has('ControlRight');
    state.crouching = crouch;
    const targetEye = crouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);
    state.height = crouch ? HEIGHT_CROUCH : HEIGHT_STAND;

    let baseSpeed = def.moveSpeed;
    if (crouch) baseSpeed *= 0.55;
    if (ads) baseSpeed *= 0.55;
    if (keys.has('ShiftLeft') || keys.has('ShiftRight')) baseSpeed *= 0.62; // walk: quiet, accurate

    let fwd = 0;
    let strafe = 0;
    if (keys.has('KeyW')) fwd += 1;
    if (keys.has('KeyS')) fwd -= 1;
    if (keys.has('KeyD')) strafe += 1;
    if (keys.has('KeyA')) strafe -= 1;
    const len = Math.hypot(fwd, strafe) || 1;
    fwd /= len;
    strafe /= len;

    const sin = Math.sin(state.yaw);
    const cos = Math.cos(state.yaw);
    const wishX = (-sin * fwd + cos * strafe) * baseSpeed;
    const wishZ = (-cos * fwd - sin * strafe) * baseSpeed;

    // Accelerate toward the wish velocity; ground friction when no input.
    const accel = state.onGround ? 34 : 8;
    state.vel.x += (wishX - state.vel.x) * Math.min(1, accel * dt / baseSpeed * 4.2);
    state.vel.z += (wishZ - state.vel.z) * Math.min(1, accel * dt / baseSpeed * 4.2);
    if (fwd === 0 && strafe === 0 && state.onGround) {
      state.vel.x *= Math.max(0, 1 - dt * 10);
      state.vel.z *= Math.max(0, 1 - dt * 10);
    }

    if (keys.has('Space') && state.onGround) {
      state.vel.y = JUMP_VEL;
      state.onGround = false;
    }
    state.vel.y -= GRAVITY * dt;
    let newY = state.position.y + state.vel.y * dt;
    if (newY <= 0) { newY = 0; state.vel.y = 0; state.onGround = true; }

    const moved = moveCircle(colliders, state.position, RADIUS, state.height, state.vel.x * dt, state.vel.z * dt);
    state.position.x = moved.x;
    state.position.z = moved.z;
    state.position.y = newY;
    state.speed = Math.hypot(state.vel.x, state.vel.z);

    // Recoil recovers toward zero; the pitch the player sees is pitch + recoil.
    state.recoilPitch = approach(state.recoilPitch, 0, dt * 0.09);
    state.recoilYaw = approach(state.recoilYaw, 0, dt * 0.06);
  }

  function approach(v, target, stepSize) {
    if (v > target) return Math.max(target, v - stepSize);
    if (v < target) return Math.min(target, v + stepSize);
    return v;
  }

  function look(dx, dy, sensitivity = 0.0021, ads = false) {
    const s = sensitivity * (ads ? 0.55 : 1);
    state.yaw -= dx * s;
    state.pitch -= dy * s;
    state.pitch = Math.max(-1.53, Math.min(1.53, state.pitch));
  }

  function addRecoil(pitch, yaw) {
    state.recoilPitch = Math.min(0.14, state.recoilPitch + pitch);
    state.recoilYaw = Math.max(-0.05, Math.min(0.05, state.recoilYaw + yaw));
  }

  // Damage with armour: armour absorbs half of what remains after the helmet
  // halves a headshot. Returns the damage actually taken.
  function damage(amount, part) {
    if (!state.alive) return 0;
    let dmg = amount;
    if (part === 'head' && state.helmet) dmg *= 0.5;
    let absorbed = 0;
    if (state.armor > 0) {
      absorbed = Math.min(state.armor, dmg * 0.5);
      state.armor -= absorbed;
      dmg -= absorbed;
    }
    state.health -= dmg;
    if (state.health <= 0) {
      state.health = 0;
      state.alive = false;
      state.deaths += 1;
    }
    return dmg;
  }

  function reset(spawnPoint, money) {
    state.position.x = spawnPoint.x;
    state.position.z = spawnPoint.z;
    state.position.y = 0;
    state.vel.x = 0; state.vel.y = 0; state.vel.z = 0;
    state.yaw = spawnPoint.yaw;
    state.pitch = 0;
    state.recoilPitch = 0;
    state.recoilYaw = 0;
    state.health = 100;
    state.armor = 0;
    state.helmet = false;
    state.alive = true;
    state.money = money;
    state.primary = null;
    state.sidearm = 'pistol';
    state.activeSlot = 'primary';
    state.grenades = { frag: 0, smoke: 0, flash: 0 };
    state.hasBomb = false;
    state.crouching = false;
  }

  return { state, step, look, addRecoil, damage, reset, currentWeaponDef };
}
