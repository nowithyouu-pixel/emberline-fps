// One palette for the whole game: dusk desert yard, rust accent, two team colours.
// Every material and every HUD colour comes from here, so the scene reads at a glance.
export const PALETTE = {
  skyTop: 0x2e3a52,
  skyHorizon: 0xd98a4a,
  fog: 0xc98a54,
  ground: 0x9a7a52,
  groundDark: 0x7d6242,
  wall: 0xb59a72,
  wallDark: 0x8a7455,
  containerRust: 0xa4542e,
  containerTeal: 0x2e6b6b,
  containerSand: 0xc2a878,
  crate: 0x8a6b42,
  crateDark: 0x6b5232,
  metal: 0x4a4f55,
  metalDark: 0x33373c,
  accent: 0xf0a830,
  accentDim: 0xc78a24,
  ink: 0xe9e6df,
  muted: 0xb8b0a2,
  canvas: 0x14161a,
  surface: 0x1e2228,
  hairline: 0x2c323a,
  // Teams: Vipers attack (amber), Sentinels defend (teal-blue).
  viper: 0xf0a830,
  viperDark: 0x9a6a14,
  sentinel: 0x3fa7c9,
  sentinelDark: 0x1f6b84,
  enemy: 0xe5484d,
  health: 0x7dc383,
  danger: 0xe5484d,
  bomb: 0xff5a3c,
};

export const TEAM = {
  VIPER: 'viper',
  SENTINEL: 'sentinel',
};

export function teamColor(team) {
  return team === TEAM.VIPER ? PALETTE.viper : PALETTE.sentinel;
}
