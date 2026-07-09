import { describe, it, expect } from 'vitest';
import { tier2Target, forgeTier2 } from '../../src/core/forge';
import type { RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});

describe('tier-2 forging', () => {
  it('accepts one-colour sums of 7, 8, 9', () => {
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'red', 5)])).toEqual({ colour: 'red', total: 8 });
    expect(tier2Target([raw('a', 'blue', 7)])).toEqual({ colour: 'blue', total: 7 });
    expect(tier2Target([raw('a', 'green', 2), raw('b', 'green', 3), raw('c', 'green', 4)]))
      .toEqual({ colour: 'green', total: 9 });
  });

  it('rejects wrong sums, mixed colours, empty, non-raws', () => {
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'red', 3)])).toBeNull();       // 6
    expect(tier2Target([raw('a', 'red', 5), raw('b', 'red', 5)])).toBeNull();       // 10
    expect(tier2Target([raw('a', 'red', 3), raw('b', 'blue', 5)])).toBeNull();      // mixed
    expect(tier2Target([])).toBeNull();
  });

  it('forges a tier-2 card with the right defId and constituents', () => {
    const parts = [raw('a', 'yellow', 4), raw('b', 'yellow', 5)];
    const card = forgeTier2(parts, 'f1');
    expect(card).toMatchObject({
      kind: 'forged', tier: 2, id: 'f1', defId: 'earth-9', colours: ['yellow'],
    });
    expect(card.constituents.map((c) => c.id)).toEqual(['a', 'b']);
    expect(() => forgeTier2([raw('x', 'red', 2)], 'f2')).toThrow();
  });
});
