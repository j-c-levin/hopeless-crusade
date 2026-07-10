import { CONFIG } from '../content/config';
import type { EnemySpec, MarkType, Suit } from './types';

export interface PendingRewards {
  points: number;
  suitChoices: Suit[];   // one entry per defeated enemy
}

// Spec §7: reward points per defeated enemy from CONFIG.rewardPoints (keyed by rank),
// plus one suit "choice slot" per defeated enemy card. Which command a slot resolves to
// (heal / burnCard / cleanse / scoutToken / rerollToken / widenToken / tutor / handSize / skip)
// is decided by the player and applied against RunState — that's Task 17's job.
export function computeRewards(defeated: EnemySpec[]): PendingRewards {
  const points = defeated.reduce((sum, e) => sum + (CONFIG.rewardPoints[e.rank] ?? 0), 0);
  const suitChoices = defeated.map((e) => e.suit);
  return { points, suitChoices };
}

// Suit → command menu (spec §7):
//   hearts  -> heal
//   spades  -> burnCard | cleanse
//   diamonds -> scoutToken | rerollToken | widenToken | tutor
//   clubs   -> handSize
// `skip` is always available regardless of suit.
export type RewardCommand =
  | { type: 'heal' }
  | { type: 'burnCard'; cardId: string }
  | { type: 'cleanse'; cardId: string; mark: MarkType }
  | { type: 'scoutToken' }
  | { type: 'rerollToken' }
  | { type: 'widenToken' }
  | { type: 'tutor'; cardId: string }
  | { type: 'handSize' }
  | { type: 'skip' };
