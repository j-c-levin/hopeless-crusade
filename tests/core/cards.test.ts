import { describe, it, expect } from 'vitest';
import { makeStartingDeck, nextId, removeCard } from '../../src/core/cards';
import type { Colour } from '../../src/core/types';

describe('starting deck', () => {
  it('has 76 raws with standard Uno duplication', () => {
    const deck = makeStartingDeck({ n: 1 });
    expect(deck).toHaveLength(76);
    const colours: Colour[] = ['red', 'yellow', 'blue', 'green'];
    for (const colour of colours) {
      const ofColour = deck.filter((c) => c.colour === colour);
      expect(ofColour).toHaveLength(19); // one 0, two each of 1–9
      expect(ofColour.filter((c) => c.value === 0)).toHaveLength(1);
      for (let v = 1; v <= 9; v++) {
        expect(ofColour.filter((c) => c.value === v)).toHaveLength(2);
      }
    }
  });

  it('gives every card a unique id and empty marks', () => {
    const deck = makeStartingDeck({ n: 1 });
    expect(new Set(deck.map((c) => c.id)).size).toBe(76);
    expect(deck.every((c) => c.kind === 'raw' && Object.keys(c.marks).length === 0)).toBe(true);
  });

  it('removeCard splices and returns', () => {
    const deck = makeStartingDeck({ n: 1 });
    const target = deck[10]!;
    const got = removeCard(deck, target.id);
    expect(got.id).toBe(target.id);
    expect(deck).toHaveLength(75);
    expect(() => removeCard(deck, 'nope')).toThrow();
  });

  it('nextId increments the serializable counter', () => {
    const gen = { n: 5 };
    expect(nextId(gen, 'c')).toBe('c5');
    expect(nextId(gen, 'c')).toBe('c6');
    expect(gen.n).toBe(7);
  });
});
