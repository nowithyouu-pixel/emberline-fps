// Bots: one entity per bot, a small state machine over a waypoint graph.
// They pick a route or a hold spot at round start, scan for enemies on a tick,
// react after a human-like delay, fire in bursts, and play the objective: the
// carrier plants, defenders retake and defuse, everyone rotates on sound.
import * as THREE from 'three';
import { NAV, ROUTES, HOLD_SPOTS, BOT_NAMES } from './map.js';
import { sitePos } from './bomb.js';
import { WEAPONS } from './weapons.js';
import { moveCircle, hasLineOfSight, segmentBlockedBySmoke } from './collision.js';
import { fireHitscan, applyHit, aimWithError } from './combat.js';
import { teamColor } from './palette.js';

const BOT_RADIUS = 0.36;
const EYE = 1.55;
const SCAN_INTERVAL = 0.12;

function makeBotMesh(scene, team) {
  const group = new THREE.Group();
  const color = teamColor(team);
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.4 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xc79b76, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.95, 10), bodyMat);
  body.position.y = 0.85;
  body.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.34, 0.3), darkMat);
  chest.position.set(0, 1.05, 0);
  chest.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), skinMat);
  head.position.y = 1.52;
  head.castShadow = true;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), darkMat);
  helmet.position.y = 1.56;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.62), darkMat);
  gun.position.set(0.2, 1.15, -0.35);
  // Team chevron above the head: reads at a glance, occluded by walls like anything.
  const marker = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.22, 4),
    new THREE.MeshBasicMaterial({ color }),
  );
  marker.position.y = 1.95;
  marker.rotation.y = Math.PI / 4;
  group.add(body, chest, head, helmet, gun, marker);
  group.userData.marker = marker;
  scene.add(group);
  return group;
}

export function createBot(scene, team, index, rng, opts = {}) {
  const names = BOT_NAMES[team];
  const bot = {
    id: `${team}-${index}`,
    name: names[index % names.length],
    team,
    isPlayer: false,
    alive: true,
    health: 100,
    armor: 0,
    helmet: false,
    x: 0, z: 0, feetY: 0,
    yaw: 0,
    pitch: 0,
    crouch: false,
    speed: 0,
    skill: 0.55 + rng.next() * 0.35,
    weaponId: opts.weaponId || 'rifle',
    weapon: null,
    state: 'idle',
    route: [],
    routeIndex: 0,
    hold: null,
    target: null,
    lastSeen: null,
    lastSeenTime: -99,
    reactionUntil: 0,
    burstLeft: 0,
    burstPauseUntil: 0,
    nextShotAt: 0,
    scanAt: rng.next() * SCAN_INTERVAL,
    strafeDir: 1,
    strafeUntil: 0,
    plantProgress: 0,
    defuseProgress: 0,
    blindUntil: 0,
    heardAt: null,
    heardTime: -99,
    plan: null,
    hasBomb: false,
    grenades: { frag: 1, smoke: 0, flash: 0 },
    mesh: null,
    kills: 0,
    // Reused temporaries (no allocation in the hot loop).
    _move: { x: 0, z: 0 },
  };
  bot.mesh = makeBotMesh(scene, team);
  bot.weapon = { def: WEAPONS[bot.weaponId], mag: WEAPONS[bot.weaponId].mag, reserve: WEAPONS[bot.weaponId].reserve, reloading: 0, cooldown: 0 };
  return bot;
}

function eyePos(b) {
  return { x: b.x, y: b.feetY + (b.crouch ? 1.12 : EYE), z: b.z };
}

function targetEyePos(t) {
  const crouch = t.isPlayer ? (t.crouching || false) : (t.crouch || false);
  const y = t.isPlayer ? (t.position ? t.position.y + (t.eye || 1.62) : 1.62) : (t.feetY + (crouch ? 1.12 : 1.5));
  const x = t.isPlayer ? t.position.x : t.x;
  const z = t.isPlayer ? t.position.z : t.z;
  return { x, y, z };
}

function targetChestPos(t) {
  const e = targetEyePos(t);
  return { x: e.x, y: e.y - 0.35, z: e.z };
}

function canSee(bot, enemy, colliders, smokes) {
  const from = eyePos(bot);
  const to = targetEyePos(enemy);
  if (!hasLineOfSight(colliders, from.x, from.y, from.z, to.x, to.y, to.z)) return false;
  if (smokes && smokes.length && segmentBlockedBySmoke(smokes, from.x, from.y, from.z, to.x, to.y, to.z)) return false;
  return true;
}

export function botReset(bot, spawn, weaponId, rng) {
  bot.x = spawn.x;
  bot.z = spawn.z;
  bot.feetY = 0;
  bot.yaw = spawn.yaw;
  bot.pitch = 0;
  bot.alive = true;
  bot.health = 100;
  bot.armor = 0;
  bot.helmet = false;
  bot.crouch = false;
  bot.speed = 0;
  bot.weaponId = weaponId;
  bot.weapon = { def: WEAPONS[weaponId], mag: WEAPONS[weaponId].mag, reserve: WEAPONS[weaponId].reserve, reloading: 0, cooldown: 0 };
  bot.state = 'idle';
  bot.route = [];
  bot.routeIndex = 0;
  bot.hold = null;
  bot.target = null;
  bot.lastSeen = null;
  bot.plantProgress = 0;
  bot.defuseProgress = 0;
  bot.blindUntil = 0;
  bot.hasBomb = false;
  bot.grenades = { frag: 1, smoke: weaponId === 'rifle' ? 1 : 0, flash: 0 };
  bot.mesh.visible = true;
  bot.mesh.rotation.set(0, bot.yaw, 0);
  bot.mesh.position.set(bot.x, 0, bot.z);
}

// Round plan: attackers get a site and a route each; defenders get hold spots.
export function assignPlans(bots, rng, bombSite) {
  const attackers = bots.filter((b) => b.team === 'viper');
  const defenders = bots.filter((b) => b.team === 'sentinel');
  const site = bombSite;
  const other = site === 'A' ? 'B' : 'A';
  const routeKeys = [`${site}_long`, `${site}_mid`, `${site}_yard`, `${other}_long`, 'mid'];
  attackers.forEach((b, i) => {
    const key = routeKeys[i % routeKeys.length];
    b.plan = { site, routeKey: key };
    b.route = ROUTES[key].slice();
    b.routeIndex = 0;
    b.state = 'route';
  });
  // Carrier: the attacker on the site's main route.
  const carrier = attackers.find((b) => b.plan.routeKey === `${site}_long`) || attackers[0];
  carrier.hasBomb = true;
  // Defenders: two on the target site, one on the other, one mid, one flex.
  const spots = HOLD_SPOTS.filter((s) => s.site === site)
    .concat(HOLD_SPOTS.filter((s) => s.site === other))
    .concat(HOLD_SPOTS.filter((s) => s.site === 'mid'));
  defenders.forEach((b, i) => {
    const spot = spots[i % spots.length];
    b.hold = spot;
    b.state = 'hold';
    const node = NAV.nodes.get(spot.node);
    b.x = node.x;
    b.z = node.z;
    b.yaw = spot.yaw;
  });
}

export function botDamage(bot, amount, part) {
  let dmg = amount;
  if (part === 'head' && bot.helmet) dmg *= 0.5;
  let absorbed = 0;
  if (bot.armor > 0) {
    absorbed = Math.min(bot.armor, dmg * 0.5);
    bot.armor -= absorbed;
    dmg -= absorbed;
  }
  bot.health -= dmg;
  if (bot.health <= 0) {
    bot.health = 0;
    killBot(bot);
  }
  return { damage: dmg, absorbed, killed: !bot.alive, headshot: part === 'head' };
}

// A bot's death: stops the AI, drops the body, hides the marker. applyHit in
// combat.js only moves health; whoever reads its `killed` must call this.
export function killBot(bot) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.state = 'dead';
  bot.mesh.rotation.x = -Math.PI / 2;
  bot.mesh.position.y = 0.25;
  bot.mesh.userData.marker.visible = false;
}

// One fixed step of bot AI. ctx carries the world the bot needs; events report
// shots, kills and noise so main.js can render and score them.
export function botStep(bot, dt, time, ctx, events) {
  if (!bot.alive) return;
  const { colliders, smokes, player, bots, bomb, rng } = ctx;
  const blinded = time < bot.blindUntil;
  bot.scanAt -= dt;

  // --- Perception tick: nearest visible enemy, preferring one that just fired.
  if (bot.scanAt <= 0) {
    bot.scanAt = SCAN_INTERVAL;
    let best = null;
    let bestScore = Infinity;
    const enemies = bots.filter((b) => b.team !== bot.team && b.alive);
    if (player.alive && player.team !== bot.team) enemies.push(player);
    const from = eyePos(bot);
    for (const e of enemies) {
      const to = targetEyePos(e);
      const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      if (dist > 70) continue;
      // Facing check: bots notice what is in front of them, or very close.
      const ang = Math.atan2(-(to.x - from.x), -(to.z - from.z));
      let dAng = Math.abs(ang - bot.yaw);
      if (dAng > Math.PI) dAng = Math.PI * 2 - dAng;
      if (dist > 6 && dAng > 1.9) continue;
      if (!canSee(bot, e, colliders, smokes)) continue;
      const score = dist + (e.justFired ? -6 : 0);
      if (score < bestScore) { bestScore = score; best = e; }
    }
    if (best) {
      const prev = bot.target;
      bot.target = best;
      bot.lastSeen = targetChestPos(best);
      bot.lastSeenTime = time;
      if (prev !== best) {
        // Reaction time: better bots answer faster.
        bot.reactionUntil = time + (0.55 - bot.skill * 0.3) + rng.next() * 0.25;
      }
    } else if (bot.target && time - bot.lastSeenTime > 2.5) {
      bot.target = null;
    }
  }

  const engaging = bot.target && bot.target.alive && time >= bot.reactionUntil && !blinded;
  const speed = bot.crouch ? 2.2 : 4.3;

  // --- Objective states override movement.
  if (bomb.planted && bot.team === 'sentinel' && bot.state !== 'defuse' && bot.state !== 'engage') {
    // Retake: route to the planted site.
    if (bot.state !== 'retake') {
      bot.state = 'retake';
      bot.route = NAV.path(bot.x, bot.z, bomb.site === 'A' ? 'aSite' : 'bSite');
      bot.routeIndex = 0;
    }
  }
  if (bomb.planted && bot.team === 'viper' && bot.state !== 'engage' && bot.state !== 'hold') {
    bot.state = 'hold';
    const node = NAV.nodes.get(bomb.site === 'A' ? 'aSite2' : 'bSite2');
    bot.hold = { node: bomb.site === 'A' ? 'aSite2' : 'bSite2', yaw: bot.yaw, site: bomb.site };
    bot.x = bot.x; // hold where it stands; face the site entry below.
  }

  let moving = false;
  let wishX = 0;
  let wishZ = 0;

  if (engaging) {
    // Face the target; strafe to be a harder target; fire in bursts.
    const to = targetChestPos(bot.target);
    const from = eyePos(bot);
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const dist = Math.hypot(dx, dz) || 1;
    bot.yaw = Math.atan2(-dx, -dz);
    if (time > bot.strafeUntil) {
      bot.strafeUntil = time + 0.7 + rng.next() * 0.9;
      bot.strafeDir = rng.chance(0.5) ? 1 : -1;
      if (rng.chance(0.3)) bot.strafeDir = 0;
    }
    if (bot.strafeDir !== 0 && dist > 5) {
      wishX = Math.cos(bot.yaw) * bot.strafeDir * speed * 0.5;
      wishZ = -Math.sin(bot.yaw) * bot.strafeDir * speed * 0.5;
      moving = true;
    }
    botShoot(bot, dt, time, ctx, events);
  } else if (bot.state === 'plant') {
    if (bomb.planted) {
      // Another carrier planted first (or the player did): hold instead.
      bot.state = 'hold';
      bot.plantProgress = 0;
      return;
    }
    bot.plantProgress += dt;
    if (bot.plantProgress >= 3.5) {
      bot.plantProgress = 0;
      bot.hasBomb = false;
      events.onPlanted(bot);
    }
  } else if (bot.state === 'defuse') {
    bot.defuseProgress += dt;
    if (bot.defuseProgress >= 5) {
      bot.defuseProgress = 0;
      events.onDefused(bot);
    }
  } else if (bot.state === 'route' || bot.state === 'retake') {
    const destId = bot.route[bot.routeIndex];
    if (!destId) {
      // Arrived: attackers at their site plant or hold; retakers defuse.
      if (bot.hasBomb && (bot.plan?.site === 'A' || bot.plan?.site === 'B')) {
        const site = sitePos(bot.plan.site);
        const d = Math.hypot(site.x - bot.x, site.z - bot.z);
        if (d < site.r * 0.8) { bot.state = 'plant'; bot.plantProgress = 0; }
        else bot.route = NAV.path(bot.x, bot.z, bot.plan.site === 'A' ? 'aSite' : 'bSite');
      } else if (bomb.planted && bot.team === 'sentinel') {
        const d = Math.hypot(bomb.x - bot.x, bomb.z - bot.z);
        if (d < 2.2) { bot.state = 'defuse'; bot.defuseProgress = 0; }
        else bot.route = NAV.path(bot.x, bot.z, bomb.site === 'A' ? 'aSite' : 'bSite');
      } else {
        bot.state = 'hold';
        bot.crouch = rng.chance(0.3);
        const node = NAV.nodes.get(destId || 'midTop');
        bot.hold = { node: destId || 'midTop', yaw: bot.yaw, site: bot.plan?.site || 'mid' };
      }
    } else {
      const node = NAV.nodes.get(destId);
      const dx = node.x - bot.x;
      const dz = node.z - bot.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.6) {
        bot.routeIndex += 1;
      } else {
        bot.yaw = Math.atan2(-dx, -dz);
        wishX = (dx / dist) * speed;
        wishZ = (dz / dist) * speed;
        moving = true;
        // Smoke the site entry when pushing onto a site with a smoke to spend.
        if (bot.grenades.smoke > 0 && (destId === 'aSite' || destId === 'bSite') && rng.chance(dt * 0.5)) {
          events.onThrowSmoke(bot, node.x, node.z);
          bot.grenades.smoke -= 1;
        }
      }
    }
  } else if (bot.state === 'hold' && bot.hold) {
    bot.yaw = bot.hold.yaw + Math.sin(time * 0.4 + bot.skill * 9) * 0.25;
  }

  // Hearing: a shot nearby turns a holding bot toward the noise for a moment.
  if (bot.heardAt && time - bot.heardTime < 1.2 && !engaging && bot.state === 'hold') {
    const dx = bot.heardAt.x - bot.x;
    const dz = bot.heardAt.z - bot.z;
    bot.yaw = Math.atan2(-dx, -dz);
  }

  if (moving && !blinded) {
    const moved = moveCircle(colliders, { x: bot.x, y: 0, z: bot.z }, BOT_RADIUS, 1.75, wishX * dt, wishZ * dt);
    bot.x = moved.x;
    bot.z = moved.z;
    bot.speed = speed;
  } else {
    bot.speed = 0;
  }

  // Mesh follows state; marker bobs gently.
  bot.mesh.position.set(bot.x, bot.feetY, bot.z);
  bot.mesh.rotation.y = bot.yaw;
  bot.mesh.userData.marker.position.y = 1.95 + Math.sin(time * 2 + bot.skill * 20) * 0.04;
  bot.mesh.userData.marker.visible = bot.alive;
  if (bot.state === 'dead') bot.mesh.rotation.x = -Math.PI / 2;
}

function botShoot(bot, dt, time, ctx, events) {
  const w = bot.weapon;
  const def = w.def;
  if (w.reloading > 0) {
    w.reloading -= dt;
    if (w.reloading <= 0) {
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    return;
  }
  if (w.mag === 0) {
    if (w.reserve > 0) w.reloading = def.reloadTime;
    return;
  }
  if (bot.burstLeft <= 0) {
    if (time < bot.burstPauseUntil) return;
    bot.burstLeft = def.auto ? 3 + Math.floor(ctx.rng.next() * 3) : 1;
    bot.burstPauseUntil = time + 0.45 + ctx.rng.next() * 0.5;
  }
  const interval = 60 / def.rpm;
  if (time < bot.nextShotAt) return;
  bot.nextShotAt = time + interval;

  const from = eyePos(bot);
  const target = bot.target;
  const to = targetChestPos(target);
  const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const targetSpeed = target.isPlayer ? (target.speed || 0) : (target.speed || 0);
  const movingPenalty = bot.speed > 0.5 ? 0.02 : 0;
  const error = (0.016 + dist * 0.00085 + targetSpeed * 0.0016 + movingPenalty) * (1.35 - bot.skill * 0.6);
  // One shot in eight goes for the head.
  const aimPoint = ctx.rng.chance(0.12) ? targetEyePos(target) : to;
  const dir = aimWithError(ctx.rng, from.x, from.y, from.z, aimPoint.x, aimPoint.y, aimPoint.z, error);
  const pellets = def.pellets || 1;
  let hitAny = false;
  for (let p = 0; p < pellets; p += 1) {
    const d = pellets > 1
      ? aimWithError(ctx.rng, from.x, from.y, from.z, aimPoint.x, aimPoint.y, aimPoint.z, error + def.spread)
      : dir;
    const res = fireHitscan(from, d, def, ctx.rng, ctx.shootTargets, ctx.colliders, ctx.smokes, 120, bot.team);
    events.onBotShot(bot, from, d, res, def);
    if (res.hit) hitAny = true;
  }
  w.mag -= 1;
  bot.burstLeft -= 1;
  if (hitAny) bot.lastSeenTime = time;
}
