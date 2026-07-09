export type Colour = 'red' | 'yellow' | 'blue' | 'green';
export type Element = 'fire' | 'earth' | 'air' | 'water';
export type Suit = 'diamonds' | 'hearts' | 'clubs' | 'spades';
export type RankClass = 'tower' | 'stronghold' | 'fortress' | 'manifestation';
export type MarkType = 'famished' | 'plagued' | 'scarred' | 'doomed';
export type MarkRecord = Partial<Record<MarkType, number>>;

export interface RawCard {
  kind: 'raw'; id: string; colour: Colour; value: number; marks: MarkRecord;
}
export interface ForgedCard {
  kind: 'forged'; id: string; tier: 2 | 3; defId: string;
  colours: Colour[]; constituents: Card[]; marks: MarkRecord;
}
export interface CorruptionCard {
  kind: 'corruption'; id: string; suit: Suit; rank: RankClass; marks: MarkRecord;
}
export type Card = RawCard | ForgedCard | CorruptionCard;

export interface GameEvent { type: string; text: string; data?: Record<string, unknown> }

export const COLOUR_ELEMENT: Record<Colour, Element> = {
  red: 'fire', yellow: 'earth', blue: 'air', green: 'water',
};
export const ELEMENT_COLOUR: Record<Element, Colour> = {
  fire: 'red', earth: 'yellow', air: 'blue', water: 'green',
};
