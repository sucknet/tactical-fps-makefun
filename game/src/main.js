// BREACHPOINT: DOCKSIDE — a round-based tactical FPS on three.js. Fixed 60 Hz simulation,
// render at display rate. 1 player (attacker) vs 4 defending bots: eliminate the crew, or plant
// the charge at site A and hold. Money between rounds, buy menu, three grenade types.
// ?shot=start|play|end with &seed=N builds a deterministic staged frame for a capture, renders
// it twice, sets window.__shotReady and freezes — screenshots are real renders of this code.
import * as THREE from 'three';
import {
  FIXED_STEP, MAX_STEPS_PER_FRAME, ROUNDS_TO_WIN, ROUND_TIME,
  PLAYER_MAX_HEALTH, PLAYER_ARMOR_MAX, LOOK_SENSITIVITY, FOV, CROUCH_FOV_DELTA,
  BOT_COUNT, KILL_REWARD, PLANT_BONUS, GRENADES, WEAPONS,
} from './config.js';
import { PALETTE } from './palette.js';
import { createWorld, MAP_HALF } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, makeShootContext, mulberry32 } from './weapon.js';
import { createViewModel, animateViewModel } from './viewmodel.js';
import { createBots, botStep } from './bots.js';
import { createGrenades } from './grenades.js';
import { createEffects } from './effects.js';
import { createBomb } from './bomb.js';
import { createMatch, PHASE } from './match.js';
import { createEconomy } from './economy.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

// ---- Renderer / scene --------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 95);
const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

// Lighting: cold ambient pre-dawn, one low sun with shadows, warm lamp accents from world.js.
const hemi = new THREE.HemisphereLight(0x3a4a63, 0x1a1d22, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xbfd0e8, 1.35);
sun.position.set(-30, 42, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.far = 130;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x232a36, 0.5));

// ---- Modules -----------------------------------------------------------------
const world = createWorld(scene);
const bots = createBots(scene, world);
for (let i = 0; i < BOT_COUNT; i += 1) bots.addBot(i);
const grenades = createGrenades(scene, world);
const effects = createEffects(scene);
const bomb = createBomb(scene, world);
const match = createMatch();
const weapon = createWeapon('pistol');
const player = createPlayer(world.colliders);
const hud = createHud();
const economy = createEconomy(match, hud, {
  ownedIds: () => weapon.state.owned,
  owns: (id) => weapon.state.owned.has(id),
  give: (id) => { weapon.buy(id); audio.play('buy'); },
  equip: (id) => { weapon.switchTo(id); },
  currentWeaponId: () => weapon.state.weapon.id,
  grenadeCount: (type) => weapon.state.grenades[type] || 0,
  addGrenade: (type) => { weapon.state.grenades[type] = (weapon.state.grenades[type] || 0) + 1; },
});
const audio = createAudio();
const input = createInput(renderer.domElement, onLockChange);
const vm = createViewModel(camera);
const shootCtx = makeShootContext();
const shootables = world.shootables.concat(bots.hitMeshes);

// Player combat state (kept beside the movement state, owned here).
const combat = {
  health: PLAYER_MAX_HEALTH,
  armor: 0,
  alive: true,
  blindTimer: 0,
  lastDamageAt: -1,
  selectedNade: 'frag',
  nadeCooldown: 0,
  deaths: 0,
};
let scoreFlashHint = 0;
let fpsCounter = { frames: 0, t: 0, value: 0 };

bomb.setHooks({ beep: () => audio.play('bombBeep', 0.5) });

// ---- Round flow --------------------------------------------------------------
hud.setScore(0, 0);
hud.setMoney(match.state.money);
hud.showOverlay('BREACHPOINT: DOCKSIDE',
  'Round-based tactical assault. You attack with the charge: eliminate the copperline crew or plant at site A and hold. First to 4 rounds.',
  'Click to deploy');
hud.bannerHold('ROUND 1', 'Buy phase — B opens the buy menu');

function beginRound(fresh) {
  if (fresh) match.startRound();
  bots.reset(match.state.round);
  grenades.clear();
  bomb.reset();
  combat.health = PLAYER_MAX_HEALTH;
  combat.alive = true;
  combat.blindTimer = 0;
  player.position.set((random() - 0.5) * 6, 0, 33 + random() * 3);
  player.velocity.set(0, 0, 0);
  player.yaw = Math.PI;
  player.pitch = 0;
  // Refill ammo pools for owned weapons and re-arm the pistol at minimum.
  for (const id of weapon.state.owned) {
    weapon.switchTo(id);
    weapon.state.mag = WEAPONS[id].mag;
    weapon.state.reserve = WEAPONS[id].reserve;
  }
  economy.newRoundReload();
  if (match.state.phase === PHASE.FREEZE) {
    hud.bannerHold(`ROUND ${match.state.round}`, match.state.round === 1 ? 'B — buy gear, then push site A' : 'Buy phase — B');
  } else {
    hud.banner(`ROUND ${match.state.round}`, 'Go!');
  }
  hud.setBombCarried(true);
  syncHud();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (!shot && match.state.phase !== PHASE.MATCH_END) {
    hud.showOverlay('PAUSED', 'Pointer released. Click to resume.', 'Resume');
  }
}

// ---- Shooting ----------------------------------------------------------------
const muzzleWorld = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const camDir = new THREE.Vector3();

function playerShoot(spreadScale) {
  if (weapon.takeRound() === null) {
    if (weapon.state.mag === 0 && weapon.state.reloadTimer <= 0) {
      audio.play('deny', 0.5);
      weapon.startReload();
    }
    return;
  }
  const def = weapon.state.weapon;
  camera.getWorldDirection(camDir);
  const spread = weapon.currentSpread(player.groundSpeed(), !player.state.onGround, player.state.crouching, weapon.state.scoped) * spreadScale;
  shootCtx.dir.copy(camDir);
  shootCtx.dir.x += (random() * 2 - 1) * spread;
  shootCtx.dir.y += (random() * 2 - 1) * spread;
  shootCtx.dir.z += (random() * 2 - 1) * spread;
  shootCtx.dir.normalize();
  shootCtx.raycaster.set(camera.position, shootCtx.dir);
  shootCtx.raycaster.far = 120;
  scene.updateMatrixWorld(true);
  const hit = shootCtx.raycaster.intersectObjects(shootables, false)[0];

  muzzleWorld.set(0.26, -0.18, -1.1).applyMatrix4(camera.matrixWorld);
  const endPoint = hit ? hit.point : shootCtx.raycaster.ray.at(90, hitPoint);
  effects.tracer(muzzleWorld, endPoint, def.tracer);
  vm.flashLight.intensity = 3.2;
  vm.setShellLife(0.14);
  audio.play(`shot${def.id === 'pistol' ? 'Pistol' : def.id === 'smg' ? 'Smg' : def.id === 'sniper' ? 'Sniper' : 'Rifle'}`, 0.9, 0.95 + random() * 0.1);
  bots.alertNear(player.position);

  if (hit) {
    const ud = hit.object.userData;
    if (ud && ud.bot && ud.bot.alive) {
      const part = ud.part;
      const dist = hit.distance;
      const result = bots.damage(ud.bot, applyDefDamage(def, dist, part), part);
      effects.blood(hit.point);
      hud.hitMarker(result.killed);
      audio.play(result.killed ? 'hitKill' : 'hit', 0.7);
      if (result.killed) {
        match.state.kills += 1;
        match.addMoney(def.killAward);
        hud.feed(`You ▸ crew ${ud.bot.index + 1}`, false);
        hud.setMoney(match.state.money);
        if (bots.aliveCount() === 0) winRound('elimination');
      }
    } else {
      effects.impact(hit.point, hit.face ? hit.face.normal : camDir);
    }
  }

  // Recoil: vertical climb + small horizontal wander, recovered automatically.
  const heatFactor = 1 + weapon.state.spreadHeat * 0.12;
  player.recoil(def.recoilPitch * heatFactor * (player.state.crouching ? 0.8 : 1), (random() * 2 - 1) * def.recoilYaw);
  syncHudAmmo();
}

// Damage from a weapon def with falloff (bots have no armor multipliers beyond part mults).
function applyDefDamage(def, distance, part) {
  let dmg = def.damage;
  if (distance > def.falloffStart) {
    const t = Math.min(1, (distance - def.falloffStart) / (def.falloffEnd - def.falloffStart));
    dmg *= 1 - t * (1 - def.minDamageMult);
  }
  if (part === 'head') dmg *= def.headMult;
  else if (part === 'legs') dmg *= def.legMult;
  return dmg;
}

function winRound(reason) {
  match.endRound(true, reason);
  audio.play('roundWin', 0.8);
  hud.bannerHold('ROUND WON', reason === 'bomb' ? 'The charge detonated' : 'Crew eliminated');
  hud.setScore(match.state.scoreYou, match.state.scoreEnemy);
  if (reason === 'bomb') hud.setTimerBomb(false);
  endRoundCommon();
}

function loseRound(reason) {
  match.endRound(false, reason);
  audio.play('roundLose', 0.8);
  hud.bannerHold('ROUND LOST', reason === 'time' ? 'Round timer expired' : reason === 'player_dead' ? 'You were eliminated' : 'The charge was lost');
  hud.setScore(match.state.scoreYou, match.state.scoreEnemy);
  endRoundCommon();
}

function endRoundCommon() {
  hud.setMoney(match.state.money);
  if (match.matchOver()) {
    setTimeout(() => showMatchEnd(), 1200);
  }
}

function showMatchEnd() {
  const won = match.state.scoreYou > match.state.scoreEnemy;
  input.releaseLock();
  hud.showOverlay(won ? 'MISSION COMPLETE' : 'MISSION FAILED',
    `Final score ${match.state.scoreYou}–${match.state.scoreEnemy}. ${match.state.kills} kills across ${match.state.round} rounds.`,
    'Play again');
  hud.bannerHide();
  match.state.phase = PHASE.MATCH_END;
}

function restartMatch() {
  match.state.scoreYou = 0;
  match.state.scoreEnemy = 0;
  match.state.round = 1;
  match.state.money = 800;
  match.state.lossStreak = 0;
  match.state.kills = 0;
  combat.armor = 0;
  weapon.state.owned = new Set(['pistol']);
  weapon.switchTo('pistol');
  weapon.state.grenades = { frag: 0, flash: 0, smoke: 0 };
  economy.state.armor = 0;
  hud.setScore(0, 0);
  hud.setMoney(match.state.money);
  beginRound(true);
  hud.bannerHold('ROUND 1', 'Buy phase — B opens the buy menu');
}

// ---- Grenades ------------------------------------------------------------------
function throwSelected() {
  if (combat.nadeCooldown > 0) return;
  const count = weapon.state.grenades[combat.selectedNade] || 0;
  if (count <= 0) { audio.play('deny', 0.4); return; }
  weapon.state.grenades[combat.selectedNade] = count - 1;
  combat.nadeCooldown = 0.7;
  camera.getWorldDirection(camDir);
  const origin = camera.position.clone();
  grenades.throwGrenade(combat.selectedNade, origin, camDir, 13, match.state.timer);
  audio.play('pin', 0.6);
  syncHud();
}

function onFrag(pos, def) {
  audio.play('explode', 1);
  effects.impact(pos, new THREE.Vector3(0, 1, 0));
  for (let i = 0; i < 10; i += 1) {
    effects.impact(new THREE.Vector3(pos.x + (random() - 0.5), pos.y + random(), pos.z + (random() - 0.5)), new THREE.Vector3(0, 1, 0));
  }
  const dp = player.position.distanceTo(pos);
  if (dp < def.radius && combat.alive) {
    const dmg = def.damage * (1 - dp / def.radius);
    hurtPlayer(dmg, null);
  }
  bots.forEach((bot) => {
    if (!bot.alive) return;
    const d = bot.group.position.distanceTo(pos);
    if (d < def.radius) {
      const dmg = def.damage * (1 - d / def.radius) * (losClear(pos, bot.group.position) ? 1 : 0.25);
      const result = bots.damage(bot, dmg, 'chest');
      if (result.killed) {
        match.state.kills += 1;
        match.addMoney(KILL_REWARD);
        hud.feed('You ▸ crew (frag)', false);
        hud.setMoney(match.state.money);
        if (bots.aliveCount() === 0) winRound('elimination');
      }
    }
  });
}

function onFlash(pos, def) {
  audio.play('flashPop', 0.9);
  // LOS + angle check: blinded if the flash is in view and close enough.
  camera.getWorldDirection(camDir);
  const toFlash = pos.clone().sub(camera.position);
  const d = toFlash.length();
  if (d < def.radius) {
    toFlash.normalize();
    const facing = toFlash.dot(camDir);
    if (facing > 0.1) {
      combat.blindTimer = def.blindSeconds * Math.min(1, facing + 0.35);
      hud.scope(false);
    }
  }
  bots.forEach((bot) => {
    if (!bot.alive) return;
    const bd = bot.group.position.distanceTo(pos);
    if (bd < def.radius && losClear(pos, bot.group.position)) {
      bot.reactTimer = Math.max(bot.reactTimer, def.blindSeconds * 0.8);
      bot.seePlayer = false;
      bot.burstLeft = 0;
    }
  });
}

function losClear(a, b) {
  shootCtx.raycaster.set(a, shootCtx.dir.copy(b).sub(a).normalize());
  shootCtx.raycaster.far = a.distanceTo(b) - 0.2;
  const hits = shootCtx.raycaster.intersectObjects(world.shootables, false);
  return hits.length === 0;
}

// ---- Player damage ---------------------------------------------------------------
function hurtPlayer(dmg, fromPos) {
  if (!combat.alive || match.state.phase !== PHASE.LIVE) return;
  const absorbed = Math.min(combat.armor, dmg * 0.5);
  combat.armor -= absorbed;
  combat.health -= dmg - absorbed * 0.5;
  hud.damageFlash(Math.min(0.85, dmg / 40));
  audio.play('hurt', 0.5, 0.9 + random() * 0.2);
  hud.setHealth(combat.health, PLAYER_MAX_HEALTH);
  hud.setArmor(combat.armor, PLAYER_ARMOR_MAX);
  if (combat.health <= 0) {
    combat.alive = false;
    combat.deaths += 1;
    match.state.deaths += 1;
    hud.feed('crew ▸ you', true);
    hud.lowHealthPulse(false);
    loseRound('player_dead');
  } else {
    hud.lowHealthPulse(combat.health < 30);
  }
}

// ---- Bot shots at the player ------------------------------------------------------
function botShoot(bot) {
  const def = WEAPONS.rifle;
  const eye = bot.group.position;
  const eyeY = eye.y + bot.eyeHeight;
  const targetEye = new THREE.Vector3(player.position.x, player.position.y + player.eye, player.position.z);
  const dist = eyeY !== undefined ? Math.hypot(targetEye.x - eye.x, targetEye.y - eyeY, targetEye.z - eye.z) : 20;
  muzzleWorld.set(eye.x - Math.sin(bot.yaw) * 0.5, eyeY, eye.z - Math.cos(bot.yaw) * 0.5);
  effects.tracer(muzzleWorld, targetEye, 0xff8866);
  bot.muzzle.intensity = 2.6;
  const atten = 1 / (1 + dist * dist * 0.008);
  audio.play('shotRifle', 0.55 * atten + 0.05, 0.8 + random() * 0.15);

  // Hit chance falls with distance, movement, crouch and blink; smoke blocks.
  let chance = 0.32 - dist * 0.004;
  if (player.groundSpeed() > 3.5) chance -= 0.1;
  if (player.state.crouching) chance -= 0.05;
  if (!player.state.onGround) chance -= 0.06;
  if (grenades.smokeBlocks(eye, targetEye)) chance = 0.02;
  if (random() < chance) {
    const part = random() < 0.12 ? 'head' : random() < 0.2 ? 'legs' : 'chest';
    let dmg = def.damage * (0.85 + random() * 0.3);
    if (part === 'head') dmg *= 1.6;
    if (part === 'legs') dmg *= 0.7;
    hurtPlayer(dmg, eye);
  }
}

// ---- Simulation step (fixed) --------------------------------------------------------
const keysHeld = input.state.keys;
const lookDelta = { x: 0, y: 0 };

function step(dt) {
  match.step(dt);

  // FREEZE: player cannot move but can look and buy.
  const frozen = match.state.phase === PHASE.FREEZE;
  const live = match.state.phase === PHASE.LIVE;

  player.step(dt, frozen ? new Set() : keysHeld, false);
  weapon.step(dt);
  effects.step(dt);
  grenades.step(dt, {
    onBounce: () => audio.play('bounce', 0.35),
    onFrag, onFlash,
  });
  combat.nadeCooldown = Math.max(0, combat.nadeCooldown - dt);
  if (combat.blindTimer > 0) combat.blindTimer -= dt;

  if (live && combat.alive) {
    bomb.step(dt, (pos) => {
      // detonation
      audio.play('explode', 1);
      for (let i = 0; i < 14; i += 1) {
        effects.impact(new THREE.Vector3(pos.x + (random() - 0.5) * 4, 1 + random() * 2, pos.z + (random() - 0.5) * 4), new THREE.Vector3(0, 1, 0));
      }
      winRound('bomb');
    });
  }

  // Bot AI only runs during LIVE; they idle during freeze (and hold their spawn pose).
  if (live) {
    botStep(bots.bots, dt, player.state, world, {
      playerAlive: combat.alive,
      botShoot: (bot) => botShoot(bot),
    });
  }

  // Round timer / bomb pressure HUD
  if (bomb.state.planted) {
    hud.setTimer(bomb.state.timer);
    hud.setTimerBomb(true);
  } else {
    hud.setTimer(match.state.timer);
    hud.setTimerBomb(false);
  }
}

// ---- Interaction keys (handled outside the fixed step so they are frame-accurate) -----
function handleActions(pressed) {
  if (pressed.has('KeyB')) {
    if (economy.canOpen(match.state, player.position)) {
      economy.toggle();
      input.releaseLock();
    } else {
      audio.play('deny', 0.4);
    }
  }
  if (economy.state.open) {
    if (pressed.has('Escape')) economy.toggle(false);
    return;
  }
  if (pressed.has('KeyR')) weapon.startReload();
  if (pressed.has('Digit1')) { if (weapon.switchTo(ownedSlot1())) audio.play('switch', 0.5); }
  if (pressed.has('Digit2')) { if (weapon.switchTo('pistol')) audio.play('switch', 0.5); }
  for (const key of ['Digit3', 'Digit4', 'Digit5']) {
    if (pressed.has(key)) {
      const nadeKeys = ['frag', 'flash', 'smoke'];
      const nade = nadeKeys[Number(key.slice(5)) - 3];
      if ((weapon.state.grenades[nade] || 0) > 0) {
        combat.selectedNade = nade;
        audio.play('switch', 0.4);
      }
    }
  }
  if (pressed.has('KeyG')) throwSelected();
  hud.setGrenades(weapon.state.grenades, combat.selectedNade);
  hud.setBombCarried(bomb.state.carried);
}

function ownedSlot1() {
  for (const id of ['sniper', 'rifle', 'smg']) {
    if (weapon.state.owned.has(id)) return id;
  }
  return 'smg';
}

// ---- Camera + view model ---------------------------------------------------------
function syncCamera(dt) {
  const p = player.state;
  camera.position.set(p.position.x, p.position.y + p.eye, p.position.z);
  const bobX = Math.sin(p.bobPhase) * 0.018 * p.bobAmount;
  const bobY = Math.abs(Math.cos(p.bobPhase)) * 0.02 * p.bobAmount + p.landImpact * 0.06;
  camera.position.x += bobX * Math.cos(p.yaw);
  camera.position.z += bobX * Math.sin(p.yaw);
  camera.position.y += bobY;
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
  camera.rotation.z = Math.sin(p.bobPhase) * 0.004 * p.bobAmount;

  // FOV: scoped -> narrow, crouch -> slight zoom.
  const def = weapon.state.weapon;
  const targetFov = weapon.state.scoped && def.scoped ? def.scopeFov : FOV - (p.crouching ? CROUCH_FOV_DELTA : 0);
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 14);
    camera.updateProjectionMatrix();
  }
}

// ---- HUD sync ---------------------------------------------------------------------
function syncHudAmmo() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
}
function syncHud() {
  hud.setAmmo(weapon.state.mag, weapon.state.reserve);
  hud.setWeapon(weapon.state.weapon.name);
  hud.setHealth(combat.health, PLAYER_MAX_HEALTH);
  hud.setArmor(combat.armor, PLAYER_ARMOR_MAX);
  hud.setMoney(match.state.money);
  hud.setGrenades(weapon.state.grenades, combat.selectedNade);
}

// ---- Frame loop --------------------------------------------------------------------
let accumulator = 0;
let lastTime = performance.now();
let plantHeld = false;
let lastLookX = 0;
let lastLookY = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  fpsCounter.frames += 1;
  fpsCounter.t += dtReal;
  if (fpsCounter.t >= 0.5) {
    fpsCounter.value = Math.round(fpsCounter.frames / fpsCounter.t);
    fpsCounter.frames = 0;
    fpsCounter.t = 0;
    hud.fps(fpsCounter.value);
  }

  const locked = document.pointerLockElement === renderer.domElement;
  const playing = locked && match.state.phase !== PHASE.MATCH_END;

  if (playing) {
    const look = input.takeLook();
    lookDelta.x = look.x;
    lookDelta.y = look.y;
    const sens = LOOK_SENSITIVITY * (weapon.state.scoped ? 0.4 : 1);
    player.look(look.x, look.y, sens);

    const pressed = input.takePressed();
    handleActions(pressed);

    // Scope toggle on hold (right mouse).
    const wantScope = input.state.scopeHeld && weapon.state.weapon.scoped && weapon.state.reloadTimer <= 0;
    if (wantScope !== weapon.state.scoped) {
      weapon.state.scoped = wantScope;
      vm.root.visible = !wantScope;
      hud.scope(wantScope);
    }

    // Fire (auto or semi).
    if (input.state.firing && !economy.state.open) {
      if (weapon.state.weapon.auto || !firedThisPress) {
        if (weapon.canFire()) {
          playerShoot(1);
          firedThisPress = true;
        }
      }
    }
    if (!input.state.firing) firedThisPress = false;

    // Plant / defuse hold (E).
    const wantPlant = keysHeld.has('KeyE') && match.state.phase === PHASE.LIVE && !bomb.state.planted;
    if (wantPlant) {
      const res = bomb.tryPlant(player.state.position, true, FIXED_STEP, () => {
        match.addMoney(PLANT_BONUS);
        match.state.plantRewardGiven = true;
        audio.play('bombPlanted', 0.8);
        hud.feed('Charge armed — 0:30', true);
        hud.banner('CHARGE ARMED', 'Hold the site', 1800);
        match.state.timer = Math.max(match.state.timer, 40);
      });
      hud.progress('ARMING CHARGE', res.progress);
      plantHeld = true;
    } else {
      if (plantHeld) hud.progress('', 0);
      plantHeld = false;
      hud.progress('', 0);
    }

    // Fixed-step simulation.
    accumulator += dtReal;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < MAX_STEPS_PER_FRAME) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * MAX_STEPS_PER_FRAME) accumulator = 0;

    // Round end transitions.
    if (match.state.phase === PHASE.END) {
      if (match.state.timer <= 0) {
        if (match.matchOver()) {
          showMatchEnd();
        } else {
          match.state.round += 1;
          beginRound(true);
        }
      }
    }

    animateViewModel(vm, weapon.state, player.state, dtReal, lookDelta.x, lookDelta.y);
    lastLookX = lookDelta.x;
    lastLookY = lookDelta.y;
  } else {
    input.takeLook();
    input.takePressed();
  }

  // Blind overlay strength.
  syncCamera(dtReal);
  hud.damageFlash(0); // no-op unless called with >0 by hurt; keeps vignette transitions tight

  renderer.render(scene, camera);
}

let firedThisPress = false;

// ---- Buy menu clicks ------------------------------------------------------------------
document.getElementById('buy-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-buy]');
  if (!btn) return;
  const ok = economy.tryPurchase(btn.dataset.buy);
  audio.play(ok ? 'buy' : 'deny', 0.6);
  hud.setMoney(match.state.money);
  syncHud();
});
document.getElementById('buy-close').addEventListener('click', () => {
  economy.toggle(false);
  input.requestLock();
});

// ---- Overlay play button ----------------------------------------------------------------
hud.play.addEventListener('click', () => {
  if (shot) return;
  audio.resume();
  if (match.state.phase === PHASE.MATCH_END) restartMatch();
  hud.hideOverlay();
  input.requestLock();
});

// ---- Resize --------------------------------------------------------------------------------
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Deterministic staged shots for capture --------------------------------------------------
function settle(steps) {
  for (let i = 0; i < steps; i += 1) step(FIXED_STEP);
}
function aimAt(point) {
  const dx = point.x - player.state.position.x;
  const dy = point.y - (player.state.position.y + player.state.eye);
  const dz = point.z - player.state.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  player.state.yaw = Math.atan2(-dx, -dz);
  player.state.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera(0.016);
}

function runShot(name) {
  hud.hideOverlay();
  hud.bannerHide();
  hud.progress('', 0);
  match.state.phase = PHASE.LIVE;
  match.state.timer = 58;
  hud.setScore(2, 1);
  match.state.round = 3;
  match.state.money = 4300;

  if (name === 'start') {
    // Spawn view: standing in the freight yard looking north across both lanes.
    player.state.position.set(0, 0, 34);
    player.state.yaw = Math.PI;
    player.state.pitch = -0.02;
    economy.toggle(true);
    match.state.phase = PHASE.FREEZE;
    match.state.timer = 8;
    hud.setScore(0, 0);
    match.state.round = 1;
    hud.bannerHold('ROUND 1', 'Buy phase — B opens the buy menu');
    weapon.buy('rifle');
    weapon.state.grenades = { frag: 1, flash: 1, smoke: 0 };
    economy.state.armor = 100;
    hud.setArmor(100, PLAYER_ARMOR_MAX);
  } else if (name === 'play') {
    // Mid firefight: warehouse lane, two bots visible, one mid-recoil shot.
    player.state.position.set(-3.5, 0, 14);
    player.state.yaw = 2.7;
    player.state.pitch = 0.06;
    weapon.buy('rifle');
    weapon.state.grenades = { frag: 1, flash: 0, smoke: 1 };
    economy.state.armor = 60;
    hud.setArmor(60, PLAYER_ARMOR_MAX);
    combat.health = 68;
    hud.setHealth(68, PLAYER_MAX_HEALTH);
    bots.reset(3);
    bots.bots[0].group.position.set(-2, 0, -6);
    bots.bots[0].yaw = Math.PI * 0.1;
    bots.bots[1].group.position.set(5, 0, -12);
    bots.bots[1].yaw = Math.PI * 0.85;
    bots.bots[2].group.position.set(-17, 0, -18);
    bots.bots[3].group.position.set(18, 0, -20);
    hud.feed('You ▸ crew 3', false);
    hud.feed('crew 2 ▸ you', true);
    settle(6);
    // one round in flight for the tracer
    playerShoot(0.35);
    settle(1);
  } else if (name === 'end') {
    // Bombsite: charge planted, beeping, last bot approaching.
    player.state.position.set(6, 0, -26);
    player.state.yaw = -0.5;
    player.state.pitch = 0.1;
    weapon.buy('sniper');
    weapon.state.scoped = false;
    weapon.state.grenades = { frag: 0, flash: 1, smoke: 0 };
    bots.reset(4);
    bots.bots[0].alive = false;
    bots.bots[0].group.visible = false;
    bots.bots[1].alive = false;
    bots.bots[1].group.visible = false;
    bots.bots[2].group.position.set(-8, 0, -33);
    bots.bots[2].yaw = 0.6;
    bots.bots[3].group.position.set(12, 0, -20);
    bots.bots[3].yaw = 2.4;
    bomb.state.carried = false;
    bomb.state.planted = true;
    bomb.state.timer = 12.4;
    bomb.state.position.set(0, 0.02, -30);
    bomb.mesh.position.copy(bomb.state.position);
    bomb.mesh.visible = true;
    hud.setTimerBomb(true);
    hud.setTimer(12.4);
    match.state.timer = 12.4;
    hud.setScore(3, 1);
    hud.feed('Charge armed — 0:12', true);
    settle(2);
  }

  syncHud();
  hud.setScore(match.state.scoreYou ?? hud.getMoney() * 0, hud_score_placeholder());
  hud.setTimerBomb(shot === 'end');
  hud.setTimer(shot === 'end' ? 12.4 : match.state.timer);
  hud.setMoney(match.state.money);
  paintTwiceThenReady();
}

function hud_score_placeholder() { return 0; }

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozenShot = true;
    }
  }
  requestAnimationFrame(paint);
}

let frozenShot = false;

// ---- Boot --------------------------------------------------------------------------------
// Debug/inspection hook (also used by the automated smoke test and shot staging).
window.__bp = { match, weapon, player, combat, bots, bomb, economy };

syncCamera(0.016);
syncHud();
if (shot) {
  runShot(shot);
} else {
  requestAnimationFrame(frame);
}
