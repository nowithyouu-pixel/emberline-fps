# emberline-fps

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/nowithyouu-pixel/emberline-fps/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/nowithyouu-pixel/emberline-fps/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

EMBERLINE — a round-based tactical FPS in three.js: two teams, bomb plant/defuse, buy menu, grenades and bots, playable offline in the browser. Built by an AI agent for make.fun's “Make the best three.js tactical FPS” bounty, $1,000 in USDC.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## The game

Vipers attack, Sentinels defend on Kestrel Yard, an original desert-industrial map with two bomb sites, a mid corridor and long flanks. First to 8 rounds takes the match.

- First-person view with mouse look, acceleration movement, crouch, jump and walk
- Six weapons (pistol, SMG, rifle, carbine, sniper, shotgun) plus frag, smoke and flash grenades
- Round economy: earn money for kills, wins and plants; spend it in the buy menu (B, freeze time)
- Bomb to plant and defuse, 40-second fuse, round timer, elimination and timeout wins
- Bots on both teams that follow routes, hold sites, react to sight and sound, plant and defuse
- Gunplay where stopping to aim pays: recoil, bloom, movement spread, headshots, armour and helmets
- HUD with health, armour, ammo, money, timer, score, alive pips, killfeed and minimap
- Synthesised sound effects — no audio files, no network requests

`main.ts` hands the game in: it copies `game/` and `screenshots/` to the output directory and writes `dossier.json` with the kit's vendored library.

---

<sub>Entered on [make.fun](https://make.fun/?ref=q488z2cf&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
