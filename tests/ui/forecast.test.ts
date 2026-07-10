import { describe, it, expect } from 'vitest';
import { forecast } from '../../src/ui/forecast';
import { makeStartingDeck } from '../../src/core/cards';
import type { IdGen } from '../../src/core/cards';
import type { Card, ForgedCard, RawCard } from '../../src/core/types';

function raw(id: string, colour: RawCard['colour'], value: number): RawCard {
  return { kind: 'raw', id, colour, value, marks: {} };
}

function forged(id: string, tier: 2 | 3, defId: string, colours: RawCard['colour'][]): ForgedCard {
  return { kind: 'forged', id, tier, defId, colours, constituents: [], marks: {} };
}

const ALL_TIER2 = ['fire-7', 'fire-8', 'fire-9', 'earth-7', 'earth-8', 'earth-9',
  'air-7', 'air-8', 'air-9', 'water-7', 'water-8', 'water-9'];
const ALL_TIER3 = ['wind', 'smoke', 'land', 'dust', 'magma', 'tree', 'volcano', 'lake', 'rain', 'steam'];

function reachableMap(entries: { defId: string; reachable: boolean }[]): Record<string, boolean> {
  return Object.fromEntries(entries.map((e) => [e.defId, e.reachable]));
}

describe('forecast (pure)', () => {
  it('marks every tier-2 and tier-3 variant reachable on a fresh 76-raw starting deck', () => {
    const idGen: IdGen = { n: 0 };
    const deck: Card[] = makeStartingDeck(idGen);
    expect(deck.length).toBe(76);

    const f = forecast(deck);
    expect(f.tier2.map((e) => e.defId).sort()).toEqual([...ALL_TIER2].sort());
    expect(f.tier3.map((e) => e.defId).sort()).toEqual([...ALL_TIER3].sort());
    for (const e of f.tier2) expect(e.reachable).toBe(true);
    for (const e of f.tier3) expect(e.reachable).toBe(true);
  });

  it('removing every red card makes all fire tier-2s and fire-touching tier-3s unreachable, but wind stays reachable', () => {
    const idGen: IdGen = { n: 0 };
    const deck: Card[] = makeStartingDeck(idGen).filter((c) => !(c.kind === 'raw' && c.colour === 'red'));

    const f = forecast(deck);
    const t2 = reachableMap(f.tier2);
    const t3 = reachableMap(f.tier3);

    expect(t2['fire-7']).toBe(false);
    expect(t2['fire-8']).toBe(false);
    expect(t2['fire-9']).toBe(false);
    expect(t3['volcano']).toBe(false); // fire+fire
    expect(t3['smoke']).toBe(false);   // air+fire
    expect(t3['magma']).toBe(false);   // earth+fire
    expect(t3['steam']).toBe(false);   // fire+water
    expect(t3['wind']).toBe(true);     // air+air — unaffected by red removal
  });

  it('a proposedMergeIds that consumes the last red raws produces a warning mentioning "red"', () => {
    // A tiny deck: exactly one red raw of value 7 (forgeable to fire-7), plus one already-forged
    // card that needs red fuel to activate. Merging away the red-7 leaves 0 red raws while a
    // forged card still needs red fuel.
    const deck: Card[] = [
      raw('r1', 'red', 7),
      forged('f1', 2, 'earth-7', ['red']), // colours include red so it "needs red fuel" per our model
    ];

    const f = forecast(deck, ['r1']);
    expect(f.warnings.some((w) => w.toLowerCase().includes('red'))).toBe(true);
  });

  it('a proposedMergeIds that breaks tier-2/tier-3 reachability reports it in warnings', () => {
    const idGen: IdGen = { n: 0 };
    const deck: Card[] = makeStartingDeck(idGen);
    const redRaws = deck.filter((c) => c.kind === 'raw' && c.colour === 'red') as RawCard[];
    // Consuming every red raw should break every fire-* tier-2 and every fire-touching tier-3.
    // Warnings use the friendly display labels ("Fire 7", "Volcano"), not raw defId slugs.
    const f = forecast(deck, redRaws.map((c) => c.id));
    expect(f.warnings.some((w) => w.includes('Fire 7'))).toBe(true);
    expect(f.warnings.some((w) => w.includes('Volcano'))).toBe(true);
  });

  it('computes fuel counts correctly on a hand-built deck', () => {
    const deck: Card[] = [
      raw('r1', 'red', 3),
      raw('r2', 'red', 4),
      raw('y1', 'yellow', 5),
      forged('f1', 2, 'fire-7', ['red']),
      forged('f2', 3, 'magma', ['red', 'yellow']),
      forged('f3', 2, 'air-7', ['blue']),
    ];

    const f = forecast(deck);
    const byColour = Object.fromEntries(f.fuel.map((row) => [row.colour, row]));

    expect(byColour.red).toEqual({ colour: 'red', raws: 2, forgedNeedingIt: 2 });
    expect(byColour.yellow).toEqual({ colour: 'yellow', raws: 1, forgedNeedingIt: 1 });
    expect(byColour.blue).toEqual({ colour: 'blue', raws: 0, forgedNeedingIt: 1 });
    expect(byColour.green).toEqual({ colour: 'green', raws: 0, forgedNeedingIt: 0 });
  });

  it('a same-element tier-3 pair (wind) needs two air capacity: one forged air + one reachable-from-raws air is enough', () => {
    const deck: Card[] = [
      forged('f1', 2, 'air-7', ['blue']),
      raw('b1', 'blue', 7),
      raw('b2', 'blue', 8),
    ];
    const f = forecast(deck);
    expect(reachableMap(f.tier3)['wind']).toBe(true);
  });

  it('a same-element tier-3 pair (wind) is unreachable with only one air source', () => {
    const deck: Card[] = [
      forged('f1', 2, 'air-7', ['blue']),
    ];
    const f = forecast(deck);
    expect(reachableMap(f.tier3)['wind']).toBe(false);
  });

  it('wind from raws alone needs TWO disjoint blue subsets: one blue 7 is not enough, two are', () => {
    // Zero forged tier-2s: capacity comes entirely from the disjoint-subset-sum DP over raws.
    // A single blue 7 can forge one air tier-2, but wind needs two airs — unreachable.
    const oneBlue: Card[] = [raw('b1', 'blue', 7)];
    expect(reachableMap(forecast(oneBlue).tier3)['wind']).toBe(false);

    // A second blue 7 makes two disjoint subsets, each summing to a valid total — reachable.
    const twoBlue: Card[] = [raw('b1', 'blue', 7), raw('b2', 'blue', 7)];
    expect(reachableMap(forecast(twoBlue).tier3)['wind']).toBe(true);
  });
});
