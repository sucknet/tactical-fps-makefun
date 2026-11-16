// HUD: health/armor, ammo, round timer + score, money, buy menu, grenade slots, kill feed,
// objective banner, plant/defuse progress, hit marker, damage vignette and scope overlay.
// All DOM, one module; the sim pushes state in, the DOM never pushes back.
import { WEAPONS, GRENADES, ROUNDS_TO_WIN } from './config.js';
import { PALETTE } from './palette.js';

export function createHud() {
  const el = (id) => document.getElementById(id);
  const dom = {
    health: el('health'), healthBar: el('health-bar'), armorBar: el('armor-bar'),
    ammoMag: el('ammo-mag'), ammoReserve: el('ammo-reserve'), weaponName: el('weapon-name'),
    timer: el('timer'), scoreYou: el('score-you'), scoreEnemy: el('score-enemy'),
    money: el('money'), feed: el('feed'), banner: el('banner'), bannerSub: el('banner-sub'),
    progressWrap: el('progress-wrap'), progress: el('progress'), progressLabel: el('progress-label'),
    hitmarker: el('hitmarker'), vignette: el('vignette'), scope: el('scope'),
    buyMenu: el('buy-menu'), buyList: el('buy-list'), grenadeRow: el('grenade-row'),
    roundPips: el('round-pips'), bombIcon: el('bomb-icon'), fps: el('fps'),
    overlay: el('overlay'), overlayTitle: el('overlay-title'), overlayCopy: el('overlay-copy'),
    play: el('play'), keysHint: el('keys-hint'),
  };

  let money = 0;
  let markerTimer = null;
  const feedItems = [];

  function setHealth(v, max) {
    dom.health.textContent = String(Math.max(0, Math.ceil(v)));
    dom.healthBar.style.width = `${Math.max(0, (v / max) * 100)}%`;
    dom.healthBar.style.background = v > 50 ? '#36c98f' : v > 25 ? PALETTE.uiAccent : '#d93636';
  }
  function setArmor(v, max) {
    dom.armorBar.style.width = `${Math.max(0, (v / max) * 100)}%`;
  }
  function setAmmo(mag, reserve) {
    dom.ammoMag.textContent = String(mag);
    dom.ammoReserve.textContent = `/ ${reserve}`;
    dom.ammoMag.style.color = mag === 0 ? PALETTE.uiAccent : PALETTE.uiInk;
  }
  function setWeapon(name) { dom.weaponName.textContent = name; }
  function setMoney(v) {
    money = v;
    dom.money.textContent = `$${v}`;
  }
  function getMoney() { return money; }
  function setTimer(t) {
    const m = Math.floor(Math.max(0, t) / 60);
    const s = Math.floor(Math.max(0, t) % 60);
    dom.timer.textContent = `${m}:${String(s).padStart(2, '0')}`;
    dom.timer.style.color = t < 10 && t > 0 && !dom.timer.dataset.bomb ? PALETTE.uiAccent : PALETTE.uiInk;
  }
  function setTimerBomb(active) {
    dom.timer.dataset.bomb = active ? '1' : '';
    dom.timer.style.color = active ? '#ff3b30' : PALETTE.uiInk;
  }
  function setScore(you, enemy) {
    dom.scoreYou.textContent = String(you);
    dom.scoreEnemy.textContent = String(enemy);
    renderPips(you, enemy);
  }
  function renderPips(you, enemy) {
    let html = '';
    for (let i = 0; i < ROUNDS_TO_WIN; i += 1) {
      html += `<i class="${i < you ? 'you' : ''}"></i>`;
    }
    html += '<span class="vs">·</span>';
    for (let i = 0; i < ROUNDS_TO_WIN; i += 1) {
      html += `<i class="${i < enemy ? 'them' : ''}"></i>`;
    }
    dom.roundPips.innerHTML = html;
  }
  function setGrenades(grenades, selected) {
    let html = '';
    for (const key of Object.keys(GRENADES)) {
      const count = grenades[key];
      html += `<span class="nade ${selected === key ? 'sel' : ''} ${count ? '' : 'empty'}">${count || ''}</span>`;
    }
    dom.grenadeRow.innerHTML = html;
  }
  function setBombCarried(carried) {
    dom.bombIcon.style.opacity = carried ? '1' : '0.25';
  }

  function feed(text, danger) {
    const row = document.createElement('div');
    row.className = `feed-row ${danger ? 'danger' : ''}`;
    row.textContent = text;
    dom.feed.appendChild(row);
    feedItems.push(row);
    setTimeout(() => {
      row.classList.add('gone');
      setTimeout(() => row.remove(), 400);
    }, 3400);
    while (feedItems.length > 5) feedItems.shift().remove();
  }

  function banner(main, sub, holdMs = 2200) {
    dom.banner.textContent = main;
    dom.bannerSub.textContent = sub || '';
    dom.banner.parentElement.classList.add('show');
    clearTimeout(banner._t);
    banner._t = setTimeout(() => dom.banner.parentElement.classList.remove('show'), holdMs);
  }
  function bannerHold(main, sub) {
    dom.banner.textContent = main;
    dom.bannerSub.textContent = sub || '';
    dom.banner.parentElement.classList.add('show');
  }
  function bannerHide() {
    dom.banner.parentElement.classList.remove('show');
    clearTimeout(banner._t);
  }

  function progress(label, frac) {
    if (frac <= 0) { dom.progressWrap.style.opacity = '0'; return; }
    dom.progressWrap.style.opacity = '1';
    dom.progressLabel.textContent = label;
    dom.progress.style.width = `${Math.min(100, frac * 100)}%`;
  }

  function hitMarker(kill) {
    dom.hitmarker.classList.add('on');
    dom.hitmarker.classList.toggle('kill', kill);
    clearTimeout(markerTimer);
    markerTimer = setTimeout(() => dom.hitmarker.classList.remove('on'), 110);
  }

  function damageFlash(frac) {
    dom.vignette.style.opacity = String(Math.min(0.85, frac));
    clearTimeout(damageFlash._t);
    damageFlash._t = setTimeout(() => { dom.vignette.style.opacity = '0'; }, 130);
  }
  function lowHealthPulse(on) {
    dom.vignette.classList.toggle('persistent', on);
  }

  function scope(on) {
    dom.scope.classList.toggle('on', on);
  }

  function fps(v) { dom.fps.textContent = `${v} fps`; }

  function showBuyMenu(open, moneyNow, owned, currentId) {
    dom.buyMenu.classList.toggle('open', open);
    if (!open) return;
    let html = '';
    for (const key of ['rifle', 'smg', 'sniper', 'pistol']) {
      const w = WEAPONS[key];
      const own = owned.has(key);
      const active = currentId === key;
      const afford = moneyNow >= w.price;
      html += `<button class="buy-row ${active ? 'active' : ''} ${afford && !own ? '' : 'dim'}" data-buy="${key}" data-cost="${w.price}">
        <span class="buy-key">${key === 'pistol' ? '2' : '1'}</span>
        <span class="buy-name">${w.name}</span>
        <span class="buy-stat">DMG ${w.damage} · RPM ${w.rpm}</span>
        <span class="buy-price">${own ? (active ? 'EQUIPPED' : 'OWNED — rebuy $0*') : `$${w.price}`}</span>
      </button>`;
    }
    let gn = 3;
    for (const key of Object.keys(GRENADES)) {
      const g = GRENADES[key];
      const afford = moneyNow >= g.price;
      html += `<button class="buy-row nade-row ${afford ? '' : 'dim'}" data-buy="nade:${key}" data-cost="${g.price}">
        <span class="buy-key">${gn}</span>
        <span class="buy-name">${g.name}</span>
        <span class="buy-stat">${key === 'frag' ? 'AoE 98' : key === 'flash' ? 'blind 2.6s' : 'cover 13s'}</span>
        <span class="buy-price">$${g.price}</span>
      </button>`;
      gn += 1;
    }
    html += `<button class="buy-row armor-row ${moneyNow >= 650 ? '' : 'dim'}" data-buy="armor" data-cost="650">
      <span class="buy-key">4</span><span class="buy-name">Kevlar Vest</span>
      <span class="buy-stat">armor 100</span><span class="buy-price">$650</span></button>`;
    dom.buyList.innerHTML = html;
  }

  function showOverlay(title, copy, playLabel) {
    dom.overlayTitle.textContent = title;
    dom.overlayCopy.textContent = copy;
    dom.play.textContent = playLabel || 'Click to play';
    dom.overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    dom.overlay.classList.add('hidden');
  }

  return {
    setHealth, setArmor, setAmmo, setWeapon, setMoney, getMoney, setTimer, setTimerBomb,
    setScore, setGrenades, setBombCarried, feed, banner, bannerHold, bannerHide, progress,
    hitMarker, damageFlash, lowHealthPulse, scope, fps, showBuyMenu, showOverlay, hideOverlay,
    play: dom.play,
  };
}
