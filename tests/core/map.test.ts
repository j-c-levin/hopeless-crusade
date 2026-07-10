import { describe, it, expect } from 'vitest';
import { Rng } from '../../src/core/rng';
import { newCampaign, nodesInColumn, enemySpecsFor, advance, onLevelCleared } from '../../src/core/map';

describe('campaign map', () => {
  it('deals a domain order ending in spades', () => {
    const map = newCampaign(new Rng(1));
    expect(map.domainOrder).toHaveLength(4);
    expect(map.domainOrder[3]).toBe('spades');
    expect(new Set(map.domainOrder).size).toBe(4);
  });

  it('level template: 1/2/2/2/1/1 nodes, boss is the domain ace', () => {
    const map = newCampaign(new Rng(2));
    const counts = [0, 1, 2, 3, 4, 5].map((c) => nodesInColumn(map.current, c).length);
    expect(counts).toEqual([1, 2, 2, 2, 1, 1]);
    const boss = nodesInColumn(map.current, 5)[0]!;
    expect(boss.cards).toEqual([{ suit: map.current.domain, rank: 14 }]);
    expect(enemySpecsFor(boss)).toEqual([{ suit: map.current.domain, rank: 'manifestation', hp: 14 }]);
  });

  it('med-hard and hard columns hold two enemy cards', () => {
    const map = newCampaign(new Rng(3));
    for (const node of nodesInColumn(map.current, 3)) expect(node.cards).toHaveLength(2);
    expect(nodesInColumn(map.current, 4)[0]!.cards).toHaveLength(2);
  });

  it('clearing a level removes the domain; four cleared levels win', () => {
    const map = newCampaign(new Rng(4));
    const first = map.current.domain;
    expect(onLevelCleared(map, new Rng(5))).toBe('nextLevel');
    expect(map.defeated).toEqual([first]);
    expect(map.current.domain).toBe(map.domainOrder[1]);
    onLevelCleared(map, new Rng(5));
    onLevelCleared(map, new Rng(5));
    expect(onLevelCleared(map, new Rng(5))).toBe('victory');
  });

  it('advance only moves to the next column', () => {
    const map = newCampaign(new Rng(6));
    const start = nodesInColumn(map.current, 0)[0]!;
    advance(map, start.id);
    expect(map.position).toBe(0);
    const far = nodesInColumn(map.current, 3)[0]!;
    expect(() => advance(map, far.id)).toThrow();
  });
});
