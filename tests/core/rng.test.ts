import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('resumes from serialized state', () => {
    const a = new Rng(7);
    a.next();
    const b = new Rng(a.state);
    expect(b.next()).toBe(a.next());
  });

  it('int stays in range', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) {
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
    }
  });

  it('shuffle is a permutation and does not mutate input', () => {
    const r = new Rng(3);
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = r.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });
});
