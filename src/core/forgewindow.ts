import { findCard, isCorruption, isForged, isRaw, removeCard, nextId, type IdGen } from './cards';
import { forgeTier2, forgeTier3, tier2Target, tier3DefId } from './forge';
import { unmerge } from './forge';
import { plagueTouch } from './marks';
import type { Rng } from './rng';
import type { Card, ForgedCard, GameEvent, RawCard } from './types';

export interface ForgeWindow { slotIds: string[]; rerollsLeft: number }

// Corruption cards squat in slots (unusable); forged cards never occupy slots.
function eligibleForSlots(deck: Card[]): Card[] {
  return deck.filter((c) => isRaw(c) || isCorruption(c));
}

export function openWindow(deck: Card[], rng: Rng, size: number, rerolls: number): ForgeWindow {
  const pool = eligibleForSlots(deck);
  const slotIds = rng.shuffle(pool).slice(0, Math.min(size, pool.length)).map((c) => c.id);
  return { slotIds, rerollsLeft: rerolls };
}

// Validate before any mutation, per this codebase's invariant.
function assertLegalWindowMerge(deck: Card[], win: ForgeWindow, cardIds: string[]): Card[] {
  if (new Set(cardIds).size !== cardIds.length) throw new Error('illegal: not a valid merge');
  const cards = cardIds.map((id) => findCard(deck, id));
  for (const c of cards) {
    if (isCorruption(c)) throw new Error('illegal: corruption cards cannot be merged');
    if (isRaw(c) && !win.slotIds.includes(c.id)) {
      throw new Error('illegal: raw card is not in the forge window');
    }
  }
  const legal = tier2Target(cards) !== null
    || (cards.length === 2 && cards.every(isForged)
        && tier3DefId(cards[0] as ForgedCard, cards[1] as ForgedCard) !== null);
  if (!legal) throw new Error('illegal: not a valid merge');
  return cards;
}

export function windowMerge(
  deck: Card[], win: ForgeWindow, idGen: IdGen, cardIds: string[], events: GameEvent[],
): ForgedCard {
  const cards = assertLegalWindowMerge(deck, win, cardIds); // validate before any mutation
  const forged: ForgedCard = tier2Target(cards)
    ? forgeTier2(cards as RawCard[], nextId(idGen, 'f'))
    : forgeTier3(cards[0] as ForgedCard, cards[1] as ForgedCard, nextId(idGen, 'f'));
  for (const id of cardIds) removeCard(deck, id);
  win.slotIds = win.slotIds.filter((id) => !cardIds.includes(id));
  deck.push(forged);
  plagueTouch(forged, cards, false);
  events.push({ type: 'merge', text: `Forged ${forged.defId}.`, data: { defId: forged.defId } });
  return forged;
}

export function windowReroll(deck: Card[], win: ForgeWindow, rng: Rng): void {
  if (win.rerollsLeft <= 0) throw new Error('illegal: no rerolls left');
  const count = win.slotIds.length;
  const pool = eligibleForSlots(deck); // previous slot cards never left the deck, so they're in here too
  win.slotIds = rng.shuffle(pool).slice(0, Math.min(count, pool.length)).map((c) => c.id);
  win.rerollsLeft -= 1;
}

export function windowUnmerge(
  deck: Card[], _idGen: IdGen, cardId: string, burnConstituentId: string, events: GameEvent[],
): void {
  const card = findCard(deck, cardId); // throws if not in deck, before any mutation
  if (!isForged(card)) throw new Error('illegal: only forged cards can be unmerged');
  const { returned, burned } = unmerge(card, burnConstituentId); // throws if not a constituent
  removeCard(deck, cardId);
  deck.push(...returned);
  events.push({
    type: 'decombine', text: `${card.defId} comes apart.`,
    data: { cardId: card.id, burnedId: burned.id },
  });
}
