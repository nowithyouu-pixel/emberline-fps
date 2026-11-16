// Shared shooting: one hitscan routine for the player and every bot, so a bullet
// obeys the same walls, smoke and hitboxes whoever fired it. Spread is applied
// by the caller; this function only resolves where the ray goes.
import { rayWorld, rayCapsule, segmentBlockedBySmoke } from './collision.js';
import { damageAtRange } from './weapons.js';

// targets: array of { id, team, alive, x, z, feetY, crouch, armor, helmet, health }.
// excludeTeam skips the shooter's own team so a bullet never stops on a mate.
// Returns null (no hit) or { target, part, distance, point, wallDistance }.
export function fireHitscan(origin, dir, def, rng, targets, colliders, smokes, maxDist = 120, excludeTeam = null) {
  const wallDist = rayWorld(colliders, origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  let best = null;
  for (const t of targets) {
    if (!t.alive) continue;
    if (excludeTeam && t.team === excludeTeam) continue;
    const hit = rayCapsule(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, t.x, t.z, t.feetY, t.crouch);
    if (hit && hit.t < wallDist && hit.t < maxDist) {
      if (!best || hit.t < best.distance) best = { target: t, part: hit.part, distance: hit.t };
    }
  }
  if (!best) return { hit: false, wallDistance: wallDist };
  // Smoke between muzzle and target swallows the shot.
  if (smokes && smokes.length) {
    const px = origin.x + dir.x * best.distance;
    const py = origin.y + dir.y * best.distance;
    const pz = origin.z + dir.z * best.distance;
    if (segmentBlockedBySmoke(smokes, origin.x, origin.y, origin.z, px, py, pz)) {
      return { hit: false, wallDistance: best.distance, smoked: true };
    }
  }
  return {
    hit: true,
    target: best.target,
    part: best.part,
    distance: best.distance,
    wallDistance: wallDist,
    point: {
      x: origin.x + dir.x * best.distance,
      y: origin.y + dir.y * best.distance,
      z: origin.z + dir.z * best.distance,
    },
  };
}

// Final damage after range falloff, armour and helmet. Mutates the target's
// health/armour and reports what happened.
export function applyHit(def, distance, part, target) {
  let dmg = damageAtRange(def, distance);
  if (part === 'head') dmg *= def.headMult;
  if (part === 'head' && target.helmet) dmg *= 0.5;
  let absorbed = 0;
  if (target.armor > 0) {
    absorbed = Math.min(target.armor, dmg * 0.5);
    target.armor -= absorbed;
    dmg -= absorbed;
  }
  target.health -= dmg;
  const killed = target.health <= 0;
  if (killed) target.health = 0;
  return { damage: dmg, absorbed, killed, headshot: part === 'head' };
}

// Direction from origin toward target with gaussian aim error (radians).
export function aimWithError(rng, ox, oy, oz, tx, ty, tz, errorRad) {
  const dx = tx - ox;
  const dy = ty - oy;
  const dz = tz - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  const ex = rng.gauss() * errorRad;
  const ey = rng.gauss() * errorRad;
  // Error applied in the horizontal plane and vertically, then normalised.
  const dir = { x: dx / len + ex, y: dy / len + ey, z: dz / len + ex * 0.7 };
  const n = Math.hypot(dir.x, dir.y, dir.z) || 1;
  return { x: dir.x / n, y: dir.y / n, z: dir.z / n };
}
