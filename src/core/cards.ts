import type { Card, Colour, CorruptionCard, ForgedCard, RawCard } from './types';

export interface IdGen { n: number }

export function nextId(gen: IdGen, prefix: string): string {
  return `${prefix}${gen.n++}`;
}

const COLOURS: Colour[] = ['red', 'yellow', 'blue', 'green'];

export function makeStartingDeck(gen: IdGen): RawCard[] {
  const deck: RawCard[] = [];
  for (const colour of COLOURS) {
    const values = [0, ...Array.from({ length: 9 }, (_, i) => i + 1).flatMap((v) => [v, v])];
    for (const value of values) {
      deck.push({ kind: 'raw', id: nextId(gen, 'c'), colour, value, marks: {} });
    }
  }
  return deck;
}

export const isRaw = (c: Card): c is RawCard => c.kind === 'raw';
export const isForged = (c: Card): c is ForgedCard => c.kind === 'forged';
export const isCorruption = (c: Card): c is CorruptionCard => c.kind === 'corruption';

export function findCard(cards: Card[], id: string): Card {
  const c = cards.find((x) => x.id === id);
  if (!c) throw new Error(`card not found: ${id}`);
  return c;
}

export function removeCard(cards: Card[], id: string): Card {
  const i = cards.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`card not found: ${id}`);
  return cards.splice(i, 1)[0]!;
}
