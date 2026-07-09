export type Atom =
  | { op: 'damage'; amount: number }            // needs targetEnemyId
  | { op: 'draw'; amount: number }
  | { op: 'block'; amount: number }
  | { op: 'attach' }                            // attach this card to targetEnemyId
  | { op: 'decombine' }                         // needs decombineTargetId (+ burnId unless waived)
  | { op: 'discard'; amount: number }           // needs discardIds chosen by player
  | { op: 'charge' }                            // +1 charge counter on this card's defId
  | { op: 'freeMerge' };                        // grants one merge this turn without green

export interface ElementDef {
  id: string;                 // 'fire-7' … 'water-9', 'wind' … 'steam'
  name: string;
  tier: 2 | 3;
  fuelCost: number;
  onActivate: Atom[];
  onDrawDamage?: number;      // deal N per card drawn by THIS card's own effects
  onCombineDamage?: number;   // deal N (to any enemy) whenever the player merges in combat
  retaliate?: number;         // while attached: attacked → deal N to any enemy
  defender?: { health: number };
  followup?:
    | { kind: 'activations'; count: number; atoms: Atom[] }  // Nth activation of this defId in a round fires atoms
    | { kind: 'special'; special: 'storm' | 'ash' | 'landslide' | 'duststorm' | 'lava' | 'forest' | 'eruption' | 'ocean' | 'flood' | 'pressure' };
}

export const ELEMENTS: Record<string, ElementDef> = {
  // ---- tier 2: fire = damage
  'fire-7': { id: 'fire-7', name: 'Fire', tier: 2, fuelCost: 1, onActivate: [{ op: 'damage', amount: 2 }] },
  'fire-8': { id: 'fire-8', name: 'Fire', tier: 2, fuelCost: 1, onActivate: [{ op: 'damage', amount: 3 }] },
  'fire-9': { id: 'fire-9', name: 'Fire', tier: 2, fuelCost: 2, onActivate: [{ op: 'damage', amount: 3 }, { op: 'charge' }],
    followup: { kind: 'activations', count: 2, atoms: [{ op: 'damage', amount: 2 }] } },
  // ---- tier 2: earth = defence/attach/retaliation
  'earth-7': { id: 'earth-7', name: 'Earth', tier: 2, fuelCost: 1, onActivate: [{ op: 'attach' }], retaliate: 1 },
  'earth-8': { id: 'earth-8', name: 'Earth', tier: 2, fuelCost: 1, onActivate: [{ op: 'attach' }], retaliate: 2 },
  'earth-9': { id: 'earth-9', name: 'Earth', tier: 2, fuelCost: 2, onActivate: [{ op: 'attach' }, { op: 'block', amount: 2 }], retaliate: 2 },
  // ---- tier 2: air = drawing
  'air-7': { id: 'air-7', name: 'Air', tier: 2, fuelCost: 1, onActivate: [{ op: 'draw', amount: 1 }], onDrawDamage: 1 },
  'air-8': { id: 'air-8', name: 'Air', tier: 2, fuelCost: 1, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 1 },
  'air-9': { id: 'air-9', name: 'Air', tier: 2, fuelCost: 2, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 2 },
  // ---- tier 2: water = combining
  'water-7': { id: 'water-7', name: 'Water', tier: 2, fuelCost: 1, onActivate: [{ op: 'block', amount: 1 }], onCombineDamage: 1 },
  'water-8': { id: 'water-8', name: 'Water', tier: 2, fuelCost: 1, onActivate: [{ op: 'block', amount: 1 }], onCombineDamage: 2 },
  'water-9': { id: 'water-9', name: 'Water', tier: 2, fuelCost: 2, onActivate: [{ op: 'freeMerge' }], onCombineDamage: 2 },
  // ---- tier 3 (spec §2.3 table)
  wind:    { id: 'wind', name: 'Wind', tier: 3, fuelCost: 2, onActivate: [{ op: 'draw', amount: 2 }], onDrawDamage: 1,
             followup: { kind: 'special', special: 'storm' } },
  smoke:   { id: 'smoke', name: 'Smoke', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'draw', amount: 1 }, { op: 'discard', amount: 1 }, { op: 'damage', amount: 1 }], onDrawDamage: 1,
             followup: { kind: 'special', special: 'ash' } },
  land:    { id: 'land', name: 'Land', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }], retaliate: 2,
             followup: { kind: 'special', special: 'landslide' } },
  dust:    { id: 'dust', name: 'Dust', tier: 3, fuelCost: 2, onActivate: [{ op: 'charge' }],
             followup: { kind: 'special', special: 'duststorm' } },
  magma:   { id: 'magma', name: 'Magma', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }],
             followup: { kind: 'special', special: 'lava' } },
  tree:    { id: 'tree', name: 'Tree', tier: 3, fuelCost: 2, onActivate: [{ op: 'attach' }], defender: { health: 2 },
             followup: { kind: 'special', special: 'forest' } },  // defender defs route 'attach' to the defenders zone (Task 9)
  volcano: { id: 'volcano', name: 'Volcano', tier: 3, fuelCost: 2, onActivate: [{ op: 'charge' }],
             followup: { kind: 'special', special: 'eruption' } },
  lake:    { id: 'lake', name: 'Lake', tier: 3, fuelCost: 2, onActivate: [{ op: 'decombine' }], onCombineDamage: 2,
             followup: { kind: 'special', special: 'ocean' } },
  rain:    { id: 'rain', name: 'Rain', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'draw', amount: 1 }, { op: 'damage', amount: 1 }],
             followup: { kind: 'special', special: 'flood' } },
  steam:   { id: 'steam', name: 'Steam', tier: 3, fuelCost: 2,
             onActivate: [{ op: 'decombine' }, { op: 'damage', amount: 1 }], onCombineDamage: 1,
             followup: { kind: 'special', special: 'pressure' } },
};

export function elementDef(defId: string): ElementDef {
  const def = ELEMENTS[defId];
  if (!def) throw new Error(`unknown element def: ${defId}`);
  return def;
}
