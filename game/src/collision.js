// Collision: axis-aligned boxes only, no physics engine. Movement resolves per
// axis so a player slides along walls instead of sticking, and shots test the same
// boxes plus bot capsules, so what blocks your feet also blocks your bullets.
const _tmp = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

// Move a circle (radius r, height h, feet at y) by (dx, dz); returns the new
// position after sliding. y is vertical velocity handled by the caller.
export function moveCircle(boxes, pos, r, h, dx, dz) {
  let x = pos.x + dx;
  let z = pos.z;
  for (const b of boxes) {
    if (b.h <= 0.01) continue;
    // Vertical overlap: the box must reach above the feet to block.
    if (pos.y + h <= 0.05 || pos.y >= b.h) continue;
    if (x + r > b.x - b.w / 2 && x - r < b.x + b.w / 2 && z + r > b.z - b.d / 2 && z - r < b.z + b.d / 2) {
      if (dx > 0) x = b.x - b.w / 2 - r;
      else if (dx < 0) x = b.x + b.w / 2 + r;
    }
  }
  z = pos.z + dz;
  for (const b of boxes) {
    if (b.h <= 0.01) continue;
    if (pos.y + h <= 0.05 || pos.y >= b.h) continue;
    if (x + r > b.x - b.w / 2 && x - r < b.x + b.w / 2 && z + r > b.z - b.d / 2 && z - r < b.z + b.d / 2) {
      if (dz > 0) z = b.z - b.d / 2 - r;
      else if (dz < 0) z = b.z + b.d / 2 + r;
    }
  }
  return { x, z };
}

export function pointBlocked(boxes, x, z, y, r = 0.3) {
  for (const b of boxes) {
    if (y >= b.h) continue;
    if (x + r > b.x - b.w / 2 && x - r < b.x + b.w / 2 && z + r > b.z - b.d / 2 && z - r < b.z + b.d / 2) return true;
  }
  return false;
}

// Ray vs one AABB (slab method). Returns distance along the ray, or Infinity.
export function rayBox(ox, oy, oz, dx, dy, dz, b) {
  const minX = b.x - b.w / 2;
  const maxX = b.x + b.w / 2;
  const minY = 0;
  const maxY = b.h;
  const minZ = b.z - b.d / 2;
  const maxZ = b.z + b.d / 2;
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return Infinity;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}

export function rayWorld(boxes, ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  for (const b of boxes) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, b);
    if (t < best) best = t;
  }
  return best;
}

// Ray vs a vertical capsule (body) plus a head sphere. The capsule is the segment
// from feet+0.25 to feet+1.35 at radius 0.34; the head is a sphere at feet+1.52.
// Returns { t, part } for the nearest hit, or null.
export function rayCapsule(ox, oy, oz, dx, dy, dz, cx, cz, feetY, crouch) {
  const height = crouch ? 1.05 : 1.35;
  const headY = feetY + (crouch ? 1.12 : 1.52);
  const headR = 0.21;
  // Head sphere first (it pays to check the small target before the body).
  const hx = cx - ox;
  const hy = headY - oy;
  const hz = cz - oz;
  const b = hx * dx + hy * dy + hz * dz;
  const c = hx * hx + hy * hy + hz * hz - headR * headR;
  const disc = b * b - c;
  let bestT = Infinity;
  let part = null;
  if (disc >= 0) {
    const t = b - Math.sqrt(disc);
    if (t >= 0) { bestT = t; part = 'head'; }
  }
  // Body capsule: ray vs the vertical segment, in 2D + height check.
  const ex = cx - ox;
  const ez = cz - oz;
  const a2 = dx * dx + dz * dz;
  if (a2 > 1e-9) {
    const tca = (ex * dx + ez * dz) / a2;
    if (tca >= 0) {
      const px = ox + dx * tca;
      const pz = oz + dz * tca;
      const distSq = (px - cx) ** 2 + (pz - cz) ** 2;
      if (distSq <= 0.34 * 0.34) {
        const yAt = oy + dy * tca;
        if (yAt >= feetY && yAt <= feetY + height && tca < bestT) {
          bestT = tca;
          part = 'body';
        }
      }
    }
  }
  return part ? { t: bestT, part } : null;
}

// Line of sight between two eye points, blocked by any box taller than both ends
// can see over. Smoke is handled by the caller (a separate sphere test).
export function hasLineOfSight(boxes, ax, ay, az, bx, by, bz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1e-6) return true;
  const t = rayWorld(boxes, ax, ay, az, dx / dist, dy / dist, dz / dist, dist - 0.05);
  return t >= dist - 0.05;
}

export function segmentBlockedBySmoke(smokes, ax, ay, az, bx, by, bz) {
  for (const s of smokes) {
    // Segment-sphere: closest approach of the segment to the smoke centre.
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const lenSq = dx * dx + dy * dy + dz * dz;
    let t = 0;
    if (lenSq > 1e-9) {
      t = ((s.x - ax) * dx + (s.y - ay) * dy + (s.z - az) * dz) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const px = ax + dx * t;
    const py = ay + dy * t;
    const pz = az + dz * t;
    const dSq = (px - s.x) ** 2 + (py - s.y) ** 2 + (pz - s.z) ** 2;
    if (dSq < s.r * s.r * 0.7) return true;
  }
  return false;
}
