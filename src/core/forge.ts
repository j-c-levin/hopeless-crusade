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
