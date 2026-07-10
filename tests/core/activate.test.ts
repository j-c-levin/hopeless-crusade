import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand } from '../../src/core/combat';
import { forgeTier2 } from '../../src/core/forge';
import type { CombatState, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const fire8 = (id: string) => forgeTier2([raw(`${id}a`, 'red', 3), raw(`${id}b`, 'red', 5)], id);
const setup = (): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 10 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = [];
  return cs;
};

describe('activation', () => {
  it('pays strict-colour fuel and runs the damage atom', () => {
    const cs = setup();
    cs.hand = [fire8('f'), raw('r1', 'red', 2)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.hp).toBe(7); // fire-8 deals 3
    expect(cs.hand.map((c) => c.id)).toEqual(['f']); // fuel discarded, card stays
    expect(cs.activatedThisRound).toContain('f');
  });

  it('rejects wrong-colour fuel, wrong fuel count, double activation', () => {
    const cs = setup();
    cs.hand = [fire8('f'), raw('b1', 'blue', 2), raw('r1', 'red', 2), raw('r2', 'red', 3)];
    const t = cs.enemies[0]!.id;
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['b1'], targetEnemyId: t })).toThrow(/fuel/);
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1', 'r2'], targetEnemyId: t })).toThrow(/fuel/);
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1'], targetEnemyId: t });
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r2'], targetEnemyId: t })).toThrow(/already/);
  });

  it('air draws with onDrawDamage; earth attaches; locked elements refuse', () => {
    const cs = setup();
    const air7 = forgeTier2([raw('xa', 'blue', 3), raw('xb', 'blue', 4)], 'air');
    const earth7 = forgeTier2([raw('ya', 'yellow', 3), raw('yb', 'yellow', 4)], 'earth');
    cs.hand = [air7, earth7, raw('b1', 'blue', 1), raw('y1', 'yellow', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'activate', cardId: 'air', fuelIds: ['b1'] });
    expect(cs.enemies[0]!.hp).toBe(9); // drew 1 → onDrawDamage 1
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'earth', fuelIds: ['y1'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.enemies[0]!.attachments).toHaveLength(1);
    expect(cs.hand.find((c) => c.id === 'earth')).toBeUndefined(); // moved to attached zone
    cs.lockedElements = ['air'];
    cs.activatedThisRound = [];
    cs.hand.push(raw('b2', 'blue', 1));
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'air', fuelIds: ['b2'] })).toThrow(/locked/);
  });

  it('water-9 freeMerge grants a green-less merge', () => {
    const cs = setup();
    const water9 = forgeTier2([raw('wa', 'green', 4), raw('wb', 'green', 5)], 'w9');
    cs.hand = [water9, raw('g1', 'green', 1), raw('g2', 'green', 1),
      raw('r1', 'red', 3), raw('r2', 'red', 5)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'activate', cardId: 'w9', fuelIds: ['g1', 'g2'] });
    expect(cs.freeMerges).toBe(1);
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: '', mergeCardIds: ['r1', 'r2'] });
    expect(cs.hand.some((c) => c.kind === 'forged' && c.defId === 'fire-8')).toBe(true);
    expect(cs.freeMerges).toBe(0);
  });
});
