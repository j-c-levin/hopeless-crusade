import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, combatCommand, endTurn, dealToEnemy, drawCards } from '../../src/core/combat';
import { forgeTier2 } from '../../src/core/forge';
import { strugglesFor, dealStruggleChoices } from '../../src/content/struggles';
import type { CombatState, RawCard, ForgedCard, GameEvent } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const fire8 = (id: string) => forgeTier2([raw(`${id}a`, 'red', 3), raw(`${id}b`, 'red', 5)], id);

const setup = (struggles: string[] = [], enemyHp = 10): CombatState => startCombat({
  deck: makeStartingDeck({ n: 1 }), hp: 20, handSize: 5,
  enemies: [{ suit: 'clubs', rank: 'tower', hp: enemyHp }],
  struggles, relics: [], rng: new Rng(1), idGen: { n: 1000 },
});

describe('struggle content', () => {
  it('has exactly three struggles per domain', () => {
    for (const domain of ['diamonds', 'hearts', 'clubs', 'spades'] as const) {
      expect(strugglesFor(domain)).toHaveLength(3);
    }
  });

  it('dealStruggleChoices deals pick+1 options when the domain has them', () => {
    const { options, pick } = dealStruggleChoices(new Rng(1), 'spades', 2);
    expect(options).toHaveLength(3);
    expect(pick).toBe(2);
    expect(new Set(options.map((o) => o.id)).size).toBe(3); // distinct
  });

  it('caps options at the domain size when pick+1 exceeds it', () => {
    const { options, pick } = dealStruggleChoices(new Rng(1), 'spades', 3);
    expect(options).toHaveLength(3);
    expect(pick).toBe(3);
  });
});

describe('struggle hooks', () => {
  it('rationing reduces the opening hand to 4', () => {
    const cs = setup(['rationing']);
    expect(cs.hand).toHaveLength(4);
    expect(cs.handSize).toBe(4);
  });

  it('siege gives a tower +1 power', () => {
    const cs = setup(['siege']);
    expect(cs.enemies[0]!.power).toBe(3); // tower base 2 + 1
  });

  it('empty-stores disables hail mary', () => {
    const cs = setup(['empty-stores']);
    cs.hand = [raw('a', 'red', 1), raw('b', 'blue', 1), raw('c', 'green', 1)];
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'hailMary', cardIds: ['a', 'b', 'c'], targetEnemyId: cs.enemies[0]!.id }))
      .toThrow(/empty.stores/);
  });

  it('cold-grip halves block gained (round down) from a yellow scrap', () => {
    const cs = setup(['cold-grip']);
    cs.hand = [raw('y', 'yellow', 2)];
    combatCommand(cs, new Rng(2), { n: 2000 }, { type: 'scrap', cardId: 'y' });
    expect(cs.block).toBe(0); // Math.floor(1/2)
  });

  it('cold-grip halves block gained from a block atom', () => {
    const cs = setup(['cold-grip']);
    const earth9 = forgeTier2([raw('ea', 'yellow', 4), raw('eb', 'yellow', 5)], 'earth9');
    cs.hand = [earth9, raw('y1', 'yellow', 1), raw('y2', 'yellow', 1)];
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'earth9', fuelIds: ['y1', 'y2'], targetEnemyId: cs.enemies[0]!.id });
    expect(cs.block).toBe(1); // earth-9 grants 2 block, halved to 1
  });

  it('fevered surcharges +1 any-colour fuel on the first activation each round only', () => {
    const cs = setup(['fevered']);
    cs.hand = [fire8('f'), fire8('g'), raw('r1', 'red', 2), raw('x1', 'blue', 2), raw('r2', 'red', 2)];
    const t = cs.enemies[0]!.id;
    // normal 1-fuel activation fails: fevered demands 2 for the first activation this round
    expect(() => combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1'], targetEnemyId: t })).toThrow(/fuel/);
    // 2 fuel (1 matching + 1 any-colour surplus) succeeds
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'f', fuelIds: ['r1', 'x1'], targetEnemyId: t });
    expect(cs.activatedThisRound).toContain('f');
    // second activation this round is back to normal cost (no surcharge)
    combatCommand(cs, new Rng(2), { n: 2000 },
      { type: 'activate', cardId: 'g', fuelIds: ['r2'], targetEnemyId: t });
    expect(cs.activatedThisRound).toContain('g');
  });

  it('contagion plagues a random forged card in the deck at combat start', () => {
    const deck = [...makeStartingDeck({ n: 1 }), fire8('cf')];
    const cs = startCombat({
      deck, hp: 20, handSize: 5,
      enemies: [{ suit: 'clubs', rank: 'tower', hp: 10 }],
      struggles: ['contagion'], relics: [], rng: new Rng(1), idGen: { n: 1000 },
    });
    const forged = [...cs.hand, ...cs.drawPile, ...cs.discardPile]
      .find((c) => c.kind === 'forged') as ForgedCard | undefined;
    expect(forged).toBeDefined();
    expect(forged!.marks.plagued).toBe(1);
  });

  it('quarantine locks a random element each round', () => {
    const cs = setup(['quarantine']);
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.lockedElements).toHaveLength(1);
  });

  it('tithe discards the cheapest raw at the start of each round', () => {
    const cs = setup(['tithe']);
    cs.hand = [raw('cheap', 'red', 1), raw('rich', 'red', 9)];
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.hand.find((c) => c.id === 'cheap')).toBeUndefined();
    expect(cs.discardPile.some((c) => c.id === 'cheap')).toBe(true);
  });

  it('tithe costs 1 hp at the start of the round when the hand has no raws', () => {
    const cs = setup(['tithe']);
    cs.hand = [fire8('fc')];
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events); // enemy power 2 + tithe 1
    expect(cs.hp).toBe(17);
  });

  it('crossfire deals 1 recoil to the player when an enemy dies', () => {
    const cs = setup(['crossfire'], 1);
    const events: GameEvent[] = [];
    dealToEnemy(cs, cs.enemies[0]!.id, 1, events);
    expect(cs.hp).toBe(19);
  });

  it('attrition discards a random card from hand at the end of each round', () => {
    const cs = setup(['attrition']);
    cs.hand = [raw('a', 'red', 1), raw('b', 'blue', 2), raw('c', 'green', 3)];
    const idsBefore = cs.hand.map((c) => c.id);
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    const discarded = idsBefore.filter((id) => !cs.hand.some((c) => c.id === id));
    expect(discarded).toHaveLength(1);
    expect(cs.discardPile.some((c) => discarded.includes(c.id))).toBe(true);
  });

  it('creeping-end dooms a random hand card every 3rd round', () => {
    const cs = setup(['creeping-end']);
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(2), { n: 2000 }, events); // round 1 -> 2, no effect
    expect(cs.hand.every((c) => c.marks.doomed === undefined)).toBe(true);
    endTurn(cs, new Rng(3), { n: 3000 }, events); // round 2 -> 3, effect fires
    expect(cs.hand.some((c) => c.marks.doomed === 1)).toBe(true);
  });

  it('toll exiles the top card of the new draw pile on reshuffle', () => {
    const cs = setup(['toll']);
    cs.discardPile = cs.drawPile.splice(0, 60);
    cs.drawPile = [];
    const events: GameEvent[] = [];
    drawCards(cs, new Rng(3), { n: 3000 }, 2, events);
    expect(cs.hand).toHaveLength(7);
    expect(cs.drawPile.length + cs.discardPile.length).toBe(57); // 58 normally, 1 exiled
  });
});
