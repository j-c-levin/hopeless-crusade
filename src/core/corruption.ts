import { checkOutcome } from './combat';
import { nextId, removeCard, type IdGen } from './cards';
import { addMark } from './marks';
import type { Rng } from './rng';
import type {
  Card, CombatState, CorruptionCard, Element, ForgedCard, GameEvent, RankClass, Suit,
} from './types';

export function makeCorruptionCard(idGen: IdGen, suit: Suit, rank: RankClass): CorruptionCard {
  return { kind: 'corruption', id: nextId(idGen, 'x'), suit, rank, marks: {} };
}

const randomHandCard = (cs: CombatState, rng: Rng): Card | null => {
  const pool = cs.hand.filter((c) => c.kind !== 'corruption');
  return pool.length ? pool[rng.int(pool.length)]! : null;
};
const cheapestRaws = (cs: CombatState, n: number): Card[] => {
  const raws = cs.hand.filter((c) => c.kind === 'raw')
    .sort((a, b) => (a as { value: number }).value - (b as { value: number }).value);
  return raws.slice(0, n);
};

// ---- trigger dispatch -----------------------------------------------------

export function onCorruptionDrawn(
  cs: CombatState, rng: Rng, idGen: IdGen, card: CorruptionCard, events: GameEvent[],
): void {
  void idGen; // no new cards are minted by any trigger below
  events.push({
    type: 'corruption', text: `${card.suit} corruption surfaces (${card.rank}).`,
    data: { suit: card.suit, rank: card.rank },
  });
  switch (`${card.suit}-${card.rank}`) {
    // ---- diamonds (famine) — pay-or-suffer choices --------------------
    case 'diamonds-tower':
      offerPay(cs, rng, 1, 'diamonds-tower', 'Pay 1 raw, or discard a card.', events);
      break;
    case 'diamonds-stronghold':
      offerPay(cs, rng, 1, 'diamonds-stronghold', 'Pay 1 raw, or scrapping seals this round.', events);
      break;
    case 'diamonds-fortress':
      offerPay(cs, rng, 2, 'diamonds-fortress', 'Pay 2 raws, or a card is famished.', events);
      break;
    case 'diamonds-manifestation':
      offerChoice(cs, rng, 'diamonds-manifestation', 'Famish a card, or lose a round from the clock.',
        [{ id: 'mark', label: 'Famish a card' }, { id: 'clock', label: 'Lose a round' }]);
      break;

    // ---- hearts (disease) — direct, no choice -------------------------
    case 'hearts-tower': decombineRandomForged(cs, rng, events); break;
    case 'hearts-stronghold': plagueRandomHandCard(cs, rng, events); break;
    case 'hearts-fortress':
      lockRandomElement(cs, rng, events);
      plagueRandomHandCard(cs, rng, events);
      break;
    case 'hearts-manifestation': break; // its effect is entirely the manifestation-extra hook below

    // ---- clubs (war) — direct, no choice --------------------------------
    case 'clubs-tower': scarRandomHandCard(cs, rng, events); break;
    case 'clubs-stronghold':
      scarRandomHandCard(cs, rng, events);
      cs.recoil = true;
      events.push({ type: 'recoil', text: 'War corruption stirs — every blow you land bites back this round.' });
      break;
    case 'clubs-fortress': discardAllScarred(cs, events); break;
    case 'clubs-manifestation': break; // its effect is entirely the manifestation-extra hook below

    // ---- spades (death) --------------------------------------------------
    case 'spades-tower': doomRandomHandCard(cs, rng, events); break;
    case 'spades-stronghold':
      doomRandomHandCard(cs, rng, events);
      exileTopOfDrawPile(cs, events);
      break;
    case 'spades-fortress':
      offerChoice(cs, rng, 'spades-fortress', 'Exile a forged card, or take 4 and doom two cards.',
        [{ id: 'exile', label: 'Exile a forged card' }, { id: 'suffer', label: 'Take 4 and doom two cards' }]);
      break;
    case 'spades-manifestation': break; // its effect is entirely the manifestation-extra hook below

    default: break;
  }
  applyManifestationExtras(cs, rng, card.suit, events);
}

export function resolveChoice(
  cs: CombatState, rng: Rng, idGen: IdGen, optionId: string, events: GameEvent[],
): void {
  void idGen; // no new cards are minted by any resolution below
  if (!cs.pendingChoice || !cs.pendingPenalty) throw new Error('illegal: no choice pending');
  if (!cs.pendingChoice.options.some((o) => o.id === optionId)) {
    throw new Error(`illegal: unknown option ${optionId}`);
  }
  const kind = cs.pendingPenalty.kind;
  const penalty = cs.pendingPenalty;
  cs.pendingChoice = undefined;
  cs.pendingPenalty = undefined;
  if (optionId === 'pay') {
    for (const c of cheapestRaws(cs, payCost(kind))) removeFromHandToDiscard(cs, c, events);
    return;
  }
  applyPenalty(cs, rng, kind, optionId, penalty, events);
}

// ---- pay-or-suffer machinery ------------------------------------------

function payCost(kind: string): number {
  switch (kind) {
    case 'diamonds-tower': return 1;
    case 'diamonds-stronghold': return 1;
    case 'diamonds-fortress': return 2;
    default: return 0;
  }
}

// Where a penalty needs a random target, roll it now (at offer time) so resolution is
// deterministic and independent of the rng passed to resolveChoice later.
function rollTargetFor(cs: CombatState, rng: Rng, kind: string): string | undefined {
  switch (kind) {
    case 'diamonds-tower':
    case 'diamonds-fortress':
    case 'diamonds-manifestation':
      return randomHandCard(cs, rng)?.id;
    case 'spades-fortress': {
      const forged = cs.hand.filter((c) => c.kind === 'forged');
      return forged.length ? forged[rng.int(forged.length)]!.id : undefined;
    }
    default:
      return undefined;
  }
}

function offerPay(
  cs: CombatState, rng: Rng, cost: number, kind: string, prompt: string, events: GameEvent[],
): void {
  const raws = cs.hand.filter((c) => c.kind === 'raw');
  if (raws.length < cost) {
    // cannot pay: the penalty applies immediately, with no choice offered
    applyPenalty(cs, rng, kind, 'refuse', { kind, targetCardId: rollTargetFor(cs, rng, kind) }, events);
    return;
  }
  cs.pendingChoice = {
    id: kind, prompt,
    options: [{ id: 'pay', label: 'Pay' }, { id: 'refuse', label: 'Refuse' }],
  };
  cs.pendingPenalty = { kind, targetCardId: rollTargetFor(cs, rng, kind) };
}

function offerChoice(
  cs: CombatState, rng: Rng, kind: string, prompt: string, options: { id: string; label: string }[],
): void {
  cs.pendingChoice = { id: kind, prompt, options };
  cs.pendingPenalty = { kind, targetCardId: rollTargetFor(cs, rng, kind) };
}

function removeFromHandToDiscard(cs: CombatState, card: Card, events: GameEvent[]): void {
  removeCard(cs.hand, card.id);
  cs.discardPile.push(card);
  events.push({ type: 'discard', text: 'A raw is paid away.', data: { cardId: card.id } });
}

function resolvedTarget(cs: CombatState, rng: Rng, penalty: { targetCardId?: string }): Card | null {
  if (penalty.targetCardId) return cs.hand.find((c) => c.id === penalty.targetCardId) ?? null;
  return randomHandCard(cs, rng);
}

function applyPenalty(
  cs: CombatState, rng: Rng, kind: string, optionId: string,
  penalty: { kind: string; targetCardId?: string }, events: GameEvent[],
): void {
  switch (kind) {
    case 'diamonds-tower': {
      const t = resolvedTarget(cs, rng, penalty);
      if (t) {
        removeCard(cs.hand, t.id);
        cs.discardPile.push(t);
        events.push({ type: 'discard', text: 'A card is cast off.', data: { cardId: t.id } });
      }
      break;
    }
    case 'diamonds-stronghold':
      cs.scrapSealed = true;
      events.push({ type: 'seal', text: 'Scrapping is sealed this round.' });
      break;
    case 'diamonds-fortress': {
      const t = resolvedTarget(cs, rng, penalty);
      if (t) addMark(t, 'famished', events);
      break;
    }
    case 'diamonds-manifestation': {
      if (optionId === 'mark') {
        const t = resolvedTarget(cs, rng, penalty);
        if (t) addMark(t, 'famished', events);
      } else if (optionId === 'clock' && cs.clock !== undefined) {
        cs.clock -= 1;
        events.push({ type: 'clock', text: 'A round is stolen from the clock.', data: { clock: cs.clock } });
      }
      break;
    }
    case 'spades-fortress': {
      if (optionId === 'exile') {
        const forged = cs.hand.filter((c) => c.kind === 'forged');
        const t = penalty.targetCardId
          ? forged.find((c) => c.id === penalty.targetCardId)
          : (forged.length ? forged[rng.int(forged.length)] : undefined);
        if (t) {
          removeCard(cs.hand, t.id); // exiled — removed from the game, not discarded
          events.push({ type: 'exile', text: 'A forging is exiled.', data: { cardId: t.id } });
        }
      } else {
        cs.hp -= 4;
        events.push({ type: 'player-damaged', text: 'The reaper collects.', data: { amount: 4 } });
        checkOutcome(cs);
        // Doom two DISTINCT cards: build the pool once, remove each pick before the next roll.
        // If fewer than 2 candidates exist, mark whatever is available.
        const pool = cs.hand.filter((c) => c.kind !== 'corruption');
        for (let i = 0; i < 2 && pool.length > 0; i++) {
          const t = pool.splice(rng.int(pool.length), 1)[0]!;
          addMark(t, 'doomed', events);
        }
      }
      break;
    }
    default: break;
  }
}

// ---- direct (no-choice) triggers ---------------------------------------

function plagueRandomHandCard(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const t = randomHandCard(cs, rng);
  if (t) addMark(t, 'plagued', events);
}
function scarRandomHandCard(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const t = randomHandCard(cs, rng);
  if (t) addMark(t, 'scarred', events);
}
function doomRandomHandCard(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const t = randomHandCard(cs, rng);
  if (t) addMark(t, 'doomed', events);
}

function decombineRandomForged(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const forged = cs.hand.filter((c): c is ForgedCard => c.kind === 'forged');
  if (!forged.length) return;
  const target = forged[rng.int(forged.length)]!;
  removeCard(cs.hand, target.id); // no burn: every constituent comes back, plagued
  for (const c of target.constituents) {
    addMark(c, 'plagued', events);
    cs.hand.push(c);
  }
  events.push({ type: 'decombine', text: `${target.defId} rots apart, its pieces plagued.`, data: { cardId: target.id } });
}

function lockRandomElement(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const elements: Element[] = ['fire', 'earth', 'air', 'water'];
  const el = elements[rng.int(elements.length)]!;
  if (!cs.lockedElements.includes(el)) cs.lockedElements.push(el);
  events.push({ type: 'lock', text: `${el} locks this round.`, data: { element: el } });
}

function discardAllScarred(cs: CombatState, events: GameEvent[]): void {
  const scarred = cs.hand.filter((c) => c.marks.scarred !== undefined);
  for (const c of scarred) {
    removeCard(cs.hand, c.id);
    cs.discardPile.push(c);
  }
  if (scarred.length) events.push({ type: 'discard', text: 'Scarred cards are cast off.' });
}

function exileTopOfDrawPile(cs: CombatState, events: GameEvent[]): void {
  if (!cs.drawPile.length) return;
  cs.drawPile.pop(); // removed from the game, face-down — the event never names the card
  events.push({ type: 'exile', text: 'Something is lost.' });
}

function plagueRandomForgedAnywhere(cs: CombatState, rng: Rng, events: GameEvent[]): void {
  const forged: ForgedCard[] = [];
  for (const pool of [cs.hand, cs.drawPile, cs.discardPile]) {
    for (const c of pool) if (c.kind === 'forged') forged.push(c);
  }
  if (!forged.length) return;
  addMark(forged[rng.int(forged.length)]!, 'plagued', events);
}

// ---- manifestation-present extras (triggered by enemy presence, not card rank) ----

function applyManifestationExtras(cs: CombatState, rng: Rng, suit: Suit, events: GameEvent[]): void {
  const manifestationAlive = cs.enemies.some((e) => e.suit === suit && e.rank === 'manifestation' && e.hp > 0);
  if (!manifestationAlive) return;
  switch (suit) {
    case 'hearts':
      plagueRandomForgedAnywhere(cs, rng, events);
      break;
    case 'clubs':
      cs.hp -= 2;
      events.push({ type: 'player-damaged', text: 'The war corruption draws blood.', data: { amount: 2 } });
      checkOutcome(cs);
      scarRandomHandCard(cs, rng, events);
      break;
    case 'spades':
      cs.deathCounter += 1;
      events.push({ type: 'death-counter', text: 'Death draws closer.', data: { deathCounter: cs.deathCounter } });
      checkOutcome(cs);
      break;
    default: break;
  }
}
