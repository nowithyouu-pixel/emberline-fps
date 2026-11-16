// EMBERLINE: boot and the one loop. A fixed 60 Hz simulation feeds rendering at
// the display's rate; the game logic never allocates in the hot loop.
// ?shot=start|play|plant|end with &seed=N stages a deterministic frame for a
// capture, renders it twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE, TEAM } from './palette.js';
import { makeRng } from './rng.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createBot, botReset, assignPlans, botStep, botDamage, killBot } from './bots.js';
import { createEffects, createViewmodel } from './effects.js';
import { createHud } from './hud.js';
import { WEAPONS, GRENADES, ECONOMY, makeWeaponState, damageAtRange } from './weapons.js';
import { MAP } from './map.js';
import { createBomb, sitePos, inSite, bombStep, plantBomb, resetBomb, BOMB } from './bomb.js';
import { createGrenades, throwGrenade, grenadesStep, fragDamageAt, flashStrength } from './grenades.js';
import { createMatch, endRound, nextRound, checkElimination, aliveCount, ROUND, FREEZE_TIME, ROUND_TIME, END_TIME, WIN_ROUNDS } from './rounds.js';
import { fireHitscan, applyHit, aimWithError } from './combat.js';
import { hasLineOfSight, rayWorld } from './collision.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
// Surface load errors to the screenshot driver.
window.addEventListener('error', (e) => { window.__shotError = String(e.message || e.error); });
const rng = makeRng(seed * 7919 + 13);

const audio = createAudio();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
scene.add(camera);

const world = createWorld(scene);
const effects = createEffects(scene);
const viewmodel = createViewmodel(camera, scene);
const hud = createHud();
const colliders = world.colliders;

// --- Actors ---------------------------------------------------------------
const player = createPlayer(colliders, MAP.spawns.viper[4]);
player.team = TEAM.VIPER;
const playerActor = {
  isPlayer: true, id: 'player', team: TEAM.VIPER, name: 'You',
  get alive() { return player.state.alive; },
  get x() { return player.state.position.x; },
  get z() { return player.state.position.z; },
  get feetY() { return player.state.position.y; },
  get crouch() { return player.state.crouching; },
  get armor() { return player.state.armor; },
  set armor(v) { player.state.armor = v; },
  get helmet() { return player.state.helmet; },
  get health() { return player.state.health; },
  set health(v) { player.state.health = v; },
  get speed() { return player.state.speed; },
  get position() { return player.state.position; },
  get eye() { return player.state.eye; },
  get crouching() { return player.state.crouching; },
  justFired: false,
  justFiredAt: -99,
};
player.state.money = ECONOMY.startMoney;

const bots = [];
for (let i = 0; i < 4; i += 1) bots.push(createBot(scene, TEAM.VIPER, i, rng));
for (let i = 0; i < 5; i += 1) bots.push(createBot(scene, TEAM.SENTINEL, i, rng));
const shootTargets = [...bots, playerActor];

// --- Match state ----------------------------------------------------------
const match = createMatch();
const bomb = createBomb();
const grenadeState = createGrenades();
const smokes = grenadeState.smokes;

let primaryState = null;
let sidearmState = makeWeaponState('pistol');
let spectateTarget = null;
let elapsed = 0;
let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let buyOpen = false;
let throwCooldown = 0;
let stepAccum = 0;
let lastBeepAt = -99;
let minimapAt = 0;
let flashLevel = 0;
let mapDirty = false;
let prevFiring = false;
const spotted = new Map(); // bot id -> { x, z, time }
const _dir = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

function activeWeaponState() {
  return player.state.activeSlot === 'primary' ? primaryState : sidearmState;
}
function activeWeaponDef() {
  const st = activeWeaponState();
  return st ? st.def : WEAPONS.pistol;
}

function botBuyWeapon(round, rngLocal, team, index) {
  if (round === 1) return rngLocal.chance(0.5) ? 'pistol' : 'smg';
  const roll = rngLocal.next();
  if (roll < 0.55) return 'rifle';
  if (roll < 0.8) return 'carbine';
  if (roll < 0.9) return index === 0 ? 'sniper' : 'rifle';
  return 'shotgun';
}

function startRound() {
  resetBomb(bomb);
  grenadeState.flying.length = 0;
  grenadeState.smokes.length = 0;
  grenadeState.flashes.length = 0;
  spotted.clear();
  flashLevel = 0;
  hud.flashOverlay(0);
  // Player keeps money and grenades between rounds; weapons reset to loadout.
  const money = player.state.money;
  player.reset(MAP.spawns.viper[4], money);
  player.state.primary = null;
  primaryState = null;
  sidearmState = makeWeaponState('pistol');
  player.state.activeSlot = 'sidearm';
  // Bots: fresh spawns, round-appropriate weapons, new plan for the site.
  bots.forEach((b, i) => {
    const spawn = b.team === TEAM.VIPER ? MAP.spawns.viper[i % 5] : MAP.spawns.sentinel[i % 5];
    botReset(b, spawn, botBuyWeapon(match.round, rng, b.team, i), rng);
    if (match.round >= 3 && rng.chance(0.5)) { b.armor = 50; b.helmet = rng.chance(0.4); }
  });
  assignPlans(bots, rng, match.bombSite);
  // The carrier is an attacker bot (or the player, 1 in 5 rounds).
  const carrierBot = bots.find((b) => b.hasBomb);
  if (rng.chance(0.2) && carrierBot) {
    carrierBot.hasBomb = false;
    player.state.hasBomb = true;
    bomb.carrier = 'player';
  } else if (carrierBot) {
    bomb.carrier = carrierBot;
  }
  match.phase = ROUND.FREEZE;
  match.phaseTime = FREEZE_TIME;
  spectateTarget = null;
  hud.setSpectate(null);
  hud.hideOverlay();
  hud.setBombBar(null);
  hud.showBanner(`ROUND ${match.round}`, player.state.hasBomb ? 'You carry the bomb — plant it at A or B' : `Plant the bomb at site ${match.bombSite}`, 3000);
  hud.setHint('B — buy menu   •   freeze time, weapons are cheap while it lasts');
  syncHud();
}

function syncHud() {
  const st = player.state;
  hud.setHealth(st.health, st.armor, st.helmet);
  const w = activeWeaponState();
  hud.setAmmo(w ? w.mag : 0, w ? w.reserve : 0, w ? w.reloading > 0 : false);
  hud.setMoney(st.money);
  hud.setScore(match.score.viper, match.score.sentinel, match.round);
  hud.setAlive(aliveCount(bots, playerActor, TEAM.VIPER), aliveCount(bots, playerActor, TEAM.SENTINEL));
  hud.setWeapon(activeWeaponDef().name);
  hud.setGrenades(st.grenades);
  hud.setTimer(match.phase === ROUND.LIVE ? match.phaseTime : (match.phase === ROUND.FREEZE ? match.phaseTime : 0), match.phase);
}

// --- Combat: the player's shots -------------------------------------------
function currentSpread() {
  const st = player.state;
  const def = activeWeaponDef();
  const w = activeWeaponState();
  const moveFactor = Math.min(1, st.speed / 5.4);
  let spread = def.spread + def.moveSpread * moveFactor + (w ? w.bloom : 0);
  if (!st.onGround) spread += 0.03;
  if (st.crouching) spread *= 0.8;
  if (input.ads) spread *= def.kind === 'sniper' ? 0.12 : 0.45;
  return spread;
}

function playerShoot() {
  const w = activeWeaponState();
  const def = activeWeaponDef();
  if (!w || w.reloading > 0 || w.cooldown > 0) return;
  if (w.mag <= 0) { audio.dryFire(); w.cooldown = 0.25; return; }
  w.cooldown = 60 / def.rpm;
  w.mag -= 1;
  w.bloom = Math.min(0.035, w.bloom + (def.kind === 'rifle' ? 0.004 : 0.0025));
  const spread = currentSpread();
  const eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
  camera.getWorldDirection(_dir);
  const pellets = def.pellets || 1;
  let hitSomething = false;
  for (let p = 0; p < pellets; p += 1) {
    const dir = aimWithError(rng, eye.x, eye.y, eye.z, eye.x + _dir.x, eye.y + _dir.y, eye.z + _dir.z, spread);
    const res = fireHitscan(eye, dir, def, rng, shootTargets, colliders, smokes, 120, TEAM.VIPER);
    const end = res.hit
      ? res.point
      : { x: eye.x + dir.x * res.wallDistance, y: eye.y + dir.y * res.wallDistance, z: eye.z + dir.z * res.wallDistance };
    _muzzle.copy(camera.position).addScaledVector(_dir, 0.55);
    _muzzle.y -= 0.14;
    _muzzle.x += 0.14;
    effects.tracer(_muzzle.x, _muzzle.y, _muzzle.z, end.x, end.y, end.z, def.tracer);
    if (res.hit) {
      hitSomething = true;
      const target = res.target;
      const result = applyHit(def, res.distance, res.part, target);
      effects.blood(end.x, end.y, end.z);
      hud.hitMarker(result.killed, result.killed ? 4000 : 90);
      audio.hit(result.killed);
      if (!target.isPlayer) {
        if (result.killed) killBot(target);
        target.target = playerActor;
        target.lastSeen = { x: eye.x, y: eye.y - 0.35, z: eye.z };
        target.lastSeenTime = elapsed;
        target.reactionUntil = Math.min(target.reactionUntil || 0, elapsed + 0.25);
        if (result.killed) onKill(playerActor, target, res.part, def.name);
      }
    } else if (!res.smoked) {
      effects.impact(end.x, end.y, end.z, -dir.x, -dir.y, -dir.z);
    }
  }
  effects.muzzle(camera, def.kind);
  audio.shot(def.kind, 0);
  viewmodel.kick(def.kind === 'sniper' ? 0.09 : def.kind === 'shotgun' ? 0.07 : 0.035);
  const st = player.state;
  player.addRecoil(def.recoil * (0.85 + rng.next() * 0.3), (rng.next() * 2 - 1) * def.recoil * 0.35);
  playerActor.justFired = true;
  playerActor.justFiredAt = elapsed;
  // Nearby bots hear the shot.
  for (const b of bots) {
    if (!b.alive) continue;
    const d = Math.hypot(b.x - eye.x, b.z - eye.z);
    if (d < 26) { b.heardAt = { x: eye.x, z: eye.z }; b.heardTime = elapsed; }
  }
  hud.setAmmo(w.mag, w.reserve, false);
  void hitSomething;
}

function onKill(killer, victim, part, weaponName) {
  killer.kills = (killer.kills || 0) + 1;
  hud.killfeed(killer.name, victim.name, part === 'head', weaponName, killer.team, victim.team);
  if (killer.isPlayer) {
    player.state.money = Math.min(ECONOMY.maxMoney, player.state.money + ECONOMY.killReward);
    player.state.kills += 1;
    hud.setMoney(player.state.money);
  }
  if (victim.isPlayer) {
    hud.showOverlay('dead', { name: '' });
    input.releaseLock();
  }
  // Bomb carrier drops to the nearest alive teammate.
  if (victim.hasBomb) {
    victim.hasBomb = false;
    const mates = bots.filter((b) => b.team === victim.team && b.alive);
    if (victim.isPlayer) {
      const next = mates[0];
      if (next) { next.hasBomb = true; bomb.carrier = next; }
      else bomb.carrier = null;
    } else {
      const next = mates.find((b) => b !== victim);
      if (next) { next.hasBomb = true; bomb.carrier = next; }
      else if (player.state.alive && player.team === victim.team) { player.state.hasBomb = true; bomb.carrier = 'player'; }
      else bomb.carrier = null;
    }
  }
}

// --- Bot shot events --------------------------------------------------------
const botEvents = {
  onBotShot(bot, from, dir, res, def) {
    const end = res.hit
      ? res.point
      : { x: from.x + dir.x * res.wallDistance, y: from.y + dir.y * res.wallDistance, z: from.z + dir.z * res.wallDistance };
    effects.tracer(from.x, from.y - 0.15, from.z, end.x, end.y, end.z, def.tracer);
    const distToPlayer = Math.hypot(from.x - camera.position.x, from.z - camera.position.z);
    audio.shot(def.kind, distToPlayer);
    if (res.hit) {
      const target = res.target;
      if (target.isPlayer) {
        const dmg = damageAtRange(def, res.distance) * (res.part === 'head' ? def.headMult : 1);
        const taken = player.damage(dmg, res.part);
        void taken;
        audio.hurt();
        const ang = Math.atan2(-(from.x - player.state.position.x), -(from.z - player.state.position.z));
        hud.damageFlash(ang, player.state.yaw);
        hud.setHealth(player.state.health, player.state.armor, player.state.helmet);
        if (!player.state.alive) onKill(bot, playerActor, res.part, def.name);
      } else {
        const result = applyHit(def, res.distance, res.part, target);
        effects.blood(end.x, end.y, end.z);
        if (result.killed) killBot(target);
        if (result.killed) onKill(bot, target, res.part, def.name);
        else {
          target.target = bot;
          target.lastSeen = { x: from.x, y: from.y - 0.35, z: from.z };
          target.lastSeenTime = elapsed;
        }
      }
    } else if (!res.smoked) {
      effects.impact(end.x, end.y, end.z, -dir.x, -dir.y, -dir.z);
    }
    bot.justFired = true;
  },
  onPlanted(bot) {
    plantBomb(bomb, match.bombSite);
    bot.state = 'hold';
    hud.showBanner('BOMB PLANTED', `Site ${match.bombSite} — 40 seconds to detonation`, 3000);
    hud.setBombBar('fuse', 1, `BOMB — SITE ${match.bombSite}`);
    if (bot.team === TEAM.VIPER) {
      player.state.money = Math.min(ECONOMY.maxMoney, player.state.money + ECONOMY.plantReward);
      hud.setMoney(player.state.money);
    }
  },
  onDefused() {
    bomb.defused = true;
    finishRound(TEAM.SENTINEL, 'defuse');
  },
  onThrowSmoke(bot, x, z) {
    const from = { x: bot.x, y: bot.feetY + 1.4, z: bot.z };
    const dir = { x: (x - bot.x) / 10, y: 0.25, z: (z - bot.z) / 10 };
    throwGrenade(grenadeState, 'smoke', from, dir, 9);
  },
};

function finishRound(winner, reason) {
  if (match.phase !== ROUND.LIVE) return;
  const res = endRound(match, winner, reason);
  // Pay the player.
  const won = winner === TEAM.VIPER;
  player.state.money = Math.min(ECONOMY.maxMoney, player.state.money + (won ? res.winPay : res.lossPay));
  hud.setMoney(player.state.money);
  const titles = {
    elimination: `${winner === TEAM.VIPER ? 'VIPERS' : 'SENTINELS'} WIN THE ROUND`,
    bomb: 'BOMB PLANTED — VIPERS WIN',
    defuse: 'BOMB DEFUSED — SENTINELS WIN',
    time: 'TIME — SENTINELS WIN',
    explosion: 'BOMB DETONATED — VIPERS WIN',
  };
  const subs = {
    elimination: 'Enemy team eliminated.',
    bomb: 'The bomb went off. Site lost.',
    defuse: 'The bomb was defused in time.',
    time: 'The bomb was never planted.',
    explosion: 'The site is gone.',
  };
  hud.showBanner(titles[reason] || 'ROUND OVER', subs[reason] || '');
  hud.setBombBar(null);
  if (won) audio.roundWin(); else audio.roundLose();
  input.releaseLock();
  if (match.matchWinner) {
    setTimeout(() => {
      hud.showOverlay('match', {
        title: match.matchWinner === TEAM.VIPER ? 'VIPERS TAKE THE MATCH' : 'SENTINELS TAKE THE MATCH',
        sub: `Final score ${match.score.viper} — ${match.score.sentinel}. Click Play again for a rematch.`,
      });
    }, 1200);
  } else {
    setTimeout(() => hud.showOverlay('round', { title: titles[reason] || 'Round over', sub: `Score ${match.score.viper} — ${match.score.sentinel}. Next round starts when you click.` }), 1200);
  }
  syncHud();
}

// --- Grenade events ---------------------------------------------------------
function handleGrenadeEvents(events) {
  for (const e of events) {
    if (e.type === 'frag') {
      effects.explosion(e.x, e.y, e.z);
      audio.explosion(Math.hypot(e.x - camera.position.x, e.z - camera.position.z));
      const victims = [...bots, playerActor];
      for (const v of victims) {
        if (!v.alive) continue;
        const ty = v.isPlayer ? v.position.y + 1 : v.feetY + 1;
        const dmg = fragDamageAt(colliders, e.x, e.y, e.z, v.x, ty, v.z, e.radius, e.damage);
        if (dmg > 4) {
          if (v.isPlayer) {
            player.damage(dmg, 'body');
            audio.hurt();
            hud.setHealth(player.state.health, player.state.armor, player.state.helmet);
            if (!player.state.alive) onKill(bots.find((b) => b.alive) || playerActor, playerActor, 'body', 'Frag Grenade');
          } else {
            const r = botDamage(v, dmg, 'body');
            effects.blood(v.x, v.feetY + 1, v.z);
            if (r.killed) onKill(playerActor, v, 'body', 'Frag Grenade');
          }
        }
      }
    } else if (e.type === 'smoke') {
      effects.smokePuff(e.x, e.y + 0.4, e.z, true);
    } else if (e.type === 'flash') {
      audio.flash();
      const strength = flashStrength(colliders, e.x, e.y, e.z, camera.position.x, camera.position.y, camera.position.z, player.state.yaw, e.radius);
      if (strength > 0.15) flashLevel = Math.max(flashLevel, strength);
      for (const b of bots) {
        if (!b.alive) continue;
        const s = flashStrength(colliders, e.x, e.y, e.z, b.x, b.feetY + 1.55, b.z, b.yaw, e.radius);
        if (s > 0.3) b.blindUntil = elapsed + s * 2.2;
      }
    } else if (e.type === 'bounce') {
      audio.grenadeBounce();
    }
  }
}

function throwPlayerGrenade(kind) {
  const st = player.state;
  if (st.grenades[kind] <= 0 || throwCooldown > 0) return;
  st.grenades[kind] -= 1;
  throwCooldown = 0.8;
  camera.getWorldDirection(_dir);
  const from = { x: camera.position.x, y: camera.position.y - 0.1, z: camera.position.z };
  throwGrenade(grenadeState, kind, from, { x: _dir.x, y: _dir.y, z: _dir.z }, 13);
  hud.setGrenades(st.grenades);
}

// --- Buy menu ---------------------------------------------------------------
function buyItem(key) {
  const row = { '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '0': 9 }[key];
  if (row === undefined) return;
  const item = [
    { kind: 'weapon', id: 'smg' }, { kind: 'weapon', id: 'rifle' }, { kind: 'weapon', id: 'carbine' },
    { kind: 'weapon', id: 'sniper' }, { kind: 'weapon', id: 'shotgun' },
    { kind: 'gear', id: 'armor' }, { kind: 'gear', id: 'helmet' },
    { kind: 'grenade', id: 'frag' }, { kind: 'grenade', id: 'smoke' }, { kind: 'grenade', id: 'flash' },
  ][row];
  const st = player.state;
  const price = item.kind === 'weapon' ? WEAPONS[item.id].price : (item.kind === 'grenade' ? GRENADES[item.id].price : (item.id === 'armor' ? 650 : 350));
  if (st.money < price) { audio.denied(); return; }
  if (item.kind === 'weapon') {
    if (st.primary === item.id) return;
    st.money -= price;
    st.primary = item.id;
    primaryState = makeWeaponState(item.id);
    st.activeSlot = 'primary';
    audio.buy();
  } else if (item.kind === 'gear') {
    if (item.id === 'armor') {
      if (st.armor >= 100) return;
      st.money -= price;
      st.armor = 100;
    } else {
      if (st.helmet) return;
      st.money -= price;
      st.helmet = true;
    }
    audio.buy();
  } else {
    if (st.grenades[item.id] >= 1) return;
    st.money -= price;
    st.grenades[item.id] += 1;
    audio.buy();
  }
  hud.setMoney(st.money);
  hud.showBuyMenu(st.money, { primary: st.primary, sidearm: st.sidearm, armor: st.armor, helmet: st.helmet, grenades: st.grenades });
  syncHud();
}

// --- Input ------------------------------------------------------------------
const input = createInput(renderer.domElement, {
  onLockChange(locked) {
    if (shot) return;
    if (locked) {
      started = true;
      hud.hideOverlay();
      audio.unlock();
    } else if (!match.matchWinner) {
      if (match.phase === ROUND.END) hud.showOverlay('round', { title: 'Round over', sub: `Score ${match.score.viper} — ${match.score.sentinel}.` });
      else if (player.state.alive) hud.showOverlay('paused');
      else hud.showOverlay('dead', { name: spectateTarget ? spectateTarget.name : '' });
    } else {
      hud.showOverlay('match', {
        title: match.matchWinner === TEAM.VIPER ? 'VIPERS TAKE THE MATCH' : 'SENTINELS TAKE THE MATCH',
        sub: `Final score ${match.score.viper} — ${match.score.sentinel}. Click Play again for a rematch.`,
      });
    }
  },
  onKey(code, down) {
    if (!down || shot) return;
    if (code === 'KeyM') { audio.setMuted(!audio.muted); return; }
    if (buyOpen) {
      if (code === 'KeyB' || code === 'Escape') { buyOpen = false; hud.hideBuyMenu(); input.requestLock(); return; }
      const digit = code.replace('Digit', '');
      if (/^[0-9]$/.test(digit)) { buyItem(digit); return; }
      return;
    }
    if (code === 'KeyB' && match.phase === ROUND.FREEZE && player.state.alive) {
      buyOpen = true;
      hud.showBuyMenu(player.state.money, { primary: player.state.primary, sidearm: player.state.sidearm, armor: player.state.armor, helmet: player.state.helmet, grenades: player.state.grenades });
      input.releaseLock();
      return;
    }
    if (code === 'KeyR') {
      const w = activeWeaponState();
      if (w && w.reloading <= 0 && w.mag < w.def.mag && w.reserve > 0) { w.reloading = w.def.reloadTime; audio.reload(); viewmodel.setReloading(true); }
      return;
    }
    if (code === 'Digit1' && primaryState) { player.state.activeSlot = 'primary'; syncHud(); return; }
    if (code === 'Digit2') { player.state.activeSlot = 'sidearm'; syncHud(); return; }
    if (code === 'Digit4') { throwPlayerGrenade('frag'); return; }
    if (code === 'Digit5') { throwPlayerGrenade('smoke'); return; }
    if (code === 'Digit6') { throwPlayerGrenade('flash'); return; }
  },
});

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.matchWinner) {
    Object.assign(match, createMatch());
    player.state.money = ECONOMY.startMoney;
    startRound();
    input.requestLock();
    return;
  }
  if (match.phase === ROUND.END) {
    nextRound(match, rng);
    startRound();
    input.requestLock();
    return;
  }
  input.requestLock();
});

// --- The fixed step -----------------------------------------------------------
function step(dt) {
  elapsed += dt;
  hud.tick(elapsed);
  const st = player.state;

  // Phase clock.
  if (match.phase === ROUND.FREEZE || match.phase === ROUND.LIVE || match.phase === ROUND.END) {
    match.phaseTime -= dt;
    if (match.phase === ROUND.FREEZE && match.phaseTime <= 0) {
      match.phase = ROUND.LIVE;
      match.phaseTime = ROUND_TIME;
      hud.setHint(player.state.hasBomb ? 'Plant the bomb at A or B — hold E on site' : 'Eliminate the Sentinels or cover the carrier');
      hud.showBanner(`ROUND ${match.round} — GO`, player.state.hasBomb ? 'You carry the bomb' : `Site ${match.bombSite} is the call`, 2200);
    } else if (match.phase === ROUND.LIVE && match.phaseTime <= 0 && !bomb.planted) {
      finishRound(TEAM.SENTINEL, 'time');
    }
    // END waits for the player's click (the round overlay's button); the match
    // never advances on its own.
  }

  const live = match.phase === ROUND.LIVE;
  const canAct = (live || match.phase === ROUND.FREEZE) && st.alive;

  // Player movement (allowed in freeze and live).
  if (canAct) {
    const look = input.takeLook();
    player.look(look.x, look.y, 0.0021, input.ads);
    player.step(dt, input.keys, input.ads);
  } else {
    input.takeLook();
  }

  // Weapons: cooldowns, reloads, bloom decay.
  for (const w of [primaryState, sidearmState]) {
    if (!w) continue;
    if (w.cooldown > 0) w.cooldown -= dt;
    if (w.reloading > 0) {
      w.reloading -= dt;
      if (w.reloading <= 0) {
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        viewmodel.setReloading(false);
        hud.setAmmo(w.mag, w.reserve, false);
      }
    }
    w.bloom = Math.max(0, w.bloom - dt * 0.02);
  }
  if (throwCooldown > 0) throwCooldown -= dt;

  // Firing: live rounds only; semi-autos fire on the rising edge.
  const firing = input.firing && input.locked && st.alive && live;
  const def = activeWeaponDef();
  if (firing && (def.auto || !prevFiring)) playerShoot();
  prevFiring = input.firing;

  // Footsteps.
  if (st.alive && st.speed > 1) {
    stepAccum += st.speed * dt;
    if (stepAccum > 2.4) { stepAccum = 0; audio.step(0); }
  }

  // Bots: frozen in freeze time, live in live rounds.
  if (live || match.phase === ROUND.END) {
    const ctx = {
      colliders, smokes, player: playerActor, bots, bomb, rng,
      shootTargets,
    };
    for (const b of bots) botStep(b, dt, elapsed, ctx, botEvents);
  }
  // Meshes follow their actors even when the AI is frozen (freeze time, menus).
  for (const b of bots) {
    if (!b.alive) continue;
    b.mesh.position.set(b.x, b.feetY, b.z);
    b.mesh.rotation.y = b.yaw;
  }

  // Grenades.
  const gEvents = grenadesStep(grenadeState, dt, elapsed, colliders);
  if (gEvents.length) handleGrenadeEvents(gEvents);

  // Bomb fuse + beeps.
  if (bomb.planted && !bomb.exploded && !bomb.defused) {
    const ev = bombStep(bomb, dt);
    const interval = Math.max(0.25, Math.min(1, bomb.fuseLeft / 12));
    if (elapsed - lastBeepAt > interval) { lastBeepAt = elapsed; audio.beep(bomb.fuseLeft < 10); }
    hud.setBombBar('fuse', bomb.fuseLeft / BOMB.fuseTime, `BOMB — SITE ${bomb.site} — ${Math.ceil(bomb.fuseLeft)}s`);
    if (ev && ev.type === 'exploded') {
      effects.explosion(bomb.x, 0.5, bomb.z);
      audio.explosion(0);
      for (const v of [...bots, playerActor]) {
        if (!v.alive) continue;
        const ty = v.isPlayer ? v.position.y + 1 : v.feetY + 1;
        const dmg = fragDamageAt(colliders, bomb.x, 0.5, bomb.z, v.x, ty, v.z, BOMB.explodeRadius, BOMB.explodeDamage);
        if (dmg > 4) {
          if (v.isPlayer) { player.damage(dmg, 'body'); hud.setHealth(player.state.health, player.state.armor, player.state.helmet); }
          else botDamage(v, dmg, 'body');
        }
      }
      finishRound(TEAM.VIPER, 'explosion');
    }
  }

  // Player plant / defuse on E (hold).
  if (live && st.alive && input.keys.has('KeyE')) {
    if (!bomb.planted && st.hasBomb) {
      const site = inSite(st.position.x, st.position.z);
      if (site) {
        bomb.plantProgress += dt;
        hud.setBombBar('plant', bomb.plantProgress / BOMB.plantTime, `PLANTING — SITE ${site}`);
        if (bomb.plantProgress >= BOMB.plantTime) {
          st.hasBomb = false;
          match.bombSite = site;
          plantBomb(bomb, site);
          hud.showBanner('BOMB PLANTED', `Site ${site} — 40 seconds to detonation`, 3000);
          hud.setBombBar('fuse', 1, `BOMB — SITE ${site}`);
          st.money = Math.min(ECONOMY.maxMoney, st.money + ECONOMY.plantReward);
          hud.setMoney(st.money);
          audio.beep(true);
        }
      } else {
        bomb.plantProgress = 0;
        hud.setBombBar(null);
      }
    } else if (bomb.planted) {
      const d = Math.hypot(bomb.x - st.position.x, bomb.z - st.position.z);
      if (d < 2.4) {
        bomb.defuseProgress += dt;
        hud.setBombBar('defuse', bomb.defuseProgress / BOMB.defuseTime, 'DEFUSING');
        if (bomb.defuseProgress >= BOMB.defuseTime) {
          bomb.defused = true;
          finishRound(TEAM.SENTINEL, 'defuse');
        }
      } else {
        bomb.defuseProgress = 0;
        hud.setBombBar('fuse', bomb.fuseLeft / BOMB.fuseTime, `BOMB — SITE ${bomb.site} — ${Math.ceil(bomb.fuseLeft)}s`);
      }
    }
  } else if (!bomb.planted) {
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    if (live) hud.setBombBar(null);
  }

  // Bomb pickup: walking over a dropped bomb (carrier transfer is instant in
  // onKill, so this only covers the player picking it up from a dead carrier).
  if (live && st.alive && !st.hasBomb && bomb.carrier === null && !bomb.planted) {
    const carrier = bots.find((b) => b.hasBomb);
    if (!carrier) {
      // No carrier at all: the bomb sits with the player spawn side; give it to
      // the player when they return to spawn.
      const d = Math.hypot(st.position.x - MAP.spawns.viper[4].x, st.position.z - MAP.spawns.viper[4].z);
      if (d < 3) { st.hasBomb = true; bomb.carrier = 'player'; hud.setHint('You carry the bomb — plant it at A or B (hold E)'); }
    }
  }

  // Elimination ends the round.
  if (live) {
    const elim = checkElimination(match, bots, playerActor);
    if (elim) finishRound(elim.winner, elim.reason);
  }

  // Spectating: follow the first alive Viper bot.
  if (!st.alive && match.phase === ROUND.LIVE) {
    if (!spectateTarget || !spectateTarget.alive) {
      spectateTarget = bots.find((b) => b.team === TEAM.VIPER && b.alive) || null;
      hud.setSpectate(spectateTarget ? spectateTarget.name : null);
    }
  }

  // Spotted enemies for the minimap (seen by the player or a teammate).
  minimapAt -= dt;
  if (minimapAt <= 0) {
    minimapAt = 0.2;
    const eyes = [];
    if (st.alive) eyes.push({ x: st.position.x, y: st.position.y + st.eye, z: st.position.z });
    for (const b of bots) if (b.alive && b.team === TEAM.VIPER) eyes.push({ x: b.x, y: b.feetY + 1.55, z: b.z });
    for (const e of bots) {
      if (!e.alive || e.team !== TEAM.SENTINEL) continue;
      const to = { x: e.x, y: e.feetY + 1.4, z: e.z };
      for (const eye of eyes) {
        if (hasLineOfSight(colliders, eye.x, eye.y, eye.z, to.x, to.y, to.z)) {
          spotted.set(e.id, { x: e.x, z: e.z, time: elapsed });
          break;
        }
      }
    }
    for (const [id, s] of spotted) if (elapsed - s.time > 3) spotted.delete(id);
    mapDirty = true;
  }

  // Flash decay.
  if (flashLevel > 0) {
    flashLevel = Math.max(0, flashLevel - dt * 0.45);
    hud.flashOverlay(flashLevel);
  }

  // HUD: cheap setters every step; minimap on its own timer.
  hud.setTimer(match.phase === ROUND.LIVE || match.phase === ROUND.FREEZE ? match.phaseTime : 0, match.phase);
  hud.setAlive(aliveCount(bots, playerActor, TEAM.VIPER), aliveCount(bots, playerActor, TEAM.SENTINEL));
  if (st.alive) {
    hud.setCrosshair(currentSpread() * 900, input.ads);
  }
  if (mapDirty) {
    mapDirty = false;
    hud.drawMinimap(
      st.position, st.yaw,
      bots.filter((b) => b.alive && b.team === TEAM.VIPER).map((b) => ({ x: b.x, z: b.z })),
      [...spotted.values()].map((s) => ({ x: s.x, z: s.z })),
      match.bombSite, bomb.planted,
    );
  }
  // Effects live in sim time: tracers, particles and the muzzle flash advance
  // one fixed step at a time, never on the render clock.
  effects.step(dt);
}

// --- Camera -----------------------------------------------------------------
function syncCamera() {
  const st = player.state;
  if (!st.alive && spectateTarget) {
    camera.position.set(spectateTarget.x, spectateTarget.feetY + 1.55, spectateTarget.z);
    camera.rotation.set(0, spectateTarget.yaw, 0, 'YXZ');
  } else {
    camera.position.set(st.position.x, st.position.y + st.eye, st.position.z);
    camera.rotation.set(st.pitch + st.recoilPitch, st.yaw + st.recoilYaw, 0, 'YXZ');
  }
  const def = activeWeaponDef();
  const targetFov = input.ads && st.alive ? 74 / Math.pow(def.zoom, 0.6) : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
}

// --- Frame loop ---------------------------------------------------------------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
    viewmodel.step(dt, player.state.speed, input.firing, (activeWeaponState() || {}).reloading > 0);
    world.dust.rotation.y += dt * 0.005;
  }
  renderer.render(scene, camera);
}

// --- Deterministic shot staging ----------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}

function aimAt(x, y, z) {
  const st = player.state;
  const dx = x - st.position.x;
  const dy = y - (st.position.y + st.eye);
  const dz = z - st.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  st.yaw = Math.atan2(-dx, -dz);
  st.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBanner('', '', 1);
  const st = player.state;
  if (name === 'start') {
    st.position.x = 6; st.position.y = 0; st.position.z = 19;
    st.yaw = -0.35;
    st.pitch = 0.04;
    match.phase = ROUND.FREEZE;
    match.phaseTime = 6.2;
    settle(30);
    hud.showOverlay('start');
    hud.setMoney(800);
  } else if (name === 'play') {
    match.phase = ROUND.LIVE;
    match.phaseTime = 72;
    match.score.viper = 3;
    match.score.sentinel = 2;
    st.position.x = 0; st.position.y = 0; st.position.z = 10;
    st.health = 100;
    st.armor = 100;
    primaryState = makeWeaponState('rifle');
    st.primary = 'rifle';
    st.activeSlot = 'primary';
    primaryState.mag = 24;
    st.money = 4250;
    // Stage the fight: two Sentinels pushing mid, one Viper beside the player.
    const foes = bots.filter((b) => b.team === TEAM.SENTINEL);
    foes[0].x = 0.8; foes[0].z = -3; foes[0].yaw = Math.PI; foes[0].state = 'hold';
    foes[1].x = -3.5; foes[1].z = -6; foes[1].yaw = Math.PI * 0.8; foes[1].state = 'hold';
    const mate = bots.find((b) => b.team === TEAM.VIPER);
    mate.x = -2.5; mate.z = 12; mate.yaw = 0; mate.state = 'hold';
    settle(25);
    // The lead Sentinel is already wounded from the earlier exchange, so the
    // aimed headshot finishes it and the real killfeed fires.
    foes[0].health = 40;
    foes[0].armor = 0;
    for (let i = 0; i < 3; i += 1) {
      aimAt(foes[0].x, 1.52, foes[0].z);
      syncCamera();
      playerShoot();
      settle(8);
    }
    aimAt(foes[1].x, 1.35, foes[1].z);
    syncCamera();
    playerShoot();
    hud.setHint('Mid control — Sentinels pushing through doors');
    settle(12); // let the muzzle flash and tracer fade before the paint
    syncCamera();
    syncHud();
  } else if (name === 'plant') {
    match.phase = ROUND.LIVE;
    match.phaseTime = 54;
    match.score.viper = 5;
    match.score.sentinel = 4;
    st.position.x = -20; st.position.y = 0; st.position.z = -9;
    st.health = 64;
    st.armor = 0;
    primaryState = makeWeaponState('carbine');
    st.primary = 'carbine';
    st.activeSlot = 'primary';
    primaryState.mag = 18;
    st.money = 2900;
    plantBomb(bomb, 'A');
    bomb.fuseLeft = 32;
    hud.setBombBar('fuse', 0.8, 'BOMB — SITE A — 32s');
    hud.setHint('Bomb planted — hold site A until detonation');
    effects.smokePuff(-16, 0.5, -13, true);
    const foe = bots.find((b) => b.team === TEAM.SENTINEL);
    foe.x = -25; foe.z = -16; foe.yaw = Math.PI * 0.7; foe.state = 'hold';
    const mate = bots.find((b) => b.team === TEAM.VIPER);
    mate.x = -18; mate.z = -14; mate.yaw = Math.PI * 0.4; mate.state = 'hold';
    settle(20);
    aimAt(-25, 1.4, -16);
    hud.showBanner('BOMB PLANTED — SITE A', 'Hold the site until detonation', 3000);
    settle(4);
  } else if (name === 'soak') {
    // Test hook, not a screenshot: simulate a whole round of bot combat with
    // the player idle, then report the result in the document title.
    match.phase = ROUND.LIVE;
    match.phaseTime = ROUND_TIME;
    settle(6600);
    const vKills = bots.filter((b) => b.team === TEAM.VIPER).reduce((n, b) => n + b.kills, 0);
    const sKills = bots.filter((b) => b.team === TEAM.SENTINEL).reduce((n, b) => n + b.kills, 0);
    document.title = JSON.stringify({
      phase: match.phase, winner: match.winner, reason: match.winReason,
      score: match.score, aliveV: aliveCount(bots, playerActor, TEAM.VIPER),
      aliveS: aliveCount(bots, playerActor, TEAM.SENTINEL),
      playerAlive: player.state.alive, bombPlanted: bomb.planted,
      vKills, sKills, playerKills: player.state.kills,
      carrier: bomb.carrier ? (bomb.carrier === 'player' ? 'player' : bomb.carrier.name) : null,
      bots: bots.map((b) => ({ n: b.name, t: b.team, a: b.alive, s: b.state, x: Math.round(b.x), z: Math.round(b.z), hb: b.hasBomb, k: b.kills, hp: Math.round(b.health) })),
    });
    syncCamera();
    syncHud();
    paintTwiceThenReady();
    return;
  } else {
    // end: round won, overlay up.
    match.phase = ROUND.END;
    match.phaseTime = 3.5;
    match.score.viper = 6;
    match.score.sentinel = 4;
    st.position.x = -8; st.position.y = 0; st.position.z = 6;
    st.health = 100;
    st.armor = 25;
    primaryState = makeWeaponState('rifle');
    st.primary = 'rifle';
    st.activeSlot = 'primary';
    primaryState.mag = 30;
    st.money = 6100;
    hud.killfeed('Dune', 'Kite', true, 'VK-47', TEAM.VIPER, TEAM.SENTINEL);
    hud.killfeed('You', 'Bastion', false, 'VK-47', TEAM.VIPER, TEAM.SENTINEL);
    settle(15);
    aimAt(0, 1.4, -6);
    hud.setHint('');
    hud.showOverlay('round', { title: 'VIPERS WIN THE ROUND', sub: 'Score 6 — 4. Enemy team eliminated.' });
    settle(4);
  }
  syncCamera();
  syncHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    } else {
      requestAnimationFrame(paint);
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Boot ---------------------------------------------------------------------
startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
