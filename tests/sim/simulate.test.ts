import { describe, it, expect } from 'vitest';
import { simulateOne, simulate } from '../../src/sim/simulate';

describe('simulateOne', () => {
  it('runs seed 1 to completion without throwing and reports a valid outcome', () => {
    const result = simulateOne(1);
    expect(['victory', 'defeat', 'stall']).toContain(result.outcome);
    expect(result.levelReached).toBeGreaterThanOrEqual(0);
    expect(result.deckSize).toBeGreaterThan(0);
    expect(result.commands).toBeGreaterThan(0);
  });

  it('never issues more commands than the supplied cap', () => {
    const result = simulateOne(2, 50);
    expect(result.commands).toBeLessThanOrEqual(50);
  });

  it('is deterministic for a fixed seed', () => {
    const a = simulateOne(3);
    const b = simulateOne(3);
    expect(a).toEqual(b);
  });

  it('never throws across a spread of seeds', () => {
    for (let seed = 1; seed <= 15; seed++) {
      expect(() => simulateOne(seed)).not.toThrow();
    }
  });
});

describe('simulate', () => {
  it('aggregates 5 runs deterministically when called twice with the same base seed', () => {
    const a = simulate(5, 1);
    const b = simulate(5, 1);
    expect(a).toEqual(b);
  });

  it('reports a coherent stats shape, including a stalls count', () => {
    const stats = simulate(5, 1);
    expect(stats.runs).toBe(5);
    expect(stats.wins).toBeGreaterThanOrEqual(0);
    expect(stats.wins).toBeLessThanOrEqual(5);
    expect(stats.winRate).toBeCloseTo(stats.wins / 5);
    expect(typeof stats.stalls).toBe('number');
    expect(stats.stalls).toBeGreaterThanOrEqual(0);
    expect(stats.avgLevelReached).toBeGreaterThanOrEqual(0);
    expect(stats.avgFinalDeckSize).toBeGreaterThan(0);
  });
});
