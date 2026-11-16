// Weapon simulation: firing, spread that punishes movement/air/crouch-inattention, recoil
// accumulation with recovery, reloads, ammo pools and the scoped state. One Weapon instance owns
// its own state object; nothing else mutates it.
import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { PALETTE } from './palette.js';

export function createWeapon(initialId = 'pistol') {
  const state = {
    weapon: WEAPONS[initialId],
    owned: new Set(['pistol']),
    mag: WEAPONS[initialId].mag,
    reserve: WEAPONS[initialId].reserve,
    grenades: { frag: 0, flash: 0, smoke: 0 },
    cooldown: 0,
    reloadTimer: 0,
    reloadTotal: 0,
    spreadHeat: 0,        // grows while firing, decays; adds to base spread
    kick: 0,              // viewmodel kick 0..1
    lastShotAt: -1,
    scoped: false,
    switching: 0,
  };

  function switchTo(id) {
    if (!state.owned.has(id) || state.weapon.id === id) return false;
    state.weapon = WEAPONS[id];
    state.mag = WEAPONS[id].mag;
    state.reserve = WEAPONS[id].reserve;
    state.reloadTimer = 0;
    state.cooldown = 0.35;
    state.switching = 0.3;
    state.scoped = false;
    return true;
  }

  function buy(id) {
    state.owned.add(id);
    switchTo(id);
  }

  function canFire(now) {
    return state.cooldown <= 0 && state.reloadTimer <= 0 && state.mag > 0 && state.switching <= 0;
  }

  function startReload() {
    if (state.reloadTimer > 0 || state.mag >= state.weapon.mag || state.reserve <= 0) return false;
    state.reloadTotal = state.weapon.reloadTime;
    state.reloadTimer = state.weapon.reloadTime;
    state.scoped = false;
    return true;
  }

  function finishReloadIfDue() {
    if (state.reloadTimer > 0) {
      state.reloadTimer -= 0; // decay handled in step()
    }
  }

  function step(dt) {
    if (state.cooldown > 0) state.cooldown -= dt;
    if (state.switching > 0) state.switching -= dt;
    if (state.reloadTimer > 0) {
      state.reloadTimer -= dt;
      if (state.reloadTimer <= 0) {
        const need = state.weapon.mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
        state.reloadTimer = 0;
      }
    }
    state.spreadHeat = Math.max(0, state.spreadHeat - dt * 1.6);
    state.kick = Math.max(0, state.kick - dt * 7);
  }

  // Spread in radians given movement state; crouching and standing still tighten it.
  function currentSpread(moveSpeed, airborne, crouching, scopedNow) {
    const w = state.weapon;
    let s = w.spreadBase + state.spreadHeat * w.spreadBase * 5;
    s += (moveSpeed / 5.4) * w.spreadMove;
    if (airborne) s += w.spreadJump;
    if (crouching) s *= 0.55;
    if (scopedNow && w.scoped) s *= 0.08;
    return s;
  }

  // Consumes a round; returns null when it cannot fire.
  function takeRound(now) {
    if (!canFire(now)) return null;
    state.mag -= 1;
    state.cooldown = 60 / state.weapon.rpm;
    state.spreadHeat = Math.min(3, state.spreadHeat + 1);
    state.kick = Math.min(1.4, state.kick + 0.55);
    return true;
  }

  return { state, switchTo, buy, canFire, startReload, step, currentSpread, takeRound };
}

// Applies damage with range falloff and hitbox multipliers. Returns damage dealt.
export function applyDamage(def, distance, part, target) {
  let dmg = def.damage;
  if (distance > def.falloffStart) {
    const t = Math.min(1, (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart));
    dmg *= 1 - t * (1 - def.minDamageMult);
  }
  if (part === 'head') dmg *= def.headMult;
  else if (part === 'legs') dmg *= def.legMult;
  const absorbed = Math.min(target.armor, dmg * 0.5);
  target.armor = Math.max(0, target.armor - absorbed);
  target.health = Math.max(0, target.health - (dmg - absorbed * 0.5));
  return dmg;
}

// One shared raycaster + reusable vectors: no per-frame allocation in the shooting path.
const raycaster = new THREE.Raycaster();
const dir = new THREE.Vector3();
const spreadVec = new THREE.Vector3();
const recoilVec = new THREE.Vector2();

export function makeShootContext() {
  return { raycaster, dir, spreadVec, recoilVec, seedState: { a: 0x9e3779b9 } };
}

// Deterministic RNG (mulberry32) so a given seed reproduces a match.
export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
