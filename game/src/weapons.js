// Weapons and the economy. Numbers are tuned so stopping to aim pays: standing
// still and tapping beats spraying on the move, and a headshot is worth four body
// shots. Prices follow the Counter-Strike shape without copying its names.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', slot: 'sidearm', price: 0, kind: 'pistol',
    damage: 26, headMult: 4, mag: 12, reserve: 48, auto: false, rpm: 320,
    spread: 0.011, moveSpread: 0.02, recoil: 0.011, range: 42, falloff: 0.55,
    reloadTime: 1.5, switchTime: 0.25, moveSpeed: 5.4, zoom: 1, tracer: 0xe8c860,
  },
  smg: {
    id: 'smg', name: 'Hornet SMG', slot: 'primary', price: 1500, kind: 'smg',
    damage: 22, headMult: 4, mag: 32, reserve: 96, auto: true, rpm: 750,
    spread: 0.014, moveSpread: 0.024, recoil: 0.009, range: 36, falloff: 0.5,
    reloadTime: 2.1, switchTime: 0.4, moveSpeed: 5.5, zoom: 1, tracer: 0xe8c860,
  },
  rifle: {
    id: 'rifle', name: 'VK-47', slot: 'primary', price: 2700, kind: 'rifle',
    damage: 34, headMult: 4, mag: 30, reserve: 90, auto: true, rpm: 600,
    spread: 0.009, moveSpread: 0.026, recoil: 0.016, range: 60, falloff: 0.7,
    reloadTime: 2.4, switchTime: 0.45, moveSpeed: 5.1, zoom: 1.25, tracer: 0xffd27a,
  },
  carbine: {
    id: 'carbine', name: 'M4X Carbine', slot: 'primary', price: 3100, kind: 'rifle',
    damage: 33, headMult: 4, mag: 30, reserve: 90, auto: true, rpm: 660,
    spread: 0.008, moveSpread: 0.022, recoil: 0.012, range: 60, falloff: 0.72,
    reloadTime: 2.6, switchTime: 0.45, moveSpeed: 5.1, zoom: 1.25, tracer: 0xffd27a,
  },
  sniper: {
    id: 'sniper', name: 'Longbow DMR', slot: 'primary', price: 4750, kind: 'sniper',
    damage: 115, headMult: 2.5, mag: 5, reserve: 15, auto: false, rpm: 55,
    spread: 0.0015, moveSpread: 0.09, recoil: 0.05, range: 90, falloff: 0.95,
    reloadTime: 3.2, switchTime: 0.7, moveSpeed: 4.8, zoom: 4, tracer: 0x9fd8ff,
  },
  shotgun: {
    id: 'shotgun', name: 'Breacher 12', slot: 'primary', price: 2000, kind: 'shotgun',
    damage: 12, headMult: 3, mag: 6, reserve: 24, auto: false, rpm: 75, pellets: 8,
    spread: 0.045, moveSpread: 0.05, recoil: 0.038, range: 18, falloff: 0.35,
    reloadTime: 2.9, switchTime: 0.5, moveSpeed: 5.2, zoom: 1, tracer: 0xffb37a,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Grenade', price: 300, fuse: 1.6, radius: 9, damage: 110 },
  smoke: { id: 'smoke', name: 'Smoke Grenade', price: 300, fuse: 1.4, radius: 5.5, duration: 18 },
  flash: { id: 'flash', name: 'Flashbang', price: 200, fuse: 1.4, radius: 26 },
};

export const GEAR = {
  armor: { id: 'armor', name: 'Kevlar Vest', price: 650 },
  helmet: { id: 'helmet', name: 'Helmet', price: 350 },
};

// Buy menu rows in display order: key, kind, id.
export const BUY_MENU = [
  { key: '1', kind: 'weapon', id: 'smg' },
  { key: '2', kind: 'weapon', id: 'rifle' },
  { key: '3', kind: 'weapon', id: 'carbine' },
  { key: '4', kind: 'weapon', id: 'sniper' },
  { key: '5', kind: 'weapon', id: 'shotgun' },
  { key: '6', kind: 'gear', id: 'armor' },
  { key: '7', kind: 'gear', id: 'helmet' },
  { key: '8', kind: 'grenade', id: 'frag' },
  { key: '9', kind: 'grenade', id: 'smoke' },
  { key: '0', kind: 'grenade', id: 'flash' },
];

export const ECONOMY = {
  startMoney: 800,
  killReward: 300,
  roundWin: 3250,
  roundLoss: 1900,
  lossStreakBonus: 500,
  lossStreakMax: 3400,
  plantReward: 300,
  maxMoney: 16000,
};

export function makeWeaponState(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve, reloading: 0, cooldown: 0, bloom: 0 };
}

// Damage at range: full inside half range, then linear down to falloff at max range.
export function damageAtRange(def, distance) {
  const half = def.range * 0.5;
  if (distance <= half) return def.damage;
  const t = Math.min(1, (distance - half) / half);
  return def.damage * (1 - (1 - def.falloff) * t);
}
