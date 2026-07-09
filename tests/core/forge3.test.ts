import { describe, it, expect } from 'vitest';
import { forgeTier2, forgeTier3, tier3DefId, unmerge } from '../../src/core/forge';
import type { RawCard } from '../../src/core/types';

const raw = (id: string, colour: RawCard['colour'], value: number): RawCard => ({
  kind: 'raw', id, colour, value, marks: {},
});
const t2 = (id: string, colour: RawCard['colour']) =>
  forgeTier2([raw(`${id}a`, colour, 3), raw(`${id}b`, colour, 5)], id);

describe('tier-3 forging', () => {
  it('maps every element pair to its variation', () => {
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'blue'))).toBe('wind');     // air+air
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'red'))).toBe('smoke');     // air+fire
    expect(tier3DefId(t2('x', 'yellow'), t2('y', 'yellow'))).toBe('land'); // earth+earth
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'yellow'))).toBe('dust');   // air+earth
    expect(tier3DefId(t2('x', 'red'), t2('y', 'yellow'))).toBe('magma');   // earth+fire
    expect(tier3DefId(t2('x', 'green'), t2('y', 'yellow'))).toBe('tree');  // earth+water
    expect(tier3DefId(t2('x', 'red'), t2('y', 'red'))).toBe('volcano');    // fire+fire
    expect(tier3DefId(t2('x', 'green'), t2('y', 'green'))).toBe('lake');   // water+water
    expect(tier3DefId(t2('x', 'blue'), t2('y', 'green'))).toBe('rain');    // air+water
    expect(tier3DefId(t2('x', 'red'), t2('y', 'green'))).toBe('steam');    // fire+water
  });

  it('rejects tier-3 inputs', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'red');
    const v = forgeTier3(a, b, 'v1');
    expect(tier3DefId(v, t2('z', 'red'))).toBeNull();
  });

  it('forges with union colours and both constituents', () => {
    const card = forgeTier3(t2('x', 'red'), t2('y', 'green'), 'v1');
    expect(card).toMatchObject({ tier: 3, defId: 'steam' });
    expect(card.colours).toEqual(['green', 'red']);
    expect(card.constituents).toHaveLength(2);
  });

  it('unmerge burns exactly one chosen constituent', () => {
    const a = t2('x', 'red');
    const b = t2('y', 'green');
    const v = forgeTier3(a, b, 'v1');
    const { returned, burned } = unmerge(v, 'x');
    expect(burned.id).toBe('x');
    expect(returned.map((c) => c.id)).toEqual(['y']);
    expect(() => unmerge(v, 'nope')).toThrow();
  });
});
