// Grenades: thrown with an arc, bouncing off walls, then doing their job.
// Frag hurts by distance and line of sight; smoke blocks sight for 18 seconds;
// flash blinds anyone facing it. One shared physics step for all three kinds.
import { GRENADES } from './weapons.js';
import { moveCircle, rayWorld } from './collision.js';

const GRAVITY = 14;

export function createGrenades() {
  return {
    flying: [], // { kind, x, y, z, vx, vy, vz, fuse, owner }
    smokes: [], // { x, y, z, r, until }
    flashes: [], // { x, y, z, at }
  };
}

export function throwGrenade(state, kind, from, dir, speed = 13) {
  const def = GRENADES[kind];
  state.flying.push({
    kind,
    x: from.x, y: from.y, z: from.z,
    vx: dir.x * speed, vy: dir.y * speed + 2.2, vz: dir.z * speed,
    fuse: def.fuse,
    owner: null,
    bounced: 0,
  });
}

// Step flying grenades; returns events: [{ type: 'frag'|'smoke'|'flash', ... }].
export function grenadesStep(state, dt, time, colliders) {
  const events = [];
  for (let i = state.flying.length - 1; i >= 0; i -= 1) {
    const g = state.flying[i];
    g.fuse -= dt;
    g.vy -= GRAVITY * dt;
    const nx = g.x + g.vx * dt;
    const ny = g.y + g.vy * dt;
    const nz = g.z + g.vz * dt;
    // Wall bounce: test each axis against the boxes, reflect and dampen.
    const moved = moveCircle(colliders, { x: g.x, y: g.y, z: g.z }, 0.12, 0.3, g.vx * dt, g.vz * dt);
    if (moved.x !== nx) { g.vx = -g.vx * 0.45; g.bounced += 1; events.push({ type: 'bounce', x: g.x, y: g.y, z: g.z }); }
    if (moved.z !== nz) { g.vz = -g.vz * 0.45; g.bounced += 1; events.push({ type: 'bounce', x: g.x, y: g.y, z: g.z }); }
    g.x = moved.x;
    g.z = moved.z;
    g.y = ny;
    if (g.y < 0.12) { g.y = 0.12; g.vy = Math.abs(g.vy) * 0.4; g.vx *= 0.7; g.vz *= 0.7; g.bounced += 1; }
    if (g.fuse <= 0) {
      state.flying.splice(i, 1);
      if (g.kind === 'frag') {
        events.push({ type: 'frag', x: g.x, y: g.y, z: g.z, radius: GRENADES.frag.radius, damage: GRENADES.frag.damage });
      } else if (g.kind === 'smoke') {
        state.smokes.push({ x: g.x, y: 1.1, z: g.z, r: GRENADES.smoke.radius, until: time + GRENADES.smoke.duration });
        events.push({ type: 'smoke', x: g.x, y: g.y, z: g.z });
      } else {
        state.flashes.push({ x: g.x, y: g.y, z: g.z, at: time });
        events.push({ type: 'flash', x: g.x, y: g.y, z: g.z, radius: GRENADES.flash.radius });
      }
    }
  }
  // Expire old smoke.
  for (let i = state.smokes.length - 1; i >= 0; i -= 1) {
    if (time > state.smokes[i].until) state.smokes.splice(i, 1);
  }
  // Flash records are only needed for one step; main.js consumes them at once.
  return events;
}

// Frag damage at a point: falls off with distance, halved without line of sight.
export function fragDamageAt(colliders, fx, fy, fz, tx, ty, tz, radius, damage) {
  const dist = Math.hypot(tx - fx, ty - fy, tz - fz);
  if (dist > radius) return 0;
  const wall = rayWorld(colliders, fx, fy, fz, (tx - fx) / (dist || 1), (ty - fy) / (dist || 1), (tz - fz) / (dist || 1), dist);
  const los = wall >= dist - 0.05;
  const base = damage * (1 - (dist / radius) * 0.75);
  return los ? base : base * 0.45;
}

// Flash strength for an eye at (ex, ey, ez) facing yaw: 0 (unaffected) to 1.
export function flashStrength(colliders, fx, fy, fz, ex, ey, ez, yaw, radius) {
  const dx = fx - ex;
  const dy = fy - ey;
  const dz = fz - ez;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > radius) return 0;
  const wall = rayWorld(colliders, ex, ey, ez, dx / (dist || 1), dy / (dist || 1), dz / (dist || 1), dist);
  if (wall < dist - 0.05) return 0; // behind cover: safe
  // Facing the flash hurts most; looking away still stings up close.
  const ang = Math.atan2(-dx, -dz);
  let dAng = Math.abs(ang - yaw);
  if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
  const facing = Math.max(0, 1 - dAng / 1.9);
  const proximity = 1 - dist / radius;
  return Math.min(1, 0.35 + facing * 0.65) * (0.45 + proximity * 0.55);
}
