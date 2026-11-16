// Rounds: freeze time, live play, round end, match end. First to 8 rounds wins
// the match (15 rounds max; 7-7 goes to a decider). The economy pays for wins,
// kills and plants, and a losing streak pays more, so a lost round is never a
// dead round. All of it is plain data; main.js renders it.
import { ECONOMY } from './weapons.js';
import { TEAM } from './palette.js';

export const ROUND = {
  FREEZE: 'freeze',
  LIVE: 'live',
  END: 'end',
  MATCH_END: 'match_end',
};

export const WIN_ROUNDS = 8;
export const MAX_ROUNDS = 15;
export const FREEZE_TIME = 7;
export const ROUND_TIME = 100;
export const END_TIME = 4.5;

export function createMatch() {
  return {
    phase: ROUND.FREEZE,
    phaseTime: FREEZE_TIME,
    round: 1,
    score: { viper: 0, sentinel: 0 },
    lossStreak: { viper: 0, sentinel: 0 },
    winner: null, // 'viper' | 'sentinel'
    winReason: null, // 'elimination' | 'bomb' | 'defuse' | 'time' | 'explosion'
    matchWinner: null,
    bombSite: 'A',
    roundKills: [],
  };
}

export function roundReward(match, team, won) {
  if (won) return ECONOMY.roundWin;
  const streak = match.lossStreak[team];
  return Math.min(ECONOMY.lossStreakMax, ECONOMY.roundLoss + streak * ECONOMY.lossStreakBonus);
}

// Close a round: score it, pay the teams, decide whether the match is over.
export function endRound(match, winner, reason) {
  match.winner = winner;
  match.winReason = reason;
  match.score[winner] += 1;
  const loser = winner === TEAM.VIPER ? TEAM.SENTINEL : TEAM.VIPER;
  match.lossStreak[winner] = 0;
  match.lossStreak[loser] += 1;
  match.phase = ROUND.END;
  match.phaseTime = END_TIME;
  if (match.score[winner] >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
    match.matchWinner = match.score.viper > match.score.sentinel
      ? TEAM.VIPER
      : (match.score.sentinel > match.score.viper ? TEAM.SENTINEL : winner);
  }
  return { winner, reason, winPay: ECONOMY.roundWin, lossPay: roundReward(match, loser, false) };
}

export function nextRound(match, rng) {
  match.round += 1;
  match.phase = ROUND.FREEZE;
  match.phaseTime = FREEZE_TIME;
  match.winner = null;
  match.winReason = null;
  match.bombSite = rng.chance(0.5) ? 'A' : 'B';
  match.roundKills = [];
  if (match.matchWinner) match.phase = ROUND.MATCH_END;
}

export function aliveCount(bots, player, team) {
  let n = 0;
  for (const b of bots) if (b.team === team && b.alive) n += 1;
  if (player.team === team && player.alive) n += 1;
  return n;
}

// A round ends by elimination the moment one team has nobody left.
export function checkElimination(match, bots, player) {
  if (match.phase !== ROUND.LIVE) return null;
  const v = aliveCount(bots, player, TEAM.VIPER);
  const s = aliveCount(bots, player, TEAM.SENTINEL);
  if (v === 0) return { winner: TEAM.SENTINEL, reason: 'elimination' };
  if (s === 0) return { winner: TEAM.VIPER, reason: 'elimination' };
  return null;
}
