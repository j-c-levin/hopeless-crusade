import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand, drawCards } from '../../src/core/combat';
import { makeCorruptionCard } from '../../src/core/corruption';
import type { CombatState, GameEvent } from '../../src/core/types';

const setup = (suit: 'diamonds' | 'hearts' | 'clubs' | 'spades', rank: 'tower' | 'stronghold' = 'tower'): CombatState =>
  startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit, rank, hp: 8 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });

const drawCorruption = (cs: CombatState, suit: 'diamonds' | 'hearts' | 'clubs' | 'spades',
  rank: 'tower' | 'stronghold' | 'fortress' | 'manifestation') => {
  const events: GameEvent[] = [];
  cs.drawPile.push(makeCorruptionCard({ n: 9000 }, suit, rank));
  drawCards(cs, new Rng(5), { n: 9100 }, 1, events);
  return events;
};

describe('corruption triggers', () => {
  it('famine tower sets a pay-or-discard choice; paying discards the cheapest raw', () => {
    const cs = setup('diamonds');
    const handBefore = cs.hand.length;
    drawCorruption(cs, 'diamonds', 'tower');
    expect(cs.pendingChoice).toBeDefined();
    combatCommand(cs, new Rng(6), { n: 9200 }, { type: 'resolveChoice', optionId: 'pay' });
    expect(cs.pendingChoice).toBeUndefined();
    expect(cs.hand.length).toBe(handBefore - 1); // one raw paid away
  });

  it('disease stronghold plagues a hand card', () => {
    const cs = setup('hearts');
    drawCorruption(cs, 'hearts', 'stronghold');
    expect(cs.hand.some((c) => c.marks.plagued === 1)).toBe(true);
  });

  it('death stronghold dooms a hand card and exiles blind from the draw pile', () => {
    const cs = setup('spades');
    const drawBefore = cs.drawPile.length + 1; // +1 for the corruption card we add
    drawCorruption(cs, 'spades', 'stronghold');
    expect(cs.hand.some((c) => c.marks.doomed === 1)).toBe(true);
    expect(cs.drawPile.length).toBe(drawBefore - 2); // corruption drawn + one exiled
  });

  it('the corruption card lands in the discard pile, not the hand', () => {
    const cs = setup('clubs');
    drawCorruption(cs, 'clubs', 'tower');
    expect(cs.hand.every((c) => c.kind !== 'corruption')).toBe(true);
    expect(cs.discardPile.some((c) => c.kind === 'corruption')).toBe(true);
  });
});
