import { COLOUR_ELEMENT } from './types';
import type { Card, Colour, ForgedCard, RawCard } from './types';

const TOTALS = [7, 8, 9] as const;

export function tier2Target(cards: Card[]): { colour: Colour; total: 7 | 8 | 9 } | null {
  if (cards.length === 0) return null;
  if (!cards.every((c): c is RawCard => c.kind === 'raw')) return null;
  const colour = cards[0]!.colour;
  if (!cards.every((c) => c.colour === colour)) return null;
  const total = cards.reduce((s, c) => s + c.value, 0);
  if (!TOTALS.includes(total as 7 | 8 | 9)) return null;
  return { colour, total: total as 7 | 8 | 9 };
}

export function forgeTier2(cards: RawCard[], id: string): ForgedCard {
  const target = tier2Target(cards);
  if (!target) throw new Error('illegal tier-2 merge');
  return {
    kind: 'forged', id, tier: 2,
    defId: `${COLOUR_ELEMENT[target.colour]}-${target.total}`,
    colours: [target.colour],
    constituents: cards,
    marks: {},
  };
}

export const PAIR_DEF: Record<string, string> = {
  'air+air': 'wind',
  'air+fire': 'smoke',
  'earth+earth': 'land',
  'air+earth': 'dust',
  'earth+fire': 'magma',
  'earth+water': 'tree',
  'fire+fire': 'volcano',
  'water+water': 'lake',
  'air+water': 'rain',
  'fire+water': 'steam',
};

export function tier3DefId(a: ForgedCard, b: ForgedCard): string | null {
  if (a.tier !== 2 || b.tier !== 2) return null;
  const elems = [COLOUR_ELEMENT[a.colours[0]!], COLOUR_ELEMENT[b.colours[0]!]].sort();
  return PAIR_DEF[elems.join('+')] ?? null;
}

export function forgeTier3(a: ForgedCard, b: ForgedCard, id: string): ForgedCard {
  const defId = tier3DefId(a, b);
  if (!defId) throw new Error('illegal tier-3 merge');
  return {
    kind: 'forged', id, tier: 3, defId,
    colours: [...new Set([...a.colours, ...b.colours])].sort(),
    constituents: [a, b],
    marks: {},
  };
}

export function unmerge(
  card: ForgedCard,
  burnConstituentId: string,
): { returned: Card[]; burned: Card } {
  const i = card.constituents.findIndex((c) => c.id === burnConstituentId);
  if (i < 0) throw new Error(`not a constituent: ${burnConstituentId}`);
  const burned = card.constituents[i]!;
  const returned = card.constituents.filter((_, j) => j !== i);
  return { returned, burned };
}
