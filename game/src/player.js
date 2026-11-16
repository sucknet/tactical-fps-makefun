// Player movement: acceleration, friction, gravity, crouch, jump, view bob and recoil recovery,
// resolved as a box against the world's axis-aligned colliders one axis at a time.
import * as THREE from 'three';
import {
  PLAYER_RADIUS, STAND_HEIGHT, CROUCH_HEIGHT, STAND_EYE, CROUCH_EYE,
  WALK_SPEED, CROUCH_SPEED, GROUND_ACCEL, AIR_ACCEL, FRICTION, GRAVITY, JUMP_SPEED,
} from './config.js';

export function createPlayer(colliders) {
  const player = {
    position: new THREE.Vector3(0, 0, 34),
    velocity: new THREE.Vector3(),
    yaw: Math.PI,             // facing north (toward the site) at spawn
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    bobPhase: 0,
    bobAmount: 0,
    landImpact: 0,
  };
  const probe = new THREE.Box3();

  function overlaps(x, y, z, height, lift) {
    probe.min.set(x - PLAYER_RADIUS, y + lift, z - PLAYER_RADIUS);
    probe.max.set(x + PLAYER_RADIUS, y + height - lift, z + PLAYER_RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  function look(dx, dy, sensitivity) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys, wantCrouch) {
    const crouching = wantCrouch || keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      player.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching &&
      !overlaps(player.position.x, player.position.y, player.position.z, STAND_HEIGHT, 0.02)) {
      player.crouching = false;
      player.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wishX = -sin * forward + cos * strafe;
      wishZ = -cos * forward - sin * strafe;
      const len = Math.hypot(wishX, wishZ) || 1;
      wishX /= len;
      wishZ /= len;
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (player.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    player.velocity.x += (wishX * speed - player.velocity.x) * blend;
    player.velocity.z += (wishZ * speed - player.velocity.z) * blend;
    if (player.onGround && !forward && !strafe) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      player.velocity.x *= damp;
      player.velocity.z *= damp;
    }

    if (keys.has('Space') && player.onGround) {
      player.velocity.y = JUMP_SPEED;
      player.onGround = false;
    }
    player.velocity.y -= GRAVITY * dt;

    const wasAir = !player.onGround;
    const nextX = player.position.x + player.velocity.x * dt;
    if (!overlaps(nextX, player.position.y, player.position.z, player.height, 0.04)) player.position.x = nextX;
    else player.velocity.x = 0;
    const nextZ = player.position.z + player.velocity.z * dt;
    if (!overlaps(player.position.x, player.position.y, nextZ, player.height, 0.04)) player.position.z = nextZ;
    else player.velocity.z = 0;

    player.position.y += player.velocity.y * dt;
    const prevVy = player.velocity.y;
    player.onGround = false;
    const hit = overlaps(player.position.x, player.position.y, player.position.z, player.height, 0);
    if (hit && player.velocity.y <= 0) {
      player.position.y = hit.max.y;
      player.velocity.y = 0;
      player.onGround = true;
      if (wasAir && prevVy < -7) player.landImpact = Math.min(1, -prevVy / 16);
    } else if (hit) {
      player.position.y = hit.min.y - player.height;
      player.velocity.y = 0;
    }
    if (player.position.y < 0) {
      player.position.y = 0;
      player.velocity.y = 0;
      player.onGround = true;
      if (wasAir && prevVy < -7) player.landImpact = Math.min(1, -prevVy / 16);
    }
    player.velocity.y = Math.max(-30, player.velocity.y);

    // View bob accumulates with horizontal speed; view code turns it into camera motion.
    const hSpeed = Math.hypot(player.velocity.x, player.velocity.z);
    if (player.onGround && hSpeed > 0.5) {
      player.bobPhase += dt * hSpeed * 1.9;
      player.bobAmount = Math.min(1, player.bobAmount + dt * 6);
    } else {
      player.bobAmount = Math.max(0, player.bobAmount - dt * 8);
    }
    player.landImpact = Math.max(0, player.landImpact - dt * 3.2);
  }

  return {
    state: player,
    step,
    look,
    recoil,
    groundSpeed: () => Math.hypot(player.velocity.x, player.velocity.z),
  };
}
