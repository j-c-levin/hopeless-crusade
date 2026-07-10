import { describe, it, expect } from 'vitest';
import { openWindow, windowMerge, windowReroll, windowUnmerge } from '../../src/core/forgewindow';
import { forgeTier2, forgeTier3 } from '../../src/core/forge';
import { Rng } from '../../src/core/rng';
import type { Card, CorruptionCard, ForgedCard, GameEvent, RawCard } from '../../src/core/types';
import type { IdGen } from '../../src/core/cards';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const corruption = (id: string): CorruptionCard => ({
  kind: 'corruption', id, suit: 'spades', rank: 'tower', marks: {},
});
const t2 = (id: string, colour: RawCard['colour']): ForgedCard =>
  forgeTier2([raw(`${id}a`, colour, 3), raw(`${id}b`, colour, 5)], id);

function bigDeck(): Card[] {
  const deck: Card[] = [];
  for (let i = 0; i < 10; i++) deck.push(raw(`r${i}`, 'red', 3));
  for (let i = 0; i < 5; i++) deck.push(corruption(`x${i}`));
  return deck;
}

describe('openWindow', () => {
  it('respects requested size when enough eligible cards exist', () => {
    const deck = bigDeck();
    const win = openWindow(deck, new Rng(1), 7, 2);
    expect(win.slotIds).toHaveLength(7);
    expect(win.rerollsLeft).toBe(2);
    // every slot references a real deck card
    for (const id of win.slotIds) expect(deck.some((c) => c.id === id)).toBe(true);
  });

  it('respects widened size (forgeWindowSize + widenAmount)', () => {
    const deck = bigDeck();
    const size = 7 + 2; // CONFIG.forgeWindowSize + 1 widen token * CONFIG.windowWidenAmount
    const win = openWindow(deck, new Rng(1), size, 0);
    expect(win.slotIds).toHaveLength(9);
  });

  it('deals what exists when the deck has fewer eligible cards than size', () => {
    const deck: Card[] = [raw('a', 'red', 3), corruption('b')];
    const win = openWindow(deck, new Rng(1), 7, 0);
    expect(win.slotIds).toHaveLength(2);
  });

  it('never puts forged cards into slots', () => {
    const deck: Card[] = [raw('a', 'red', 3), t2('fx', 'blue')];
    const win = openWindow(deck, new Rng(1), 7, 0);
    expect(win.slotIds).not.toContain('fx');
  });

  it('corruption cards can land in slots', () => {
    // deck of only corruption + 1 raw; with size covering all, corruption must appear
    const deck: Card[] = [raw('a', 'red', 3), corruption('b'), corruption('c')];
    const win = openWindow(deck, new Rng(1), 3, 0);
    expect(win.slotIds.sort()).toEqual(['a', 'b', 'c']);
  });
});

describe('windowMerge', () => {
  it('rejects corruption cards even if they are in a slot', () => {
    const deck: Card[] = [corruption('b')];
    const win = { slotIds: ['b'], rerollsLeft: 1 };
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    expect(() => windowMerge(deck, win, idGen, ['b'], events)).toThrow(/corruption|illegal/);
  });

  it('rejects a raw that is not currently in the window', () => {
    const deck: Card[] = [raw('a', 'red', 3), raw('b', 'red', 5)];
    const win = { slotIds: ['a'], rerollsLeft: 1 }; // 'b' not dealt
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    expect(() => windowMerge(deck, win, idGen, ['a', 'b'], events)).toThrow(/illegal/);
  });

  it('a tier-2 merge consumes window raws from the deck, shrinks slots, and adds the forged card', () => {
    const deck: Card[] = [raw('a', 'red', 3), raw('b', 'red', 5), raw('c', 'yellow', 4)];
    const win = { slotIds: ['a', 'b', 'c'], rerollsLeft: 1 };
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    const forged = windowMerge(deck, win, idGen, ['a', 'b'], events);
    expect(forged.kind).toBe('forged');
    expect(forged.defId).toBe('fire-8');
    expect(deck).toHaveLength(2); // 3 - 2 constituents + 1 forged
    expect(deck.find((c) => c.id === 'a')).toBeUndefined();
    expect(deck.find((c) => c.id === 'b')).toBeUndefined();
    expect(deck.some((c) => c.id === forged.id)).toBe(true);
    expect(win.slotIds).toEqual(['c']); // shrinks by n (2), leaves the untouched slot
    expect(events.some((e) => e.type === 'merge')).toBe(true);
  });

  it('applies plagueTouch to the forged result when a constituent is plagued', () => {
    const plaguedRaw: RawCard = { kind: 'raw', id: 'p', colour: 'red', value: 3, marks: { plagued: 1 } };
    const deck: Card[] = [plaguedRaw, raw('q', 'red', 5)];
    const win = { slotIds: ['p', 'q'], rerollsLeft: 1 };
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    const forged = windowMerge(deck, win, idGen, ['p', 'q'], events);
    expect(forged.marks.plagued).toBe(1);
  });

  it('tier-3 merge works with two forged cards that are not window slots', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'red');
    const deck: Card[] = [a, b, raw('z', 'blue', 3)];
    const win = { slotIds: ['z'], rerollsLeft: 0 }; // neither forged card is a slot
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    const forged = windowMerge(deck, win, idGen, ['x', 'y'], events);
    expect(forged.tier).toBe(3);
    expect(forged.defId).toBe('volcano');
    expect(deck).toHaveLength(2); // 3 - 2 constituents + 1 forged
    expect(win.slotIds).toEqual(['z']); // untouched — the merged cards weren't slots
  });

  it('rejects an illegal combination without mutating the deck or window', () => {
    const deck: Card[] = [raw('a', 'red', 3), raw('b', 'blue', 3)];
    const win = { slotIds: ['a', 'b'], rerollsLeft: 1 };
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    expect(() => windowMerge(deck, win, idGen, ['a', 'b'], events)).toThrow(/illegal/);
    expect(deck).toHaveLength(2);
    expect(win.slotIds).toEqual(['a', 'b']);
    expect(events).toHaveLength(0);
  });
});

describe('windowReroll', () => {
  it('redeals only the current slots (same count) and decrements rerollsLeft', () => {
    const deck = bigDeck();
    const win = openWindow(deck, new Rng(1), 7, 2);
    const before = [...win.slotIds];
    windowReroll(deck, win, new Rng(42));
    expect(win.slotIds).toHaveLength(before.length);
    expect(win.rerollsLeft).toBe(1);
    // nothing left the deck
    expect(deck).toHaveLength(15);
  });

  it('includes the previous slot cards in the redeal pool (deck untouched by reroll)', () => {
    const deck: Card[] = [raw('a', 'red', 0), raw('b', 'red', 0)];
    const win = { slotIds: ['a'], rerollsLeft: 1 };
    windowReroll(deck, win, new Rng(7));
    expect(win.slotIds).toHaveLength(1);
    expect(['a', 'b']).toContain(win.slotIds[0]);
    expect(deck).toHaveLength(2);
  });

  it('throws when rerollsLeft is 0', () => {
    const deck = bigDeck();
    const win = { slotIds: ['r0'], rerollsLeft: 0 };
    expect(() => windowReroll(deck, win, new Rng(1))).toThrow();
  });
});

describe('windowUnmerge', () => {
  it('returns constituents minus the burned one to the deck, and removes the forged card', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'green');
    const forged3 = forgeTier3(a, b, 'v1');
    const deck: Card[] = [forged3];
    const idGen: IdGen = { n: 0 };
    const events: GameEvent[] = [];
    windowUnmerge(deck, idGen, forged3.id, 'x', events);
    expect(deck.find((c) => c.id === forged3.id)).toBeUndefined();
    expect(deck.find((c) => c.id === 'x')).toBeUndefined(); // burned
    expect(deck.find((c) => c.id === 'y')).toBeDefined(); // returned
    expect(events.some((e) => e.type === 'decombine')).toBe(true);
  });

  it('throws if the card is not forged, or not in the deck', () => {
    const deck: Card[] = [raw('a', 'red', 3)];
    const idGen: IdGen = { n: 0 };
    expect(() => windowUnmerge(deck, idGen, 'a', 'a', [])).toThrow();
    expect(() => windowUnmerge(deck, idGen, 'nope', 'a', [])).toThrow();
  });
});
