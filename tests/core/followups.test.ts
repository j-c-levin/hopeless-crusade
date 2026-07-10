import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand, endTurn } from '../../src/core/combat';
import { forgeTier2, forgeTier3 } from '../../src/core/forge';
import type { CombatState, RawCard, GameEvent } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const t2 = (id: string, colour: RawCard['colour']) =>
  forgeTier2([raw(`${id}a`, colour, 3), raw(`${id}b`, colour, 5)], id);
const setup = (hp = 20): CombatState => {
  const cs = startCombat({
    deck: makeStartingDeck({ n: 1 }), hp, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'stronghold', hp: 20 }],
    struggles: [], relics: [], rng: new Rng(1), idGen: { n: 1000 },
  });
  cs.hand = [];
  return cs;
};

describe('followups', () => {
  it('volcano erupts at end of round with 2+ charges', () => {
    const cs = setup();
    const volcano = forgeTier3(t2('v1', 'red'), t2('v2', 'red'), 'vol');
    cs.hand = [volcano, raw('r1', 'red', 1), raw('r2', 'red', 1)];
    cs.charges['volcano'] = 2; // pretend two prior activations
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.enemies[0]!.hp).toBe(15); // 3 + 2 = 5 into the only enemy
    expect(cs.charges['volcano'] ?? 0).toBe(0);
  });

  it('duststorm deflects per the table', () => {
    const cs = setup();
    cs.charges['dust'] = 2; // table [0,2,3,...] → deflect 3
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.hp).toBe(20 - Math.max(0, 4 - 3)); // stronghold power 4 − deflect 3
  });

  it('ocean grants a free decombine on the 2nd lake activation', () => {
    const cs = setup();
    const lakeA = forgeTier3(t2('l1', 'green'), t2('l2', 'green'), 'lakeA');
    const lakeB = forgeTier3(t2('l3', 'green'), t2('l4', 'green'), 'lakeB');
    const fire = t2('ff', 'red');
    cs.hand = [lakeA, lakeB, fire,
      raw('g1', 'green', 1), raw('g2', 'green', 1), raw('g3', 'green', 1), raw('g4', 'green', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'lakeA', fuelIds: ['g1', 'g2'],
        decombineTargetId: 'ff', burnConstituentId: 'ffa' });
    expect(cs.freeDecombines).toBe(0);
    const lakeC = forgeTier3(t2('l5', 'green'), t2('l6', 'green'), 'lakeC');
    cs.hand.push(lakeC, raw('g5', 'green', 1), raw('g6', 'green', 1));
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'lakeB', fuelIds: ['g5', 'g6'],
        decombineTargetId: 'lakeC', burnConstituentId: 'l5' });
    expect(cs.freeDecombines).toBe(1);
  });
});
