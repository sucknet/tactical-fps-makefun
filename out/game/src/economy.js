// Buy menu input handling + the weapon/grenade/armor purchase rules. The DOM buttons live in
// index.html's #buy-menu; this module owns when it can open (freeze or first 8s of LIVE, inside
// spawn zone) and what a click does.
import { WEAPONS, GRENADES, PLAYER_ARMOR_MAX } from './config.js';

export function createEconomy(match, hud, hooks) {
  const state = {
    open: false,
    armor: 0,
    // per-round purchase memory so the player can rebuy ammo/nades freely but pay once for guns
    boughtGuns: new Set(),
  };

  function canOpen(matchState, playerPos) {
    const inSpawn = playerPos.z > 26; // spawn yard is the south strip
    const window = matchState.phase === 'freeze' || (matchState.phase === 'live' && matchState.timer > 67);
    return window && inSpawn;
  }

  function toggle(force) {
    const next = force !== undefined ? force : !state.open;
    state.open = next;
    hud.showBuyMenu(state.open, match.state.money, ownedIds(), hooks.currentWeaponId());
  }

  function ownedIds() {
    return hooks.ownedIds();
  }

  function tryPurchase(key) {
    let ok = false;
    if (key === 'armor') {
      if (state.armor >= PLAYER_ARMOR_MAX) return false;
      if (match.spend(650)) { state.armor = PLAYER_ARMOR_MAX; ok = true; }
    } else if (key.startsWith('nade:')) {
      const type = key.slice(5);
      const def = GRENADES[type];
      const held = hooks.grenadeCount(type);
      if (held >= 2) return false;
      if (match.spend(def.price)) { hooks.addGrenade(type); ok = true; }
    } else {
      const def = WEAPONS[key];
      if (!def) return false;
      if (state.boughtGuns.has(key) && hooks.owns(key)) {
        // free re-equip; ammo was refilled at round start anyway
        hooks.equip(key);
        hud.showBuyMenu(true, match.state.money, ownedIds(), hooks.currentWeaponId());
        return true;
      }
      if (match.spend(def.price)) {
        state.boughtGuns.add(key);
        hooks.give(key);
        ok = true;
      }
    }
    hud.showBuyMenu(state.open, match.state.money, ownedIds(), hooks.currentWeaponId());
    return ok;
  }

  function newRoundReload() {
    state.boughtGuns.clear();
  }

  return { state, canOpen, toggle, tryPurchase, newRoundReload };
}
