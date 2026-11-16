// Round/economy state machine: FREEZE -> LIVE -> (END: win/lose reason) -> BUY -> next round.
// Match is first to ROUNDS_TO_WIN. All state lives in this one object; main.js reads it.
import {
  ROUNDS_TO_WIN, ROUND_TIME, FREEZE_TIME, ROUND_END_PAUSE,
  START_MONEY, MAX_MONEY, LOSS_STREAK_BONUS, WIN_BONUS, PLANT_BONUS, KILL_REWARD,
} from './config.js';

export const PHASE = {
  FREEZE: 'freeze',
  LIVE: 'live',
  END: 'end',
  MATCH_END: 'match_end',
};

export function createMatch() {
  const state = {
    phase: PHASE.FREEZE,
    round: 1,
    timer: FREEZE_TIME,
    scoreYou: 0,
    scoreEnemy: 0,
    money: START_MONEY,
    lossStreak: 0,
    endReason: '',
    plantRewardGiven: false,
    buyUsedThisRound: false,
    kills: 0,
    deaths: 0,
  };

  function startRound() {
    state.phase = PHASE.FREEZE;
    state.timer = FREEZE_TIME;
    state.endReason = '';
    state.plantRewardGiven = false;
    state.buyUsedThisRound = false;
  }

  function goLive() {
    state.phase = PHASE.LIVE;
    state.timer = ROUND_TIME;
  }

  // reason: 'elimination' | 'time' | 'bomb' | 'defuse' | 'player_dead'
  function endRound(youWin, reason) {
    if (state.phase !== PHASE.LIVE) return;
    state.phase = PHASE.END;
    state.timer = ROUND_END_PAUSE;
    state.endReason = reason;
    if (youWin) {
      state.scoreYou += 1;
      state.lossStreak = 0;
      state.money += WIN_BONUS;
    } else {
      state.scoreEnemy += 1;
      const bonus = LOSS_STREAK_BONUS[Math.min(state.lossStreak, LOSS_STREAK_BONUS.length - 1)];
      state.money += bonus;
      state.lossStreak += 1;
    }
    state.money = Math.min(MAX_MONEY, state.money);
  }

  function addMoney(v) {
    state.money = Math.min(MAX_MONEY, state.money + v);
  }

  function spend(v) {
    if (state.money < v) return false;
    state.money -= v;
    return true;
  }

  function step(dt) {
    if (state.phase === PHASE.FREEZE) {
      state.timer -= dt;
      if (state.timer <= 0) goLive();
    } else if (state.phase === PHASE.LIVE) {
      state.timer -= dt;
      if (state.timer <= 0) endRound(false, 'time');
    } else if (state.phase === PHASE.END) {
      state.timer -= dt;
    }
  }

  function matchOver() {
    return state.scoreYou >= ROUNDS_TO_WIN || state.scoreEnemy >= ROUNDS_TO_WIN;
  }

  return { state, startRound, goLive, endRound, step, matchOver, addMoney, spend };
}
