// HUD: every DOM readout the player sees — health, ammo, timer, score, money,
// killfeed, minimap, buy menu and overlays. The game logic never touches the
// DOM directly; it calls these setters, so the HUD is one replaceable layer.
import { MAP } from './map.js';
import { WEAPONS, GRENADES, GEAR, BUY_MENU } from './weapons.js';
import { TEAM } from './palette.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const el = {
    health: $('health-value'), healthBar: $('health-bar'), armor: $('armor-value'),
    ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'), ammoBox: $('ammo'),
    money: $('money'), timer: $('timer'), timerBox: $('timer'),
    scoreV: $('score-viper'), scoreS: $('score-sentinel'), round: $('round-value'),
    aliveV: $('alive-viper'), aliveS: $('alive-sentinel'),
    weapon: $('weapon-name'), grenades: $('grenade-list'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    killfeed: $('killfeed'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    overlay: $('overlay'), overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    playBtn: $('play'), buyMenu: $('buy-menu'), buyList: $('buy-list'), buyMoney: $('buy-money'),
    minimap: $('minimap'), damage: $('damage-vignette'), flash: $('flash-overlay'),
    bombBar: $('bomb-bar'), bombFill: $('bomb-fill'), bombLabel: $('bomb-label'),
    spec: $('spectate'), hint: $('hint'),
  };
  let bannerTimer = 0;
  const feedItems = [];
  // HUD timers run on game time, not wall time: the main loop calls tick with
  // the sim clock, so a killfeed entry survives a pause (and a screenshot's
  // virtual clock) exactly as long as it would in live play.
  let now = 0;
  let hitUntil = -1;

  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

  return {
    el,
    tick(t) {
      now = t;
      if (hitUntil >= 0 && t > hitUntil) {
        hitUntil = -1;
        if (el.hitmarker) el.hitmarker.classList.remove('on', 'kill');
      }
      for (let i = feedItems.length - 1; i >= 0; i -= 1) {
        const it = feedItems[i];
        if (t > it.fadeAt) { it.item.remove(); feedItems.splice(i, 1); }
        else if (t > it.until) it.item.classList.add('fade');
      }
    },
    setHealth(hp, armor, helmet) {
      setText(el.health, String(Math.ceil(hp)));
      if (el.healthBar) el.healthBar.style.width = `${Math.max(0, hp)}%`;
      setText(el.armor, armor > 0 ? `${Math.ceil(armor)}${helmet ? ' ⬢' : ''}` : '—');
      if (el.health) el.health.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve, reloading) {
      setText(el.ammoMag, String(mag));
      setText(el.ammoReserve, `/ ${reserve}`);
      if (el.ammoBox) el.ammoBox.classList.toggle('reloading', !!reloading);
    },
    setMoney(m) { setText(el.money, `$${m.toLocaleString('en-US')}`); },
    setTimer(seconds, phase) {
      const s = Math.max(0, Math.ceil(seconds));
      setText(el.timer, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      if (el.timerBox) el.timerBox.classList.toggle('urgent', s <= 10 && phase === 'live');
    },
    setScore(v, s, round) {
      setText(el.scoreV, String(v));
      setText(el.scoreS, String(s));
      setText(el.round, `ROUND ${round}`);
    },
    setAlive(v, s) {
      setText(el.aliveV, '●'.repeat(v) + '○'.repeat(Math.max(0, 5 - v)));
      setText(el.aliveS, '●'.repeat(s) + '○'.repeat(Math.max(0, 5 - s)));
    },
    setWeapon(name, slot) { setText(el.weapon, name); },
    setGrenades(g) {
      const parts = [];
      if (g.frag) parts.push(`◉ Frag ×${g.frag}`);
      if (g.smoke) parts.push(`◎ Smoke ×${g.smoke}`);
      if (g.flash) parts.push(`✦ Flash ×${g.flash}`);
      setText(el.grenades, parts.join('   ') || 'No grenades — buy with B');
    },
    setCrosshair(spreadPx, ads) {
      if (!el.crosshair) return;
      const gap = 3 + spreadPx;
      el.crosshair.style.setProperty('--gap', `${gap}px`);
      el.crosshair.classList.toggle('ads', !!ads);
    },
    hitMarker(kill, holdMs = 90) {
      if (!el.hitmarker) return;
      el.hitmarker.classList.add('on');
      el.hitmarker.classList.toggle('kill', !!kill);
      hitUntil = now + holdMs / 1000;
    },
    killfeed(killer, victim, headshot, weaponName, killerTeam, victimTeam) {
      if (!el.killfeed) return;
      const item = document.createElement('div');
      item.className = 'feed-item';
      const kc = killerTeam === TEAM.VIPER ? 'viper' : 'sentinel';
      const vc = victimTeam === TEAM.VIPER ? 'viper' : 'sentinel';
      item.innerHTML = `<span class="${kc}">${escapeHtml(killer)}</span> <span class="feed-weapon">${headshot ? '◉ ' : ''}${escapeHtml(weaponName)}</span> <span class="${vc}">${escapeHtml(victim)}</span>`;
      el.killfeed.prepend(item);
      feedItems.push({ item, until: now + 5.2, fadeAt: now + 5.8 });
      while (feedItems.length > 5) feedItems.shift().item.remove();
    },
    damageFlash(fromYaw, playerYaw) {
      if (!el.damage) return;
      el.damage.classList.remove('on');
      void el.damage.offsetWidth;
      el.damage.classList.add('on');
      // Direction arc: rotate a radial indicator toward the shooter.
      const deg = ((fromYaw - playerYaw) * 180) / Math.PI;
      el.damage.style.setProperty('--dir', `${deg}deg`);
    },
    flashOverlay(strength) {
      if (!el.flash) return;
      el.flash.style.opacity = String(Math.min(1, strength));
    },
    showBanner(title, sub, ms = 2600) {
      if (!el.banner) return;
      setText(el.bannerTitle, title);
      setText(el.bannerSub, sub || '');
      el.banner.classList.add('on');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => el.banner.classList.remove('on'), ms);
    },
    showOverlay(kind, data = {}) {
      if (!el.overlay) return;
      el.overlay.hidden = false;
      const t = el.overlayTitle;
      const c = el.overlayCopy;
      if (kind === 'start') {
        setText(t, 'EMBERLINE');
        setText(c, 'Tactical FPS — Vipers attack, Sentinels defend. Plant the bomb or eliminate the enemy team. Click to play.');
        el.playBtn.textContent = 'Click to play';
      } else if (kind === 'paused') {
        setText(t, 'Paused');
        setText(c, 'Click to resume. B opens the buy menu during freeze time.');
        el.playBtn.textContent = 'Resume';
      } else if (kind === 'dead') {
        setText(t, 'You are down');
        setText(c, `Spectating ${data.name || 'a teammate'}. The round plays on — watch your team.`);
        el.playBtn.textContent = 'Keep spectating';
      } else if (kind === 'round') {
        setText(t, data.title || 'Round over');
        setText(c, data.sub || '');
        el.playBtn.textContent = 'Next round';
      } else if (kind === 'match') {
        setText(t, data.title || 'Match over');
        setText(c, data.sub || '');
        el.playBtn.textContent = 'Play again';
      }
      if (el.playBtn) el.playBtn.style.display = '';
    },
    hideOverlay() { if (el.overlay) el.overlay.hidden = true; },
    onPlay(fn) { if (el.playBtn) el.playBtn.addEventListener('click', fn); },
    showBuyMenu(money, loadout) {
      if (!el.buyMenu) return;
      setText(el.buyMoney, `$${money.toLocaleString('en-US')}`);
      el.buyList.innerHTML = '';
      for (const row of BUY_MENU) {
        const item = row.kind === 'weapon' ? WEAPONS[row.id] : (row.kind === 'grenade' ? GRENADES[row.id] : GEAR[row.id]);
        const owned = row.kind === 'weapon'
          ? (loadout.primary === row.id || loadout.sidearm === row.id)
          : (row.kind === 'gear' ? (row.id === 'armor' ? loadout.armor > 0 : loadout.helmet) : loadout.grenades[row.id] > 0);
        const div = document.createElement('div');
        div.className = `buy-row${owned ? ' owned' : ''}${money < item.price ? ' poor' : ''}`;
        div.innerHTML = `<kbd>${row.key}</kbd><span class="buy-name">${item.name}</span><span class="buy-price">$${item.price}</span>`;
        el.buyList.appendChild(div);
      }
      el.buyMenu.hidden = false;
    },
    hideBuyMenu() { if (el.buyMenu) el.buyMenu.hidden = true; },
    setBombBar(mode, frac, label) {
      if (!el.bombBar) return;
      if (!mode) { el.bombBar.hidden = true; return; }
      el.bombBar.hidden = false;
      el.bombFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
      el.bombFill.className = `bomb-fill ${mode}`;
      setText(el.bombLabel, label);
    },
    setSpectate(name) {
      if (!el.spec) return;
      if (!name) { el.spec.hidden = true; return; }
      el.spec.hidden = false;
      setText(el.spec, `SPECTATING — ${name}`);
    },
    setHint(text) { setText(el.hint, text || ''); },
    drawMinimap(playerPos, playerYaw, teammates, enemies, bombSite, bombPlanted) {
      const canvas = el.minimap;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width;
      const H = canvas.height;
      const { minX, maxX, minZ, maxZ } = MAP.bounds;
      const sx = (x) => ((x - minX) / (maxX - minX)) * W;
      const sz = (z) => ((z - minZ) / (maxZ - minZ)) * H;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(20,22,26,0.82)';
      ctx.fillRect(0, 0, W, H);
      // Walls.
      ctx.fillStyle = 'rgba(233,230,223,0.5)';
      for (const b of MAP.boxes) {
        ctx.fillRect(sx(b.x - b.w / 2), sz(b.z - b.d / 2), Math.max(1, (b.w / (maxX - minX)) * W), Math.max(1, (b.d / (maxZ - minZ)) * H));
      }
      // Sites.
      for (const [letter, s] of Object.entries(MAP.sites)) {
        ctx.strokeStyle = bombPlanted && bombSite === letter ? '#ff5a3c' : '#f0a830';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx(s.x), sz(s.z), (s.r / (maxX - minX)) * W, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#f0a830';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, sx(s.x), sz(s.z));
      }
      const dot = (x, z, color, r = 3) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx(x), sz(z), r, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const e of enemies) dot(e.x, e.z, '#e5484d', 2.5);
      for (const t of teammates) dot(t.x, t.z, '#f0a830', 2.5);
      // Player arrow.
      const px = sx(playerPos.x);
      const pz = sz(playerPos.z);
      ctx.save();
      ctx.translate(px, pz);
      ctx.rotate(-playerYaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
