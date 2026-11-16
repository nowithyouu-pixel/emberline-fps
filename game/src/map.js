// Kestrel Yard: an original desert-industrial map. Two bomb sites (A west, B east),
// a mid corridor, long lanes on both flanks, and a connector through the middle.
// Coordinates: x east, z south. Attackers spawn south (z = +20), defenders north.
// Walls and crates are axis-aligned boxes: {x, z, w, d, h, kind}.
//   kind: 'wall' (tall, blocks sight), 'crate' (low 1.15 m, shoot over it),
//         'tall' (2.4 m container, blocks sight), 'arch' (walk-through gap).
import { rayWorld } from './collision.js';
export const MAP = {
  name: 'Kestrel Yard',
  bounds: { minX: -32, maxX: 32, minZ: -24, maxZ: 24 },
  sites: {
    A: { x: -23, z: -15, r: 6.5 },
    B: { x: 23, z: -15, r: 6.5 },
  },
  spawns: {
    // Yaw 0 faces north (-z, toward the sites); yaw PI faces south (+z).
    viper: [
      { x: -12, z: 20, yaw: 0 }, { x: -4, z: 21, yaw: 0 },
      { x: 4, z: 21, yaw: 0 }, { x: 12, z: 20, yaw: 0 },
      { x: 0, z: 18, yaw: 0 },
    ],
    sentinel: [
      { x: -21, z: -19, yaw: Math.PI }, { x: -8, z: -20, yaw: Math.PI },
      { x: 8, z: -20, yaw: Math.PI }, { x: 21, z: -19, yaw: Math.PI },
      { x: 0, z: -17, yaw: Math.PI },
    ],
  },
  bombCarrierSpawn: { x: 0, z: 18 },
  // Static colliders. Outer walls first, then interior structure.
  boxes: [
    // Outer shell (h = 4.5)
    { x: 0, z: -24.5, w: 66, d: 1, h: 4.5, kind: 'wall' },
    { x: 0, z: 24.5, w: 66, d: 1, h: 4.5, kind: 'wall' },
    { x: -32.5, z: 0, w: 1, d: 50, h: 4.5, kind: 'wall' },
    { x: 32.5, z: 0, w: 1, d: 50, h: 4.5, kind: 'wall' },
    // Mid corridor walls: two parallel walls with a doors gap at z = 2.
    { x: -4.5, z: 8, w: 1.4, d: 24, h: 4, kind: 'wall' },
    { x: 4.5, z: 8, w: 1.4, d: 24, h: 4, kind: 'wall' },
    // North pair, split: a 4 m side door at z in [-8,-4] joins mid to the connector.
    { x: -4.5, z: -2, w: 1.4, d: 4, h: 4, kind: 'wall' },
    { x: 4.5, z: -2, w: 1.4, d: 4, h: 4, kind: 'wall' },
    { x: -4.5, z: -11, w: 1.4, d: 6, h: 4, kind: 'wall' },
    { x: 4.5, z: -11, w: 1.4, d: 6, h: 4, kind: 'wall' },
    // Mid doors pillars (gap between them is the choke point).
    { x: -2.2, z: 2, w: 1.6, d: 1.2, h: 4, kind: 'wall' },
    { x: 2.2, z: 2, w: 1.6, d: 1.2, h: 4, kind: 'wall' },
    // A-long / B-long lane walls (lanes run along the flanks; north end at z=-7
    // leaves a cut from the connector into the sites).
    { x: -22.5, z: 6, w: 1.4, d: 26, h: 4, kind: 'wall' },
    { x: 22.5, z: 6, w: 1.4, d: 26, h: 4, kind: 'wall' },
    // Connector walls: mid to sites at z = -8, with gaps at the ends.
    { x: -12, z: -8.5, w: 15, d: 1.2, h: 3.4, kind: 'wall' },
    { x: 12, z: -8.5, w: 15, d: 1.2, h: 3.4, kind: 'wall' },
    // Site back walls: A and B pocket dividers.
    // (No full divider: the pockets stay open to the CT side so retakes path.)
    // Containers (tall, block sight) — the map's big cover.
    { x: -19, z: -4, w: 6, d: 2.4, h: 2.4, kind: 'tall' },
    { x: 19, z: -4, w: 6, d: 2.4, h: 2.4, kind: 'tall' },
    { x: -10, z: 12, w: 5, d: 2.2, h: 2.4, kind: 'tall' },
    { x: 10, z: 12, w: 5, d: 2.2, h: 2.4, kind: 'tall' },
    { x: -19, z: -18, w: 4.5, d: 2.2, h: 2.4, kind: 'tall' },
    { x: 19, z: -18, w: 4.5, d: 2.2, h: 2.4, kind: 'tall' },
    { x: 6, z: -13, w: 6, d: 2.4, h: 2.4, kind: 'tall' },
    // Low crates (1.15 m: block movement, not sight when standing).
    { x: -15, z: -12, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: -29.5, z: -16, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: 15, z: -12, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: 29.5, z: -16, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: -16, z: 2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    { x: 16, z: 2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    { x: 5, z: 17, w: 3, d: 1.6, h: 1.15, kind: 'crate' },
    { x: -8, z: -2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    { x: 8, z: -2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    { x: -29.5, z: 8, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: 29.5, z: 8, w: 2.4, d: 2.4, h: 1.15, kind: 'crate' },
    { x: -20, z: -2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    { x: 20, z: -2, w: 2.2, d: 2.2, h: 1.15, kind: 'crate' },
    // Double-stacked crates on the sites (2.3 m: real cover on site).
    { x: -25.5, z: -18.5, w: 2.4, d: 2.4, h: 2.3, kind: 'crate' },
    { x: 25.5, z: -18.5, w: 2.4, d: 2.4, h: 2.3, kind: 'crate' },
  ],
};

// Waypoint graph for bot routes. Nodes are walkable points; edges are straight,
// wall-free runs. Bots path with BFS and walk node to node. EDGES are validated
// at load: any edge whose segment a body cannot walk is dropped, so a bad line
// in this table can never strand a bot.
export const WAYPOINTS = [
  { id: 'vSpawn', x: 0, z: 22 },
  { id: 'vWest', x: -12, z: 22 },
  { id: 'vEast', x: 12, z: 22 },
  { id: 'aLaneIn', x: -27, z: 22 },
  { id: 'bLaneIn', x: 27, z: 22 },
  { id: 'midBot', x: 0, z: 13 },
  { id: 'mid', x: 0, z: 6 },
  { id: 'midDoors', x: 0, z: 2 },
  { id: 'midTop', x: 0, z: -5 },
  { id: 'aYard', x: -14, z: 4 },
  { id: 'bYard', x: 14, z: 4 },
  { id: 'aLongBot', x: -27, z: 13 },
  { id: 'aLong', x: -27, z: 2 },
  { id: 'aLongTop', x: -27, z: -9 },
  { id: 'aSite', x: -23, z: -14 },
  { id: 'aSite2', x: -18, z: -12 },
  { id: 'aBack', x: -28, z: -19 },
  { id: 'bLongBot', x: 27, z: 13 },
  { id: 'bLong', x: 27, z: 2 },
  { id: 'bLongTop', x: 27, z: -9 },
  { id: 'bSite', x: 23, z: -14 },
  { id: 'bSite2', x: 18, z: -12 },
  { id: 'bBack', x: 28, z: -19 },
  { id: 'aWest', x: -24, z: -8 },
  { id: 'bWest', x: 24, z: -8 },
  { id: 'aConn', x: -11, z: -5 },
  { id: 'bConn', x: 11, z: -5 },
  { id: 'ctMid', x: 0, z: -16 },
  { id: 'ctA', x: -13, z: -19 },
  { id: 'ctB', x: 13, z: -19 },
  { id: 'midLow', x: 0, z: 10 },
];

const EDGES = [
  ['vSpawn', 'vWest'], ['vSpawn', 'vEast'], ['vSpawn', 'midBot'],
  ['vWest', 'aLaneIn'], ['vEast', 'bLaneIn'],
  ['aLaneIn', 'aLongBot'], ['bLaneIn', 'bLongBot'],
  ['vWest', 'midBot'], ['vEast', 'midBot'],
  ['midBot', 'midLow'], ['midLow', 'mid'], ['mid', 'midDoors'],
  ['midDoors', 'midTop'], ['midTop', 'aConn'], ['midTop', 'bConn'], ['midTop', 'ctMid'],
  ['mid', 'aYard'], ['mid', 'bYard'],
  ['aYard', 'vWest'], ['bYard', 'vEast'],
  ['aYard', 'aConn'], ['bYard', 'bConn'],
  ['aConn', 'aWest'], ['bConn', 'bWest'],
  ['aWest', 'aSite'], ['bWest', 'bSite'],
  ['aWest', 'aSite2'], ['bWest', 'bSite2'],
  ['aLongBot', 'aLong'], ['aLong', 'aLongTop'], ['aLongTop', 'aSite'], ['aLongTop', 'aBack'],
  ['aSite', 'aSite2'], ['aSite', 'aBack'], ['aSite2', 'ctA'],
  ['bLongBot', 'bLong'], ['bLong', 'bLongTop'], ['bLongTop', 'bSite'], ['bLongTop', 'bBack'],
  ['bSite', 'bSite2'], ['bSite', 'bBack'], ['bSite2', 'ctB'],
  ['ctMid', 'ctA'], ['ctMid', 'ctB'],
];

export const NAV = (() => {
  const nodes = new Map(WAYPOINTS.map((w) => [w.id, w]));
  const adj = new Map(WAYPOINTS.map((w) => [w.id, []]));
  for (const [a, b] of EDGES) {
    const wa = nodes.get(a);
    const wb = nodes.get(b);
    if (!wa || !wb) continue;
    // A body-height ray (y = 0.9) from a to b must reach b: otherwise a wall,
    // container or crate sits on the run and the edge would strand a bot.
    const dx = wb.x - wa.x;
    const dz = wb.z - wa.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const hit = rayWorld(MAP.boxes, wa.x, 0.9, wa.z, dx / len, 0, dz / len, len - 0.2);
    if (hit < len - 0.2) continue;
    adj.get(a).push(b);
    adj.get(b).push(a);
  }
  function nearest(x, z) {
    let best = null;
    let bestD = Infinity;
    for (const w of WAYPOINTS) {
      const d = (w.x - x) ** 2 + (w.z - z) ** 2;
      if (d < bestD) { bestD = d; best = w.id; }
    }
    return best;
  }
  // BFS shortest path of waypoint ids from (x, z) to target id.
  function path(x, z, targetId) {
    const start = nearest(x, z);
    if (start === targetId) return [targetId];
    const prev = new Map([[start, null]]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift();
      for (const next of adj.get(cur)) {
        if (!prev.has(next)) {
          prev.set(next, cur);
          if (next === targetId) {
            const out = [next];
            let n = cur;
            while (n !== null) { out.unshift(n); n = prev.get(n); }
            return out;
          }
          queue.push(next);
        }
      }
    }
    return [targetId];
  }
  return { nodes, adj, nearest, path };
})();

// Defender hold spots: where each Sentinel waits, and which way it faces (yaw).
export const HOLD_SPOTS = [
  { node: 'aSite2', yaw: Math.PI * 0.85, site: 'A' },
  { node: 'ctA', yaw: Math.PI * 0.6, site: 'A' },
  { node: 'bSite2', yaw: Math.PI * 1.15, site: 'B' },
  { node: 'ctB', yaw: Math.PI * 1.4, site: 'B' },
  { node: 'midTop', yaw: Math.PI, site: 'mid' },
];

// Attacker route plans: named routes to a site, as waypoint sequences.
export const ROUTES = {
  A_long: ['aLaneIn', 'aLongBot', 'aLong', 'aLongTop', 'aSite'],
  A_mid: ['midBot', 'mid', 'midDoors', 'midTop', 'aConn', 'aWest', 'aSite'],
  A_yard: ['vWest', 'aYard', 'aConn', 'aWest', 'aSite'],
  B_long: ['bLaneIn', 'bLongBot', 'bLong', 'bLongTop', 'bSite'],
  B_mid: ['midBot', 'mid', 'midDoors', 'midTop', 'bConn', 'bWest', 'bSite'],
  B_yard: ['vEast', 'bYard', 'bConn', 'bWest', 'bSite'],
  mid: ['midBot', 'mid', 'midDoors', 'midTop', 'ctMid'],
};

export const BOT_NAMES = {
  viper: ['Dune', 'Sable', 'Rook', 'Fennec', 'Jackal'],
  sentinel: ['Heron', 'Kite', 'Bastion', 'Warden', 'Sirocco'],
};
