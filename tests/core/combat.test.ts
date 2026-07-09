import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { makeStartingDeck } from '../../src/core/cards';
import { startCombat, endTurn, dealToEnemy, drawCards } from '../../src/core/combat';
import type { ForgedCard, GameEvent } from '../../src/core/types';

const setup = (enemyHp = 5) =>
  startCombat({
    deck: makeStartingDeck({ n: 1 }),
    hp: 20, handSize: 5,
    enemies: [{ suit: 'clubs', rank: 'tower', hp: enemyHp }],
    struggles: [], relics: [],
    rng: new Rng(1), idGen: { n: 1000 },
  });

describe('combat skeleton', () => {
  it('deals an opening hand and sets enemy power from config', () => {
    const cs = setup();
    expect(cs.hand).toHaveLength(5);
    expect(cs.drawPile).toHaveLength(71);
    expect(cs.enemies[0]!.power).toBe(2); // tower
    expect(cs.outcome).toBe('ongoing');
  });

  it('enemies strike at end of turn; block absorbs first', () => {
    const cs = setup();
    const events: GameEvent[] = [];
    cs.block = 1;
    endTurn(cs, new Rng(2), { n: 2000 }, events);
    expect(cs.hp).toBe(19); // power 2 - block 1
    expect(cs.block).toBe(0); // reset for new round
    expect(cs.round).toBe(2);
    expect(cs.hand).toHaveLength(5); // drew back up
  });

  it('killing all enemies wins; hp 0 loses', () => {
    const cs = setup(3);
    const events: GameEvent[] = [];
    dealToEnemy(cs, cs.enemies[0]!.id, 3, events);
    expect(cs.outcome).toBe('won');

    const cs2 = setup();
    cs2.hp = 1;
    endTurn(cs2, new Rng(2), { n: 2000 }, events);
    expect(cs2.outcome).toBe('lost');
  });

  it('clock loss cannot overwrite a fight won during the same endTurn', () => {
    const cs = setup(1); // single enemy at 1 hp
    cs.clock = 1; // famine clock about to expire this turn
    // Give the enemy a retaliating attachment so retaliation kills it during endTurn.
    const card: ForgedCard = {
      kind: 'forged', id: 'f-att', tier: 2, defId: 'earth-7',
      colours: ['yellow'], constituents: [], marks: {},
    };
    cs.attachedCards.push(card);
    cs.enemies[0]!.attachments.push({ cardId: card.id, defId: 'earth-7' });
    const events: GameEvent[] = [];
    endTurn(cs, new Rng(4), { n: 4000 }, events);
    expect(cs.enemies[0]!.hp).toBeLessThanOrEqual(0);
    expect(cs.outcome).toBe('won'); // win takes precedence over the clock hitting 0
  });

  it('reshuffles discard into draw pile when empty', () => {
    const cs = setup();
    cs.discardPile = cs.drawPile.splice(0, 60);
    cs.drawPile = [];
    const events: GameEvent[] = [];
    drawCards(cs, new Rng(3), { n: 3000 }, 2, events);
    expect(cs.hand).toHaveLength(7);
    expect(cs.drawPile.length + cs.discardPile.length).toBe(58);
  });
});
