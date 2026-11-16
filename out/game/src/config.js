// Simulation constants for BREACHPOINT. One source of truth for every module.
// Tuned so that stopping to aim pays: firing while moving or airborne blooms spread hard.

// Simulation
export const FIXED_STEP = 1 / 60;
export const MAX_STEPS_PER_FRAME = 5;

// Match structure
export const ROUNDS_TO_WIN = 4;          // first to 4 rounds wins the match
export const ROUND_TIME = 75;            // seconds of combat per round
export const BOMB_TIME = 30;             // seconds to plant or defuse once armed
export const BOMB_DEFUSE_PROGRESS = 5;   // seconds of holding E to defuse
export const BOMB_PLANT_PROGRESS = 3.2;  // seconds of holding E to plant
export const FREEZE_TIME = 3;            // seconds before a round in which you cannot move
export const ROUND_END_PAUSE = 4;        // seconds a round banner stays before the next round

// Economy (own currency: "credits", symbol cr)
export const START_MONEY = 800;
export const MAX_MONEY = 9000;
export const LOSS_STREAK_BONUS = [1400, 1900, 2400, 2900]; // hard-cap to avoid runaway snowball
export const WIN_BONUS = 3000;
export const PLANT_BONUS = 800;
export const KILL_REWARD = 300;

// Player movement
export const PLAYER_RADIUS = 0.35;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.14;
export const STAND_EYE = 1.62;
export const CROUCH_EYE = 1.06;
export const WALK_SPEED = 5.4;
export const CROUCH_SPEED = 2.45;
export const GROUND_ACCEL = 60;
export const AIR_ACCEL = 16;
export const FRICTION = 10;
export const GRAVITY = 21;
export const JUMP_SPEED = 6.4;

// View
export const LOOK_SENSITIVITY = 0.0021;
export const FOV = 75;
export const CROUCH_FOV_DELTA = 4;

// Player health
export const PLAYER_MAX_HEALTH = 100;
export const PLAYER_ARMOR_MAX = 100;

// Arsenal. Damage falloff over range, headshot multiplier per weapon.
export const WEAPONS = {
  pistol: {
    id: 'pistol',
    name: 'P9 Sidearm',
    slot: 2,
    price: 0,
    mag: 12,
    reserve: 48,
    rpm: 300,
    damage: 26,
    falloffStart: 18,
    falloffEnd: 42,
    minDamageMult: 0.55,
    headMult: 3.2,
    legMult: 0.75,
    reloadTime: 1.6,
    spreadBase: 0.004,
    spreadMove: 0.028,
    spreadJump: 0.05,
    recoilPitch: 0.014,
    recoilYaw: 0.005,
    auto: false,
    tracer: 0xffd27a,
    viewColor: 0x3a4048,
    viewLength: 0.5,
    killAward: 300,
  },
  smg: {
    id: 'smg',
    name: 'VK-9 Vector',
    slot: 1,
    price: 1600,
    mag: 30,
    reserve: 90,
    rpm: 820,
    damage: 22,
    falloffStart: 14,
    falloffEnd: 38,
    minDamageMult: 0.5,
    headMult: 2.6,
    legMult: 0.8,
    reloadTime: 2.0,
    spreadBase: 0.008,
    spreadMove: 0.03,
    spreadJump: 0.06,
    recoilPitch: 0.008,
    recoilYaw: 0.006,
    auto: true,
    tracer: 0xffe08a,
    viewColor: 0x2e3338,
    viewLength: 0.62,
    killAward: 600,
  },
  rifle: {
    id: 'rifle',
    name: 'AR-77 Ranger',
    slot: 1,
    price: 2700,
    mag: 30,
    reserve: 90,
    rpm: 620,
    damage: 33,
    falloffStart: 26,
    falloffEnd: 60,
    minDamageMult: 0.72,
    headMult: 3.4,
    legMult: 0.8,
    reloadTime: 2.3,
    spreadBase: 0.0025,
    spreadMove: 0.05,
    spreadJump: 0.09,
    recoilPitch: 0.011,
    recoilYaw: 0.005,
    auto: true,
    tracer: 0xffc861,
    viewColor: 0x3d4a3a,
    viewLength: 0.78,
    killAward: 300,
  },
  sniper: {
    id: 'sniper',
    name: 'LRX Longbow',
    slot: 1,
    price: 4200,
    mag: 5,
    reserve: 20,
    rpm: 48,
    damage: 115,
    falloffStart: 70,
    falloffEnd: 120,
    minDamageMult: 0.9,
    headMult: 2.2,
    legMult: 0.6,
    reloadTime: 3.0,
    spreadBase: 0.0004,
    spreadMove: 0.09,
    spreadJump: 0.12,
    recoilPitch: 0.028,
    recoilYaw: 0.004,
    auto: false,
    scoped: true,
    scopeFov: 22,
    tracer: 0xcfe8ff,
    viewColor: 0x35424e,
    viewLength: 0.92,
    killAward: 100,
  },
};

// Grenades
export const GRENADES = {
  frag: {
    id: 'frag',
    name: 'F1 Fragment',
    price: 300,
    radius: 6.5,
    damage: 98,
    fuse: 1.7,
    color: 0x4a5340,
  },
  flash: {
    id: 'flash',
    name: 'M8 Flash',
    price: 200,
    radius: 9,
    blindSeconds: 2.6,
    fuse: 1.2,
    color: 0xd8d4c8,
  },
  smoke: {
    id: 'smoke',
    name: 'V-5 Smoke',
    price: 250,
    radius: 5.5,
    duration: 13,
    fuse: 1.4,
    color: 0x8a9196,
  },
};

// Bots
export const BOT_COUNT = 4;             // defenders per round (player + 0 teammates attacks)
export const BOT_MAX_HEALTH = 100;
export const BOT_ARMOR_MAX = 50;
export const BOT_VIEW_DISTANCE = 34;
export const BOT_FOV = 1.35;            // radians half-angle of bot cone of vision
export const BOT_REACTION_TIME = [0.28, 0.55]; // seconds, min/max, scaled by difficulty
export const BOT_BURST = [2, 4];        // rounds per trigger pull
export const BOT_ACCURACY = 0.62;       // base chance a burst round lands in cover-free LOS
export const BOT_TURN_SPEED = 6.0;      // rad/s while patrolling or hunting
export const BOT_COMBAT_TURN = 9.5;     // rad/s while engaging
export const BOT_MOVE_SPEED = 3.4;
export const BOT_HEARING_RADIUS = 13;   // gunshot alerts bots within this range

// Audio
export const MASTER_VOLUME = 0.5;
