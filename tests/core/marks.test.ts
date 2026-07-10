import { describe, it, expect } from 'vitest';
import { addMark, escalateOnDraw, scarAdjust, plagueTouch, isScrapBlocked } from '../../src/core/marks';
import { forgeTier2 } from '../../src/core/forge';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat } from '../../src/core/combat';
import type { GameEvent, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const setup = () => startCombat({
  deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
  enemies: [{ suit: 'hearts', rank: 'tower', hp: 5 }],
  struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
});

describe('marks', () => {
  it('plague at 3 decombines in place, constituents plagued', () => {
    const cs = setup();
    const card = forgeTier2([raw('a', 'red', 3), raw('b', 'red', 5)], 'f');
    card.marks.plagued = 2;
    const events: GameEvent[] = [];
    const fate = escalateOnDraw(cs, card, events);
    expect(fate).toBe('decombined');
    const back = cs.hand.filter((c) => ['a', 'b'].includes(c.id));
    expect(back).toHaveLength(2);
    expect(back.every((c) => c.marks.plagued === 1)).toBe(true);
  });

  it('doom at 3 destroys', () => {
    const cs = setup();
    const card = raw('x', 'blue', 4);
    card.marks.doomed = 2;
    const events: GameEvent[] = [];
    expect(escalateOnDraw(cs, card, events)).toBe('destroyed');
    expect(cs.hand.find((c) => c.id === 'x')).toBeUndefined();
  });

  it('scar reduces numbers and blocks raw scrapping', () => {
    const card = raw('x', 'red', 4);
    expect(scarAdjust(card, 3)).toBe(3);
    addMark(card, 'scarred', []);
    expect(scarAdjust(card, 3)).toBe(2);
    expect(scarAdjust(card, 0)).toBe(0);
    expect(isScrapBlocked(card)).toBe(true);
  });

  it('plague contagion spreads through merges and aura', () => {
    const clean = forgeTier2([raw('a', 'red', 3), raw('b', 'red', 5)], 'f1');
    plagueTouch(clean, clean.constituents, false);
    expect(clean.marks.plagued).toBeUndefined();
    const sick = raw('c', 'red', 3);
    sick.marks.plagued = 1;
    const infected = forgeTier2([sick, raw('d', 'red', 5)], 'f2');
    plagueTouch(infected, infected.constituents, false);
    expect(infected.marks.plagued).toBe(1);
    const aura = forgeTier2([raw('e', 'red', 3), raw('g', 'red', 5)], 'f3');
    plagueTouch(aura, aura.constituents, true);
    expect(aura.marks.plagued).toBe(1);
  });
});
