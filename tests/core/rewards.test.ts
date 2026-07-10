import { describe, it, expect } from 'vitest';
import { computeRewards } from '../../src/core/rewards';
import { relicDef } from '../../src/content/relics';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand } from '../../src/core/combat';
import { forgeTier2 } from '../../src/core/forge';
import type { CombatState, RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const fire7 = (id: string) => forgeTier2([raw(`${id}a`, 'red', 3), raw(`${id}b`, 'red', 4)], id);

describe('computeRewards', () => {
  it('sums points per rank and returns one suit choice per defeated enemy', () => {
    const rewards = computeRewards([
      { suit: 'clubs', rank: 'tower', hp: 0 },
      { suit: 'diamonds', rank: 'fortress', hp: 0 },
    ]);
    expect(rewards.points).toBe(4); // 1 (tower) + 3 (fortress)
    expect(rewards.suitChoices).toEqual(['clubs', 'diamonds']);
  });
});

describe('relicDef', () => {
  it('throws on an unknown relic id', () => {
    expect(() => relicDef('nonexistent')).toThrow();
  });

  it('resolves every one of the eight defined relics', () => {
    const ids = [
      'kindling', 'emberheart', 'tailwind', 'kestrel',
      'bulwark', 'roots', 'springwell', 'tidal-charm',
    ];
    for (const id of ids) expect(relicDef(id).id).toBe(id);
  });
});

describe('relic hooks', () => {
  const setup = (relics: string[], hp = 20): CombatState => {
    const cs = startCombat({
      deck: makeStartingDeck({ n: 1 }), hp, handSize: 5,
      enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 20 }],
      struggles: [], relics, rng: new Rng(1), idGen: { n: 1000 },
    });
    cs.hand = [];
    return cs;
  };

  it('kindling deals 2 extra to the living enemy on the round\'s 2nd fire-line activation', () => {
    const cs = setup(['kindling']);
    const f1 = fire7('f1');
    const f2 = fire7('f2');
    cs.hand = [f1, f2, raw('r1', 'red', 1), raw('r2', 'red', 1)];
    const t = cs.enemies[0]!.id;
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f1', fuelIds: ['r1'], targetEnemyId: t });
    expect(cs.enemies[0]!.hp).toBe(18); // fire-7's own 2 damage only (1st fire activation)
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f2', fuelIds: ['r2'], targetEnemyId: t });
    expect(cs.enemies[0]!.hp).toBe(14); // fire-7's own 2 + kindling's 2 on the 2nd
  });

  it('kestrel draws 1 extra card on the round-1 opening draw', () => {
    const cs = startCombat({
      deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
      enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 20 }],
      struggles: [], relics: ['kestrel'], rng: new Rng(1), idGen: { n: 1000 },
    });
    expect(cs.hand).toHaveLength(6);
  });

  it('emberheart makes the first fire-line activation each fight free, then costs normal fuel', () => {
    const cs = setup(['emberheart']);
    const f1 = fire7('f1');
    const f2 = fire7('f2');
    cs.hand = [f1, f2, raw('r1', 'red', 1)];
    const t = cs.enemies[0]!.id;
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f1', fuelIds: [], targetEnemyId: t }); // no fuel needed
    expect(cs.enemies[0]!.hp).toBe(18);
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f2', fuelIds: [], targetEnemyId: t })).toThrow(/fuel/);
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f2', fuelIds: ['r1'], targetEnemyId: t }); // normal cost now
    expect(cs.enemies[0]!.hp).toBe(16);
  });
});
