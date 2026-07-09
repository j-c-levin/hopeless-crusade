import { describe, it, expect } from 'vitest';
import { ELEMENTS, elementDef } from '../../src/content/elements';
import { PAIR_DEF } from '../../src/core/forge';

describe('element content', () => {
  it('defines all 12 tier-2 variants', () => {
    for (const el of ['fire', 'earth', 'air', 'water']) {
      for (const total of [7, 8, 9]) {
        const def = elementDef(`${el}-${total}`);
        expect(def.tier).toBe(2);
        expect(def.fuelCost).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('defines all 10 tier-3 variations named by the pair table', () => {
    for (const defId of Object.values(PAIR_DEF)) {
      expect(elementDef(defId).tier).toBe(3);
    }
  });

  it('throws on unknown ids', () => {
    expect(() => elementDef('mud-7')).toThrow();
  });

  it('fire deals damage, air draws, earth attaches, water combines', () => {
    expect(elementDef('fire-7').onActivate).toContainEqual({ op: 'damage', amount: 2 });
    expect(elementDef('air-7').onActivate).toContainEqual({ op: 'draw', amount: 1 });
    expect(elementDef('earth-7').onActivate).toContainEqual({ op: 'attach' });
    expect(elementDef('water-7').onCombineDamage).toBe(1);
  });
});
