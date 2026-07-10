import type { Element } from '../core/types';

export interface RelicDef { id: string; element: Element; name: string; text: string }

// Eight relics, two per element (spec §7 table) — a direct transcription of the table.
export const RELICS: Record<string, RelicDef> = {
  kindling: {
    id: 'kindling', element: 'fire', name: 'Kindling',
    text: 'The 2nd fire-line activation each round deals 2 to a random enemy.',
  },
  emberheart: {
    id: 'emberheart', element: 'fire', name: 'Emberheart',
    text: 'The first fire-line activation each fight costs 1 less fuel.',
  },
  tailwind: {
    id: 'tailwind', element: 'air', name: 'Tailwind',
    text: 'The 2nd air-line activation each round draws 1.',
  },
  kestrel: {
    id: 'kestrel', element: 'air', name: 'Kestrel',
    text: 'Draw 1 extra card on round 1 of every fight.',
  },
  bulwark: {
    id: 'bulwark', element: 'earth', name: 'Bulwark',
    text: 'The 2nd earth-line activation each round grants 2 block.',
  },
  roots: {
    id: 'roots', element: 'earth', name: 'Roots',
    text: 'Retaliation deals +1.',
  },
  springwell: {
    id: 'springwell', element: 'water', name: 'Springwell',
    text: 'The first merge each fight heals 1.',
  },
  'tidal-charm': {
    id: 'tidal-charm', element: 'water', name: 'Tidal Charm',
    text: 'The first decombine each fight burns nothing.',
  },
};

export function relicDef(id: string): RelicDef {
  const def = RELICS[id];
  if (!def) throw new Error(`unknown relic: ${id}`);
  return def;
}
