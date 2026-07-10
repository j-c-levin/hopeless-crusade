import { CONFIG } from '../content/config';
import { elementDef } from '../content/elements';
import { findCard, nextId, removeCard, type IdGen } from './cards';
import { forgeTier2, forgeTier3, tier2Target, tier3DefId } from './forge';
import type { Rng } from './rng';
import type {
  Card, CombatState, Enemy, EnemySpec, ForgedCard, GameEvent,
} from './types';

export type CombatCommand =
  | { type: 'scrap'; cardId: string; targetEnemyId?: string; mergeCardIds?: string[] }
  | { type: 'activate'; cardId: string; fuelIds: string[]; targetEnemyId?: string;
      decombineTargetId?: string; burnConstituentId?: string; discardIds?: string[] }  // Task 9
  | { type: 'decombine'; cardId: string; burnConstituentId?: string }                  // Task 10 (freeDecombines)
  | { type: 'hailMary'; cardIds: string[]; targetEnemyId: string }
  | { type: 'resolveChoice'; optionId: string }                                        // Task 12
  | { type: 'endTurn' };

export function startCombat(opts: {
  deck: Card[]; hp: number; handSize: number;
  enemies: EnemySpec[]; struggles: string[]; relics: string[];
  rng: Rng; idGen: IdGen;
}): CombatState {
  const enemies: Enemy[] = opts.enemies.map((e) => ({
    id: nextId(opts.idGen, 'e'), suit: e.suit, rank: e.rank,
    hp: e.hp, maxHp: e.hp,
    power: e.rank === 'manifestation' ? manifestationPower(e.suit) : CONFIG.enemyPower[e.rank]!,
    attachments: [], echoed: false,
  }));
  const cs: CombatState = {
    outcome: 'ongoing', round: 1, hp: opts.hp, handSize: opts.handSize, block: 0,
    hand: [], drawPile: opts.rng.shuffle(opts.deck), discardPile: [],
    attachedCards: [], defenders: [], enemies,
    activatedThisRound: [], activationCounts: {}, charges: {},
    freeMerges: 0, freeDecombines: 0, scrapSealed: false, lockedElements: [],
    smokeHits: [], plagueAura: false, deathCounter: 0,
    struggles: opts.struggles, relics: opts.relics,
  };
  const manif = enemies.find((e) => e.rank === 'manifestation');
  if (manif?.suit === 'diamonds') cs.clock = CONFIG.manifestationClock;
  if (manif?.suit === 'hearts') cs.plagueAura = true;
  const events: GameEvent[] = [];
  drawCards(cs, opts.rng, opts.idGen, cs.handSize, events);
  return cs;
}

// Manifestation power is per-manifestation content (spec §3.3): flat 10 in v1.
function manifestationPower(_suit: string): number {
  return 10;
}

export function drawCards(
  cs: CombatState, rng: Rng, idGen: IdGen, n: number,
  events: GameEvent[], source?: ForgedCard,
): void {
  for (let i = 0; i < n; i++) {
    if (cs.drawPile.length === 0) {
      if (cs.discardPile.length === 0) return; // nothing left to draw — not a loss (hp is life)
      cs.drawPile = rng.shuffle(cs.discardPile);
      cs.discardPile = [];
      events.push({ type: 'reshuffle', text: 'The deck turns over.' });
    }
    const card = cs.drawPile.pop()!;
    if (card.kind === 'corruption') {
      // Task 12 replaces this stub with onCorruptionDrawn.
      events.push({ type: 'corruption-drawn', text: 'A corruption card surfaces.' });
      cs.discardPile.push(card);
    } else {
      cs.hand.push(card);
      // Task 11 wires mark escalation (plague/doom) here.
    }
    if (source?.kind === 'forged') {
      const dmg = elementDef(source.defId).onDrawDamage ?? 0;
      if (dmg > 0) {
        const target = lowestHpEnemy(cs);
        if (target) dealToEnemy(cs, target.id, dmg, events);
      }
    }
  }
}

export function lowestHpEnemy(cs: CombatState): Enemy | null {
  const alive = cs.enemies.filter((e) => e.hp > 0);
  if (alive.length === 0) return null;
  return alive.reduce((a, b) => (b.hp < a.hp ? b : a));
}

export function dealToEnemy(
  cs: CombatState, enemyId: string, amount: number, events: GameEvent[], tag?: string,
): void {
  const enemy = cs.enemies.find((e) => e.id === enemyId);
  if (!enemy || enemy.hp <= 0 || amount <= 0) return;
  enemy.hp -= amount;
  if (tag === 'smoke' && !cs.smokeHits.includes(enemy.id)) cs.smokeHits.push(enemy.id);
  events.push({ type: 'enemy-damaged', text: `${enemy.rank} takes ${amount}.`, data: { enemyId, amount } });
  if (enemy.hp <= 0) events.push({ type: 'enemy-down', text: `The ${enemy.rank} falls.`, data: { enemyId } });
  checkOutcome(cs);
}

export function endTurn(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  if (cs.outcome !== 'ongoing') return;
  // Task 10 adds end-of-round followups (eruption, deflection) via followups.ts here.
  for (const enemy of cs.enemies.filter((e) => e.hp > 0)) {
    // retaliation from attachments — auto-targets the attacker (v1 simplification)
    for (const att of enemy.attachments) {
      const ret = elementDef(att.defId).retaliate ?? 0;
      if (ret > 0) dealToEnemy(cs, enemy.id, ret, events);
    }
    if (enemy.hp <= 0) continue;
    let incoming = enemy.power;
    for (const d of cs.defenders) {
      if (incoming <= 0) break;
      const soak = Math.min(d.hp, incoming);
      d.hp -= soak; incoming -= soak;
    }
    cs.defenders = cs.defenders.filter((d) => d.hp > 0);
    const blocked = Math.min(cs.block, incoming);
    cs.block -= blocked; incoming -= blocked;
    if (incoming > 0) {
      cs.hp -= incoming;
      events.push({ type: 'player-damaged', text: `You take ${incoming}.`, data: { amount: incoming } });
    }
  }
  // board does not persist between rounds (spec §3.2)
  for (const enemy of cs.enemies) {
    for (const att of enemy.attachments) {
      const i = cs.attachedCards.findIndex((c) => c.id === att.cardId);
      if (i >= 0) cs.discardPile.push(cs.attachedCards.splice(i, 1)[0]!);
    }
    enemy.attachments = [];
  }
  for (const d of cs.defenders) {
    const i = cs.attachedCards.findIndex((c) => c.id === d.cardId);
    if (i >= 0) cs.discardPile.push(cs.attachedCards.splice(i, 1)[0]!);
  }
  cs.defenders = [];
  cs.block = 0;
  cs.activatedThisRound = []; cs.activationCounts = {}; cs.smokeHits = [];
  cs.freeMerges = 0; cs.freeDecombines = 0;
  cs.scrapSealed = false; cs.lockedElements = [];
  // Resolve any win/loss from this turn's retaliation before the clock can act:
  // all enemies dead = won, and a clock hitting 0 must not overwrite that.
  checkOutcome(cs);
  if (cs.outcome !== 'ongoing') return;
  if (cs.clock !== undefined) {
    cs.clock -= 1;
    if (cs.clock <= 0) { cs.outcome = 'lost'; events.push({ type: 'clock-out', text: 'Time starves out.' }); return; }
  }
  cs.round += 1;
  checkOutcome(cs);
  if (cs.outcome !== 'ongoing') return;
  drawCards(cs, rng, idGen, Math.max(0, cs.handSize - cs.hand.length), events);
}

export function checkOutcome(cs: CombatState): void {
  if (cs.outcome !== 'ongoing') return;
  if (cs.hp <= 0) cs.outcome = 'lost';
  else if (cs.deathCounter >= CONFIG.deathCounterThreshold) cs.outcome = 'lost';
  else if (cs.enemies.every((e) => e.hp <= 0)) cs.outcome = 'won';
}

export function combatCommand(
  cs: CombatState, rng: Rng, idGen: IdGen, cmd: CombatCommand,
): GameEvent[] {
  const events: GameEvent[] = [];
  if (cs.outcome !== 'ongoing') throw new Error('illegal: combat over');
  if (cs.pendingChoice && cmd.type !== 'resolveChoice') throw new Error('illegal: choice pending');
  switch (cmd.type) {
    case 'scrap': doScrap(cs, rng, idGen, cmd, events); break;
    case 'hailMary': doHailMary(cs, cmd, events); break;
    case 'endTurn': endTurn(cs, rng, idGen, events); break;
    case 'activate': doActivate(cs, rng, idGen, cmd, events); break;       // Task 9
    case 'decombine': doFreeDecombine(cs, cmd, events); break;             // Task 10
    case 'resolveChoice': throw new Error('illegal: no choice pending');   // Task 12 replaces
  }
  return events;
}

function doScrap(
  cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: Extract<CombatCommand, { type: 'scrap' }>, events: GameEvent[],
): void {
  if (cs.scrapSealed) throw new Error('illegal: scrapping is sealed');
  const card = findCard(cs.hand, cmd.cardId);
  if (card.kind !== 'raw') throw new Error('illegal: only raws scrap');
  // Task 11 adds: scarred raws cannot scrap; famished raws cost 1 extra raw.
  // Validate the colour effect fully BEFORE consuming the card: rejection = no state change.
  if (card.colour === 'red' && !livingEnemy(cs, cmd.targetEnemyId)) {
    throw new Error('illegal: red scrap needs a living target');
  }
  if (card.colour === 'green') {
    if (!cmd.mergeCardIds?.length) throw new Error('illegal: green scrap needs mergeCardIds');
    if (cmd.mergeCardIds.includes(card.id)) throw new Error('illegal: not a valid merge');
    assertLegalMerge(cs, cmd.mergeCardIds);
  }
  removeCard(cs.hand, card.id);
  cs.discardPile.push(card);
  events.push({ type: 'scrap', text: `Scrapped a ${card.colour} ${card.value}.`, data: { cardId: card.id } });
  switch (card.colour) {
    case 'red': dealToEnemy(cs, cmd.targetEnemyId!, 1, events); break;
    case 'yellow': cs.block += 1; break;
    case 'blue': drawCards(cs, rng, idGen, 1, events); break;
    case 'green': performMerge(cs, idGen, cmd.mergeCardIds!, events); break;
  }
}

function livingEnemy(cs: CombatState, enemyId: string | undefined): Enemy | undefined {
  return cs.enemies.find((e) => e.id === enemyId && e.hp > 0);
}

// Throws unless cardIds form a legal merge from cards currently in hand. Never mutates.
function assertLegalMerge(cs: CombatState, cardIds: string[]): void {
  if (new Set(cardIds).size !== cardIds.length) throw new Error('illegal: not a valid merge');
  const cards = cardIds.map((id) => findCard(cs.hand, id));
  const legal = tier2Target(cards) !== null
    || (cards.length === 2 && cards.every((c) => c.kind === 'forged')
        && tier3DefId(cards[0] as ForgedCard, cards[1] as ForgedCard) !== null);
  if (!legal) throw new Error('illegal: not a valid merge');
}

export function performMerge(
  cs: CombatState, idGen: IdGen, cardIds: string[], events: GameEvent[],
): ForgedCard {
  assertLegalMerge(cs, cardIds); // validate before any mutation
  const cards = cardIds.map((id) => findCard(cs.hand, id));
  const forged: ForgedCard = tier2Target(cards)
    ? forgeTier2(cards as RawCardArray, nextId(idGen, 'f'))
    : forgeTier3(cards[0] as ForgedCard, cards[1] as ForgedCard, nextId(idGen, 'f'));
  for (const id of cardIds) removeCard(cs.hand, id);
  cs.hand.push(forged);
  // Task 11 adds plague contagion + plagueAura here.
  events.push({ type: 'merge', text: `Forged ${forged.defId}.`, data: { defId: forged.defId } });
  fireCombineDamage(cs, events);
  return forged;
}
type RawCardArray = Parameters<typeof forgeTier2>[0];

function fireCombineDamage(cs: CombatState, events: GameEvent[]): void {
  const sources = [...cs.hand, ...cs.attachedCards].filter((c) => c.kind === 'forged');
  for (const s of sources) {
    const dmg = elementDef((s as ForgedCard).defId).onCombineDamage ?? 0;
    if (dmg > 0) {
      const target = lowestHpEnemy(cs);
      if (target) dealToEnemy(cs, target.id, dmg, events);
    }
  }
}

function doHailMary(
  cs: CombatState, cmd: Extract<CombatCommand, { type: 'hailMary' }>, events: GameEvent[],
): void {
  if (cmd.cardIds.length !== CONFIG.hailMaryBurn) throw new Error('illegal: hail mary burns exactly 3');
  if (new Set(cmd.cardIds).size !== cmd.cardIds.length) throw new Error('illegal: hail mary needs distinct raws');
  const cards = cmd.cardIds.map((id) => findCard(cs.hand, id));
  if (!cards.every((c) => c.kind === 'raw')) throw new Error('illegal: hail mary burns raws');
  if (!livingEnemy(cs, cmd.targetEnemyId)) throw new Error('illegal: hail mary needs a living target');
  for (const id of cmd.cardIds) removeCard(cs.hand, id); // burned: gone from the run
  events.push({ type: 'burn', text: 'Three raws burn for one desperate strike.' });
  dealToEnemy(cs, cmd.targetEnemyId, CONFIG.hailMaryDamage, events);
}

// placeholders overwritten by Tasks 9–10 (declared so the switch compiles):
function doActivate(_cs: CombatState, _rng: Rng, _idGen: IdGen,
  _cmd: Extract<CombatCommand, { type: 'activate' }>, _events: GameEvent[]): void {
  throw new Error('illegal: not implemented until Task 9');
}
function doFreeDecombine(_cs: CombatState,
  _cmd: Extract<CombatCommand, { type: 'decombine' }>, _events: GameEvent[]): void {
  throw new Error('illegal: not implemented until Task 10');
}
