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

  it('death fortress "suffer" dooms two distinct cards', () => {
    const cs = setup('spades');
    // Shrink the hand to exactly 2 non-corruption cards: both MUST end doomed once each.
    cs.drawPile.push(...cs.hand.splice(2));
    drawCorruption(cs, 'spades', 'fortress');
    expect(cs.pendingChoice).toBeDefined();
    combatCommand(cs, new Rng(7), { n: 9300 }, { type: 'resolveChoice', optionId: 'suffer' });
    expect(cs.hand).toHaveLength(2);
    expect(cs.hand.every((c) => c.marks.doomed === 1)).toBe(true); // no double-doom on one card
    expect(cs.hp).toBe(16);
  });

  it('the corruption card lands in the discard pile, not the hand', () => {
    const cs = setup('clubs');
    drawCorruption(cs, 'clubs', 'tower');
    expect(cs.hand.every((c) => c.kind !== 'corruption')).toBe(true);
    expect(cs.discardPile.some((c) => c.kind === 'corruption')).toBe(true);
  });
});

describe('stacked corruption draws (multi-card batches must not drop a choice)', () => {
  it('drawing two choice-corruptions in one batch queues the second instead of losing it', () => {
    const cs = setup('diamonds');
    const idGen = { n: 9000 };
    // Stack two diamonds-tower (pay-or-suffer) corruptions on top of the draw pile.
    // pop() reads from the end, so the last-pushed card is drawn first.
    cs.drawPile.push(makeCorruptionCard(idGen, 'diamonds', 'tower')); // drawn second
    cs.drawPile.push(makeCorruptionCard(idGen, 'diamonds', 'tower')); // drawn first
    const pileBefore = cs.drawPile.length;
    const events: GameEvent[] = [];

    drawCards(cs, new Rng(5), idGen, 2, events);

    // First corruption's choice must survive, and the second draw must be queued rather
    // than silently consumed/dropped.
    expect(cs.pendingChoice).toBeDefined();
    expect(cs.pendingDraws).toBe(1);
    expect(cs.drawPile.length).toBe(pileBefore - 1); // only the first corruption was drawn

    combatCommand(cs, new Rng(6), idGen, { type: 'resolveChoice', optionId: 'pay' });

    // Resolving the first choice must resume the batch and hit the second corruption's
    // trigger — its own choice must appear, proving it wasn't dropped.
    expect(cs.pendingChoice).toBeDefined();
    expect(cs.pendingDraws).toBe(0);
    expect(cs.drawPile.length).toBe(pileBefore - 2);

    combatCommand(cs, new Rng(7), idGen, { type: 'resolveChoice', optionId: 'pay' });
    expect(cs.pendingChoice).toBeUndefined();
    expect(cs.pendingDraws).toBe(0);
  });

  it('escalation on a doomed card still fires when it is drawn after a resumed batch', () => {
    const cs = setup('diamonds');
    const idGen = { n: 9500 };
    const doomed = cs.hand.pop()!;
    doomed.marks.doomed = 2; // one more escalation destroys it
    cs.drawPile.push(doomed); // drawn third
    cs.drawPile.push(makeCorruptionCard(idGen, 'diamonds', 'tower')); // drawn second
    cs.drawPile.push(makeCorruptionCard(idGen, 'diamonds', 'tower')); // drawn first
    const events: GameEvent[] = [];

    drawCards(cs, new Rng(5), idGen, 3, events);
    expect(cs.pendingChoice).toBeDefined();
    expect(cs.pendingDraws).toBe(2);

    combatCommand(cs, new Rng(6), idGen, { type: 'resolveChoice', optionId: 'pay' });
    expect(cs.pendingChoice).toBeDefined(); // second corruption's own choice
    expect(cs.pendingDraws).toBe(1);

    // Resolving the second choice resumes the batch onto the doomed card queued behind it.
    const finalEvents = combatCommand(cs, new Rng(7), idGen, { type: 'resolveChoice', optionId: 'pay' });
    expect(cs.pendingChoice).toBeUndefined();
    expect(cs.pendingDraws).toBe(0);
    // The doomed card escalated to destruction on draw — it must not have entered the hand
    // or discard/draw piles; it is simply gone.
    expect(cs.hand.some((c) => c.id === doomed.id)).toBe(false);
    expect(finalEvents.some((e) => e.type === 'destroyed' && e.data?.cardId === doomed.id)).toBe(true);
  });
});
