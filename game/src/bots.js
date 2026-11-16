// Bots ("the copperline crew"): capsule bodies with head/legs hitboxes, patrol routes with
// waypoint holds, vision cones + hearing, reaction delays, burst fire with telegraphed tracers,
// simple strafing in fights, and grenade-aware scattering is out of scope for the bot brain but
// they do react to damage by turning toward the shooter.
import * as THREE from 'three';
import {
  BOT_MAX_HEALTH, BOT_ARMOR_MAX, BOT_VIEW_DISTANCE, BOT_FOV, BOT_REACTION_TIME,
  BOT_BURST, BOT_ACCURACY, BOT_TURN_SPEED, BOT_COMBAT_TURN, BOT_MOVE_SPEED, BOT_HEARING_RADIUS,
} from './config.js';
import { PALETTE } from './palette.js';

const UP = new THREE.Vector3(0, 1, 0);

export function createBots(scene, world) {
  const bots = [];
  const hitMeshes = [];
  const bodyGeo = new THREE.CapsuleGeometry(0.34, 0.9, 4, 10);
  const headGeo = new THREE.SphereGeometry(0.21, 12, 10);
  const legGeo = new THREE.BoxGeometry(0.42, 0.72, 0.36);
  const gunGeo = new THREE.BoxGeometry(0.09, 0.12, 0.62);
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.8 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.85 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.7 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x33383e, roughness: 0.9 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.5, metalness: 0.5 });

  // Patrol routes (waypoints in x,z) — chokepoints and holds around the pump plaza and lanes.
  const ROUTES = [
    [[0, -26], [0, -18], [-4, -10], [0, -18]],            // plaza anchor
    [[-18, -8], [-18, -18], [-8, -24], [-18, -18]],       // west lane push
    [[18, -6], [18, -18], [8, -24], [18, -18]],           // east lane push
    [[-6, 2], [6, 2], [6, 12], [-6, 12]],                 // warehouse mid cycle
  ];

  function spawn(bot, index) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.0;
    body.castShadow = true;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.4), vestMat);
    vest.position.y = 1.15;
    vest.castShadow = true;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.72;
    head.castShadow = true;
    const legs = new THREE.Mesh(legGeo, legMat);
    legs.position.y = 0.36;
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0.3, 1.25, -0.3);
    group.add(body, vest, head, legs, gun);
    scene.add(group);

    body.userData = { bot, part: 'chest' };
    vest.userData = { bot, part: 'chest' };
    head.userData = { bot, part: 'head' };
    legs.userData = { bot, part: 'legs' };
    hitMeshes.push(body, vest, head, legs);

    const route = ROUTES[index % ROUTES.length];
    bot.group = group;
    bot.head = head;
    bot.gun = gun;
    bot.route = route;
    bot.waypoint = 0;
    bot.health = BOT_MAX_HEALTH;
    bot.armor = BOT_ARMOR_MAX;
    bot.alive = true;
    bot.state = 'patrol';
    bot.seePlayer = false;
    bot.reactTimer = 0;
    bot.burstLeft = 0;
    bot.burstCooldown = 0;
    bot.shotCooldown = 0;
    bot.holdTimer = 0;
    bot.alertTimer = 0;
    bot.lastKnown = new THREE.Vector3();
    bot.eyeHeight = 1.72;
    bot.strafeDir = index % 2 === 0 ? 1 : -1;
    bot.strafeTimer = 0;
    bot.deathTimer = 0;
    bot.muzzle = new THREE.PointLight(PALETTE.muzzle, 0, 7, 2);
    group.add(bot.muzzle);
    bot.muzzle.position.set(0.3, 1.25, -0.7);
    place(bot, route[0][0], route[0][1]);
    bot.yaw = index % 2 === 0 ? Math.PI : 0;
  }

  function place(bot, x, z) {
    bot.group.position.set(x, 0, z);
  }

  function reset(roundIndex) {
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      bot.health = BOT_MAX_HEALTH;
      bot.armor = BOT_ARMOR_MAX;
      bot.alive = true;
      bot.state = 'patrol';
      bot.seePlayer = false;
      bot.reactTimer = 0;
      bot.burstLeft = 0;
      bot.burstCooldown = 0;
      bot.holdTimer = 0;
      bot.deathTimer = 0;
      bot.group.visible = true;
      bot.group.rotation.x = 0;
      const route = bot.route;
      bot.waypoint = 0;
      // Stagger spawn faces a little each round so bot positions vary but stay deterministic.
      const jitter = ((roundIndex * 13 + i * 7) % 10) - 5;
      place(bot, route[0][0] + jitter * 0.35, route[0][1] + ((roundIndex + i) % 5) - 2);
      bot.yaw = Math.atan2(-(-route[1][0] - bot.group.position.x), -(-route[1][1] - bot.group.position.z));
    }
  }

  function addBot(index) {
    const bot = { index };
    bots.push(bot);
    spawn(bot, index);
    return bot;
  }

  // Line of sight: ray from bot eye to target eye against world shootables (walls, crates).
  const losRay = new THREE.Raycaster();
  const losDir = new THREE.Vector3();
  function canSee(bot, targetPos, eyeY) {
    losDir.copy(targetPos).sub(bot.group.position);
    losDir.y = 0;
    const flat = losDir.length();
    if (flat > BOT_VIEW_DISTANCE) return false;
    losDir.set(targetPos.x - bot.group.position.x, targetPos.y - eyeY, targetPos.z - bot.group.position.z);
    const dist = losDir.length();
    losDir.divideScalar(dist || 1);
    // FOV cone check in the horizontal plane.
    const forwardX = -Math.sin(bot.yaw);
    const forwardZ = -Math.cos(bot.yaw);
    const flatLen = Math.hypot(losDir.x, losDir.z) || 1;
    const dot = (losDir.x * forwardX + losDir.z * forwardZ) / flatLen;
    if (dot < Math.cos(BOT_FOV)) return false;
    losRay.set(new THREE.Vector3(bot.group.position.x, eyeY, bot.group.position.z), losDir);
    losRay.far = dist;
    const hits = losRay.intersectObjects(world.shootables, false);
    return hits.length === 0 || hits[0].distance >= dist - 0.4;
  }

  function damage(bot, amount, part) {
    if (!bot.alive) return { killed: false, damage: 0 };
    const absorbed = Math.min(bot.armor, amount * 0.5);
    bot.armor -= absorbed;
    const dealt = amount - absorbed * 0.4;
    bot.health -= dealt;
    let killed = false;
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.deathTimer = 0.9;
      killed = true;
    }
    return { killed, damage: dealt };
  }

  function alertNear(position) {
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = bot.group.position.distanceTo(position);
      if (d < BOT_HEARING_RADIUS) {
        bot.alertTimer = 6;
        bot.lastKnown.copy(position);
        if (bot.state === 'patrol') bot.state = 'hunt';
      }
    }
  }

  // moveToward with axis-separated collider resolution (same scheme as the player).
  function moveBot(bot, dirX, dirZ, speed, dt) {
    const len = Math.hypot(dirX, dirZ) || 1;
    const vx = (dirX / len) * speed * dt;
    const vz = (dirZ / len) * speed * dt;
    const p = bot.group.position;
    if (!botBlocked(p.x + vx, p.z, bot)) p.x += vx;
    if (!botBlocked(p.x, p.z + vz, bot)) p.z += vz;
  }

  const bprobe = new THREE.Box3();
  function botBlocked(x, z, bot) {
    bprobe.min.set(x - 0.36, 0.1, z - 0.36);
    bprobe.max.set(x + 0.36, 1.5, z + 0.36);
    for (const c of world.colliders) {
      if (bprobe.intersectsBox(c)) return true;
    }
    return false;
  }

  return {
    bots, hitMeshes, addBot, reset, damage, alertNear, canSee, moveBot,
    allDead: () => bots.every((b) => !b.alive),
    aliveCount: () => bots.reduce((n, b) => n + (b.alive ? 1 : 0), 0),
    forEach: (fn) => { for (const b of bots) fn(b); },
  };
}

// Bot think + act, kept out of the factory so world/bots stay decoupled from the round logic.
export function botStep(bots, dt, player, world, hooks) {
  const playerEye = player.position.y + player.eye;
  const playerPos = new THREE.Vector3(player.position.x, playerEye, player.position.z);
  const eyePos = new THREE.Vector3();

  for (const bot of bots) {
    if (!bot.alive) {
      if (bot.deathTimer > 0) {
        bot.deathTimer -= dt;
        bot.group.rotation.x = Math.min(Math.PI / 2, bot.group.rotation.x + dt * 4);
        bot.group.position.y = Math.max(-0.4, bot.group.position.y - dt * 0.8);
        if (bot.deathTimer <= 0) bot.group.visible = false;
      }
      continue;
    }

    eyePos.set(bot.group.position.x, bot.group.position.y + bot.eyeHeight, bot.group.position.z);
    const wasSeeing = bot.seePlayer;
    bot.seePlayer = hooks.playerAlive && canSeeImpl(bot, playerPos, eyePos, world);
    if (bot.seePlayer && !wasSeeing && bot.reactTimer <= 0 && bot.state !== 'combat') {
      bot.reactTimer = BOT_REACTION_TIME[0] + Math.random() * (BOT_REACTION_TIME[1] - BOT_REACTION_TIME[0]);
    }
    if (bot.seePlayer) {
      bot.lastKnown.copy(player.position);
      bot.alertTimer = 6;
    } else if (bot.alertTimer > 0) {
      bot.alertTimer -= dt;
    }

    if (bot.reactTimer > 0) {
      bot.reactTimer -= dt;
      // While reacting the bot stops and turns toward the player.
      turnToward(bot, playerPos, BOT_COMBAT_TURN * dt);
      if (bot.reactTimer <= 0) {
        bot.state = 'combat';
        bot.burstLeft = BOT_BURST[0] + Math.floor(Math.random() * (BOT_BURST[1] - BOT_BURST[0] + 1));
      }
      continue;
    }

    if (bot.state === 'combat') {
      turnToward(bot, playerPos, BOT_COMBAT_TURN * dt);
      if (bot.seePlayer) {
        // strafe for cover feel
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.6 + Math.random() * 0.8;
          bot.strafeDir *= -1;
        }
        const rightX = Math.cos(bot.yaw);
        const rightZ = -Math.sin(bot.yaw);
        moveBotImpl(bots, bot, rightX * bot.strafeDir, rightZ * bot.strafeDir, BOT_MOVE_SPEED * 0.6, dt, world);
        // fire bursts
        bot.shotCooldown -= dt;
        if (bot.burstLeft > 0 && bot.shotCooldown <= 0) {
          hooks.botShoot(bot);
          bot.burstLeft -= 1;
          bot.shotCooldown = 0.13;
          if (bot.burstLeft === 0) {
            bot.burstCooldown = 0.5 + Math.random() * 0.7;
          }
        } else if (bot.burstLeft === 0) {
          bot.burstCooldown -= dt;
          if (bot.burstCooldown <= 0) {
            bot.burstLeft = BOT_BURST[0] + Math.floor(Math.random() * (BOT_BURST[1] - BOT_BURST[0] + 1));
          }
        }
      } else {
        // lost sight: push last known
        moveBotImpl(bots, bot, bot.lastKnown.x - bot.group.position.x, bot.lastKnown.z - bot.group.position.z, BOT_MOVE_SPEED, dt, world);
        if (bot.group.position.distanceToSquared(new THREE.Vector3(bot.lastKnown.x, 0, bot.lastKnown.z)) < 4) {
          bot.state = 'hunt';
        }
      }
      continue;
    }

    if (bot.state === 'hunt') {
      turnToward(bot, bot.lastKnown, BOT_TURN_SPEED * dt);
      moveBotImpl(bots, bot, bot.lastKnown.x - bot.group.position.x, bot.lastKnown.z - bot.group.position.z, BOT_MOVE_SPEED, dt, world);
      const flatDx = bot.lastKnown.x - bot.group.position.x;
      const flatDz = bot.lastKnown.z - bot.group.position.z;
      if (flatDx * flatDx + flatDz * flatDz < 1) {
        bot.state = 'patrol';
        bot.holdTimer = 1 + Math.random() * 2;
      }
      continue;
    }

    // patrol
    if (bot.holdTimer > 0) {
      bot.holdTimer -= dt;
      bot.yaw += Math.sin(bot.holdTimer * 2.2) * dt * 1.2; // scanning while holding
      continue;
    }
    const target = bot.route[bot.waypoint];
    const dx = target[0] - bot.group.position.x;
    const dz = target[1] - bot.group.position.z;
    if (dx * dx + dz * dz < 1.2) {
      bot.waypoint = (bot.waypoint + 1) % bot.route.length;
      bot.holdTimer = 0.8 + Math.random() * 2.4;
    } else {
      turnToward(bot, { x: target[0], z: target[1] }, BOT_TURN_SPEED * dt);
      moveBotImpl(bots, bot, dx, dz, BOT_MOVE_SPEED * 0.85, dt, world);
    }
  }
}

// canSee bound to a world (the factory returns canSee but the step needs a free one too).
const freeLosRay = new THREE.Raycaster();
const freeLosDir = new THREE.Vector3();
function canSeeImpl(bot, targetPos, eyePos, world) {
  const dx = targetPos.x - eyePos.x;
  const dy = targetPos.y - eyePos.y;
  const dz = targetPos.z - eyePos.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > BOT_VIEW_DISTANCE) return false;
  const flatLen = Math.hypot(dx, dz) || 1;
  const forwardX = -Math.sin(bot.yaw);
  const forwardZ = -Math.cos(bot.yaw);
  const dot = (dx / flatLen) * forwardX + (dz / flatLen) * forwardZ;
  if (dot < Math.cos(BOT_FOV)) return false;
  freeLosRay.set(eyePos, freeLosDir.set(dx / dist, dy / dist, dz / dist));
  freeLosRay.far = dist - 0.3;
  const hits = freeLosRay.intersectObjects(world.shootables, false);
  return hits.length === 0 || hits[0].distance >= dist - 0.4;
}

function turnToward(bot, target, maxStep) {
  const want = Math.atan2(-(target.x - bot.group.position.x), -(target.z - bot.group.position.z));
  let diff = want - bot.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.yaw += Math.max(-maxStep, Math.min(maxStep, diff));
}

function moveBotImpl(bots, bot, dirX, dirZ, speed, dt, world) {
  const len = Math.hypot(dirX, dirZ);
  if (len < 0.0001) return;
  const vx = (dirX / len) * speed * dt;
  const vz = (dirZ / len) * speed * dt;
  const p = bot.group.position;
  if (!botBlockedImpl(p.x + vx, p.z, world)) p.x += vx;
  if (!botBlockedImpl(p.x, p.z + vz, world)) p.z += vz;
}

const bprobe = new THREE.Box3();
function botBlockedImpl(x, z, world) {
  bprobe.min.set(x - 0.36, 0.1, z - 0.36);
  bprobe.max.set(x + 0.36, 1.5, z + 0.36);
  for (const c of world.colliders) {
    if (bprobe.intersectsBox(c)) return true;
  }
  return false;
}
