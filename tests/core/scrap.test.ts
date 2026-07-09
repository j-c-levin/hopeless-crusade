import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand } from '../../src/core/combat';
import type { CombatState, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const setup = (): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 8 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = []; // tests place hands explicitly
  return cs;
};

describe('scrap and hail mary', () => {
  it('red scraps for 1 damage, yellow for block, blue draws', () => {
    const cs = setup();
    cs.hand = [raw('r', 'red', 4), raw('y', 'yellow', 2), raw('b', 'blue', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'r', targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'y' });
    expect(cs.block).toBe(1);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'b' });
    expect(cs.hand).toHaveLength(1); // b left, one drawn
    expect(cs.discardPile.map((c) => c.id)).toEqual(expect.arrayContaining(['r', 'y', 'b']));
  });

  it('green scraps into a merge; the forged card lands in hand', () => {
    const cs = setup();
    cs.hand = [raw('g', 'green', 1), raw('a', 'red', 3), raw('b', 'red', 5)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'g', mergeCardIds: ['a', 'b'] });
    const forged = cs.hand.find((c) => c.kind === 'forged');
    expect(forged).toMatchObject({ defId: 'fire-8' });
    expect(cs.hand).toHaveLength(1);
  });

  it('scrapping is illegal when sealed, on forged cards, or with wrong merges', () => {
    const cs = setup();
    cs.hand = [raw('r', 'red', 4), raw('a', 'red', 2), raw('b', 'blue', 5)];
    cs.scrapSealed = true;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'scrap', cardId: 'r', targetEnemyId: cs.enemies[0]!.id })).toThrow(/sealed/);
    cs.scrapSealed = false;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'scrap', cardId: 'nope' })).toThrow();
  });

  it('hail mary burns three raws for 1 damage — permanently', () => {
    const cs = setup();
    cs.hand = [raw('a', 'red', 1), raw('b', 'blue', 1), raw('c', 'green', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'hailMary', cardIds: ['a', 'b', 'c'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7);
    expect(cs.hand).toHaveLength(0);
    expect(cs.discardPile.find((c) => ['a', 'b', 'c'].includes(c.id))).toBeUndefined(); // burned, not discarded
  });
});
