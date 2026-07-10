import type { Card, CombatState, ForgedCard, GameEvent, MarkType } from './types';

export function addMark(card: Card, mark: MarkType, events: GameEvent[]): void {
  card.marks[mark] = (card.marks[mark] ?? 0) + 1;
  events.push({ type: 'mark', text: `A card is marked: ${mark}.`, data: { cardId: card.id, mark } });
}

export function cleanse(card: Card, mark: MarkType, events: GameEvent[]): void {
  delete card.marks[mark];
  events.push({ type: 'cleanse', text: `A ${mark} mark is cleansed.`, data: { cardId: card.id, mark } });
}

export function escalateOnDraw(
  cs: CombatState, card: Card, events: GameEvent[],
): 'kept' | 'decombined' | 'destroyed' {
  if (card.marks.doomed !== undefined) {
    card.marks.doomed += 1;
    events.push({ type: 'mark', text: 'The doom deepens.', data: { cardId: card.id, mark: 'doomed' } });
    if (card.marks.doomed >= 3) {
      events.push({ type: 'destroyed', text: 'A card crumbles to nothing.', data: { cardId: card.id } });
      return 'destroyed'; // caller does not add it to hand; it is gone
    }
  }
  if (card.marks.plagued !== undefined) {
    card.marks.plagued += 1;
    events.push({ type: 'mark', text: 'The plague spreads.', data: { cardId: card.id, mark: 'plagued' } });
    if (card.marks.plagued >= 3 && card.kind === 'forged') {
      for (const c of card.constituents) {
        c.marks.plagued = (c.marks.plagued ?? 0) + 1;
        cs.hand.push(c);
      }
      events.push({ type: 'decombine', text: 'A forging rots apart.', data: { cardId: card.id } });
      return 'decombined';
    }
  }
  cs.hand.push(card);
  return 'kept';
}

export const famishedSurcharge = (card: Card): number => (card.marks.famished ? 1 : 0);
export const isScrapBlocked = (card: Card): boolean =>
  card.kind === 'raw' && card.marks.scarred !== undefined;
export const scarAdjust = (card: Card, amount: number): number =>
  card.marks.scarred !== undefined ? Math.max(0, amount - 1) : amount;

export function plagueTouch(result: ForgedCard, constituents: Card[], aura: boolean): void {
  if (aura || constituents.some((c) => c.marks.plagued !== undefined)) {
    result.marks.plagued = 1;
  }
}
