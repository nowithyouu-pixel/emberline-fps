// The bomb: carried, planted, ticking, defused or detonated. State lives here;
// the mesh and the beeps are main.js's job, fed by this module's numbers.
import { MAP } from './map.js';

export const BOMB = {
  plantTime: 3.5,
  defuseTime: 5,
  fuseTime: 40,
  explodeRadius: 13,
  explodeDamage: 220,
};

export function createBomb() {
  return {
    carrier: null, // 'player' | bot object | null
    site: null, // 'A' | 'B'
    x: 0, y: 0, z: 0,
    planted: false,
    plantProgress: 0,
    defuseProgress: 0,
    defuser: null,
    fuseLeft: 0,
    exploded: false,
    defused: false,
  };
}

export function sitePos(site) {
  const s = MAP.sites[site];
  return { x: s.x, z: s.z, r: s.r };
}

export function inSite(x, z) {
  for (const [name, s] of Object.entries(MAP.sites)) {
    if (Math.hypot(x - s.x, z - s.z) < s.r) return name;
  }
  return null;
}

// Called every fixed step while the bomb is planted: counts the fuse down and
// reports the explosion the moment it reaches zero.
export function bombStep(bomb, dt) {
  if (!bomb.planted || bomb.exploded || bomb.defused) return null;
  bomb.fuseLeft -= dt;
  if (bomb.fuseLeft <= 0) {
    bomb.exploded = true;
    return { type: 'exploded', x: bomb.x, z: bomb.z };
  }
  return null;
}

export function plantBomb(bomb, site) {
  bomb.planted = true;
  bomb.site = site;
  bomb.x = MAP.sites[site].x;
  bomb.z = MAP.sites[site].z;
  bomb.y = 0.1;
  bomb.fuseLeft = BOMB.fuseTime;
  bomb.plantProgress = 0;
  bomb.carrier = null;
}

export function resetBomb(bomb) {
  bomb.carrier = null;
  bomb.site = null;
  bomb.planted = false;
  bomb.plantProgress = 0;
  bomb.defuseProgress = 0;
  bomb.defuser = null;
  bomb.fuseLeft = 0;
  bomb.exploded = false;
  bomb.defused = false;
}
