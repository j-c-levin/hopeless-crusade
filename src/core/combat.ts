import { CONFIG } from '../content/config';
import { elementDef, type Atom } from '../content/elements';
import { findCard, isRaw, nextId, removeCard, type IdGen } from './cards';
import { onCorruptionDrawn, resolveChoice } from './corruption';
import { forgeTier2, forgeTier3, tier2Target, tier3DefId, unmerge } from './forge';
import { onActivated, onEndOfRound, getDeflection } from './followups';
import {
  addMark, escalateOnDraw, famishedSurcharge, isScrapBlocked, plagueTouch, scarAdjust,
} from './marks';
import type { Rng } from './rng';
import { COLOUR_ELEMENT } from './types';
import type {
  Card, CombatState, Element, Enemy, EnemySpec, ForgedCard, GameEvent,
} from './types';

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];

// Block gains route through here so cold-grip (halve, round down) applies uniformly
// to the yellow scrap, block atoms (including followups), and the forest followup.
export function gainBlock(cs: CombatState, n: number): void {
  cs.block += cs.struggles.includes('cold-grip') ? Math.floor(n / 2) : n;
}

export type CombatCommand =
  | { type: 'scrap'; cardId: string; targetEnemyId?: string; mergeCardIds?: string[];
      extraFuelIds?: string[] }                                                        // Task 11 (famished)
  | { type: 'activate'; cardId: string; fuelIds: string[]; targetEnemyId?: string;
      decombineTargetId?: string; burnConstituentId?: string; discardIds?: string[];
      extraFuelIds?: string[] }                                                        // Task 9 (+ Task 11)
  | { type: 'decombine'; cardId: string; burnConstituentId?: string }                  // Task 10 (freeDecombines)
  | { type: 'hailMary'; cardIds: string[]; targetEnemyId: string }
  | { type: 'resolveChoice'; optionId: string }                                        // Task 12
  | { type: 'endTurn' };

export function startCombat(opts: {
  deck: Card[]; hp: number; handSize: number;
  enemies: EnemySpec[]; struggles: string[]; relics: string[];
  rng: Rng; idGen: IdGen;
}): CombatState {
  const siege = opts.struggles.includes('siege') ? 1 : 0;
  const enemies: Enemy[] = opts.enemies.map((e) => ({
    id: nextId(opts.idGen, 'e'), suit: e.suit, rank: e.rank,
    hp: e.hp, maxHp: e.hp,
    power: (e.rank === 'manifestation' ? manifestationPower(e.suit) : CONFIG.enemyPower[e.rank]!) + siege,
    attachments: [], echoed: false,
  }));
  const cs: CombatState = {
    outcome: 'ongoing', round: 1, hp: opts.hp,
    handSize: opts.handSize - (opts.struggles.includes('rationing') ? 1 : 0), block: 0,
    hand: [], drawPile: opts.rng.shuffle(opts.deck), discardPile: [],
    attachedCards: [], defenders: [], enemies,
    activatedThisRound: [], activationCounts: {}, charges: {},
    freeMerges: 0, freeDecombines: 0, scrapSealed: false, lockedElements: [],
    smokeHits: [], plagueAura: false, deathCounter: 0,
    struggles: opts.struggles, relics: opts.relics, recoil: false,
  };
  const manif = enemies.find((e) => e.rank === 'manifestation');
  if (manif?.suit === 'diamonds') cs.clock = CONFIG.manifestationClock;
  if (manif?.suit === 'hearts') cs.plagueAura = true;
  const events: GameEvent[] = [];
  if (cs.struggles.includes('contagion')) {
    const forged = cs.drawPile.filter((c) => c.kind === 'forged');
    if (forged.length > 0) addMark(opts.rng.pick(forged), 'plagued', events);
  }
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
      if (cs.struggles.includes('toll') && cs.drawPile.length > 0) {
        const exiled = cs.drawPile.pop()!;
        events.push({ type: 'exile', text: 'The toll takes a card from the top.', data: { cardId: exiled.id } });
      }
    }
    const card = cs.drawPile.pop()!;
    if (card.kind === 'corruption') {
      onCorruptionDrawn(cs, rng, idGen, card, events);
      cs.discardPile.push(card);
    } else if (card.marks.plagued !== undefined || card.marks.doomed !== undefined) {
      escalateOnDraw(cs, card, events);
    } else {
      cs.hand.push(card);
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
  if (enemy.hp <= 0) {
    events.push({ type: 'enemy-down', text: `The ${enemy.rank} falls.`, data: { enemyId } });
    if (cs.struggles.includes('crossfire')) {
      cs.hp -= 1;
      events.push({ type: 'crossfire', text: 'Crossfire draws blood as the enemy falls.' });
    }
  }
  if (cs.recoil) {
    cs.hp -= 1;
    events.push({ type: 'recoil', text: 'The war corruption bites back.' });
  }
  checkOutcome(cs);
}

export function endTurn(cs: CombatState, rng: Rng, idGen: IdGen, events: GameEvent[]): void {
  if (cs.outcome !== 'ongoing') return;
  onEndOfRound(cs, rng, idGen, events);
  // War echo: a clubs-manifestation fight revives each first-death enemy once, at half maxHp.
  if (cs.enemies.some((e) => e.suit === 'clubs' && e.rank === 'manifestation' && e.hp > 0)) {
    for (const enemy of cs.enemies) {
      if (enemy.hp <= 0 && !enemy.echoed) {
        enemy.hp = Math.ceil(enemy.maxHp / 2);
        enemy.echoed = true;
        events.push({ type: 'war-echo', text: 'The fallen rises again.', data: { enemyId: enemy.id } });
      }
    }
  }
  let deflect = getDeflection(cs);
  for (const enemy of cs.enemies.filter((e) => e.hp > 0)) {
    // retaliation from attachments — auto-targets the attacker (v1 simplification)
    for (const att of enemy.attachments) {
      const ret = elementDef(att.defId).retaliate ?? 0;
      if (ret > 0) dealToEnemy(cs, enemy.id, ret, events);
    }
    if (enemy.hp <= 0) continue;
    let incoming = enemy.power;
    const used = Math.min(deflect, incoming);
    deflect -= used; incoming -= used;
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
  // attrition: after attacks land, before the per-round resets below
  if (cs.struggles.includes('attrition') && cs.hand.length > 0) {
    const discarded = rng.pick(cs.hand);
    removeCard(cs.hand, discarded.id);
    cs.discardPile.push(discarded);
    events.push({ type: 'attrition', text: 'Attrition claims a card from your hand.', data: { cardId: discarded.id } });
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
  cs.scrapSealed = false; cs.lockedElements = []; cs.recoil = false;
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
  // Start-of-round struggles. Applied here (endTurn only) rather than duplicated into
  // startCombat for round 1 — simpler, and it means round 1 is exempt from all three.
  if (cs.struggles.includes('tithe')) {
    const raws = cs.hand.filter(isRaw);
    if (raws.length > 0) {
      const cheapest = raws.reduce((a, b) => (b.value < a.value ? b : a));
      removeCard(cs.hand, cheapest.id);
      cs.discardPile.push(cheapest);
      events.push({ type: 'tithe', text: 'The tithe takes your cheapest raw.', data: { cardId: cheapest.id } });
    } else {
      cs.hp -= 1;
      events.push({ type: 'tithe', text: 'With no raw to give, the tithe takes 1 hp instead.' });
      checkOutcome(cs);
      if (cs.outcome !== 'ongoing') return;
    }
  }
  if (cs.struggles.includes('quarantine')) {
    cs.lockedElements = [rng.pick(ELEMENTS)];
    events.push({ type: 'quarantine', text: 'An element is quarantined this round.' });
  }
  if (cs.struggles.includes('creeping-end') && cs.round % 3 === 0 && cs.hand.length > 0) {
    addMark(rng.pick(cs.hand), 'doomed', events);
  }
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
    case 'resolveChoice': resolveChoice(cs, rng, idGen, cmd.optionId, events); break;
  }
  return events;
}

function doScrap(
  cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: Extract<CombatCommand, { type: 'scrap' }>, events: GameEvent[],
): void {
  if (cmd.cardId === '') {
    if (cs.freeMerges <= 0) throw new Error('illegal: no free merge available');
    if (!cmd.mergeCardIds?.length) throw new Error('illegal: free merge needs mergeCardIds');
    assertLegalMerge(cs, cmd.mergeCardIds); // validate before consuming the free merge
    cs.freeMerges -= 1;
    performMerge(cs, idGen, cmd.mergeCardIds, events);
    return;
  }
  if (cs.scrapSealed) throw new Error('illegal: scrapping is sealed');
  const card = findCard(cs.hand, cmd.cardId);
  if (card.kind !== 'raw') throw new Error('illegal: only raws scrap');
  if (isScrapBlocked(card)) throw new Error('illegal: scarred raws cannot scrap');
  // Famished raws cost 1 extra any-colour raw, discarded alongside; validate BEFORE mutation.
  const surcharge = famishedSurcharge(card);
  const extraFuelIds = cmd.extraFuelIds ?? [];
  if (extraFuelIds.length !== surcharge) {
    throw new Error('illegal: famished scrap needs exactly one extra raw');
  }
  if (new Set(extraFuelIds).size !== extraFuelIds.length || extraFuelIds.includes(card.id)
      || extraFuelIds.some((id) => cmd.mergeCardIds?.includes(id))) {
    throw new Error('illegal: extra fuel must be distinct from the scrapped card and any merge cards');
  }
  const extraFuel = extraFuelIds.map((id) => findCard(cs.hand, id));
  if (!extraFuel.every((f) => f.kind === 'raw')) throw new Error('illegal: extra fuel must be a raw');
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
  for (const f of extraFuel) { removeCard(cs.hand, f.id); cs.discardPile.push(f); }
  events.push({ type: 'scrap', text: `Scrapped a ${card.colour} ${card.value}.`, data: { cardId: card.id } });
  switch (card.colour) {
    case 'red': dealToEnemy(cs, cmd.targetEnemyId!, 1, events); break;
    case 'yellow': gainBlock(cs, 1); break;
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
  plagueTouch(forged, cards, cs.plagueAura);
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
  if (cs.struggles.includes('empty-stores')) {
    throw new Error('illegal: hail mary is disabled (empty stores)');
  }
  if (cmd.cardIds.length !== CONFIG.hailMaryBurn) throw new Error('illegal: hail mary burns exactly 3');
  if (new Set(cmd.cardIds).size !== cmd.cardIds.length) throw new Error('illegal: hail mary needs distinct raws');
  const cards = cmd.cardIds.map((id) => findCard(cs.hand, id));
  if (!cards.every((c) => c.kind === 'raw')) throw new Error('illegal: hail mary burns raws');
  if (!livingEnemy(cs, cmd.targetEnemyId)) throw new Error('illegal: hail mary needs a living target');
  for (const id of cmd.cardIds) removeCard(cs.hand, id); // burned: gone from the run
  events.push({ type: 'burn', text: 'Three raws burn for one desperate strike.' });
  dealToEnemy(cs, cmd.targetEnemyId, CONFIG.hailMaryDamage, events);
}

function doActivate(
  cs: CombatState, rng: Rng, idGen: IdGen,
  cmd: Extract<CombatCommand, { type: 'activate' }>, events: GameEvent[],
): void {
  const card = findCard(cs.hand, cmd.cardId);
  if (card.kind !== 'forged') throw new Error('illegal: only forged cards activate');
  if (cs.activatedThisRound.includes(card.id)) throw new Error('illegal: already activated this round');
  const def = elementDef(card.defId);
  const elements = card.colours.map((c) => COLOUR_ELEMENT[c]);
  if (elements.some((e) => cs.lockedElements.includes(e))) throw new Error('illegal: element locked');
  // fuel — strict colour matching (spec §3.2); famished adds a surcharge that may be any raw colour.
  // Validate fuel and every atom's prerequisites BEFORE paying fuel or mutating anything:
  // rejection must leave state untouched.
  // fevered: the first activation each round (activatedThisRound still empty) costs
  // +1 any-colour fuel, additive with the famished surcharge; reset alongside it in endTurn.
  const feveredSurcharge = cs.struggles.includes('fevered') && cs.activatedThisRound.length === 0 ? 1 : 0;
  const cost = def.fuelCost + famishedSurcharge(card) + feveredSurcharge;
  if (cmd.fuelIds.length !== cost) throw new Error(`illegal: fuel count ${cmd.fuelIds.length} ≠ ${cost}`);
  if (new Set(cmd.fuelIds).size !== cmd.fuelIds.length) throw new Error('illegal: fuel cards must be distinct');
  const fuel = cmd.fuelIds.map((id) => findCard(cs.hand, id));
  if (!fuel.every((f) => f.kind === 'raw')) throw new Error('illegal: fuel must be raws');
  const matched = fuel.filter((f) => f.kind === 'raw' && card.colours.includes(f.colour)).length;
  if (matched < def.fuelCost) {
    throw new Error('illegal: fuel must be raws matching the card colours');
  }
  assertAtomsRunnable(cs, def.onActivate, cmd);
  for (const f of fuel) { removeCard(cs.hand, f.id); cs.discardPile.push(f); }
  events.push({ type: 'activate', text: `${def.name} awakens.`, data: { defId: def.id } });
  runAtoms(cs, rng, idGen, card, def.onActivate, cmd, events);
  cs.activatedThisRound.push(card.id);
  cs.activationCounts[card.defId] = (cs.activationCounts[card.defId] ?? 0) + 1;
  onActivated(cs, rng, idGen, card, events);
}

// Pre-validation pass: throws 'illegal: ...' for any atom whose prerequisites aren't met,
// before fuel is paid or anything is mutated. runAtoms then executes assuming validity.
function assertAtomsRunnable(
  cs: CombatState, atoms: Atom[], cmd: Extract<CombatCommand, { type: 'activate' }>,
): void {
  for (const atom of atoms) {
    switch (atom.op) {
      case 'damage':
        if (!livingEnemy(cs, cmd.targetEnemyId)) throw new Error('illegal: damage needs a living target');
        break;
      case 'attach': {
        const target = findCard(cs.hand, cmd.cardId) as ForgedCard;
        const def = elementDef(target.defId);
        if (!def.defender && !livingEnemy(cs, cmd.targetEnemyId)) {
          throw new Error('illegal: attach needs a living target');
        }
        break;
      }
      case 'decombine': {
        if (!cmd.decombineTargetId) throw new Error('illegal: decombine needs a target card');
        const target = cs.hand.find((c) => c.id === cmd.decombineTargetId);
        if (!target || target.kind !== 'forged') {
          throw new Error('illegal: decombine target must be a forged card in hand');
        }
        if (!cmd.burnConstituentId || !target.constituents.some((c) => c.id === cmd.burnConstituentId)) {
          throw new Error('illegal: burnConstituentId must be a constituent of the decombine target');
        }
        break;
      }
      case 'discard': {
        const ids = cmd.discardIds ?? [];
        if (ids.length !== atom.amount || new Set(ids).size !== ids.length
            || !ids.every((id) => cs.hand.some((c) => c.id === id))) {
          throw new Error('illegal: discard needs exactly the right discardIds present in hand');
        }
        // fuel is paid (removed from hand) between this check and the atom running,
        // so a discardId naming a fuel card would pass here yet be gone at execution
        if (ids.some((id) => cmd.fuelIds.includes(id))) {
          throw new Error('illegal: discardIds cannot overlap fuelIds');
        }
        break;
      }
      default: break;
    }
  }
}

function runAtoms(
  cs: CombatState, rng: Rng, idGen: IdGen, card: ForgedCard, atoms: Atom[],
  cmd: Extract<CombatCommand, { type: 'activate' }>, events: GameEvent[],
): void {
  const def = elementDef(card.defId);
  for (const atom of atoms) {
    switch (atom.op) {
      case 'damage': {
        dealToEnemy(
          cs, cmd.targetEnemyId!, scarAdjust(card, atom.amount), events,
          card.defId === 'smoke' ? 'smoke' : undefined,
        );
        break;
      }
      case 'draw': drawCards(cs, rng, idGen, scarAdjust(card, atom.amount), events, card); break;
      case 'block': gainBlock(cs, scarAdjust(card, atom.amount)); break;
      case 'attach': {
        removeCard(cs.hand, card.id);
        cs.attachedCards.push(card);
        if (def.defender) {
          cs.defenders.push({ cardId: card.id, defId: card.defId, hp: def.defender.health });
        } else {
          const enemy = cs.enemies.find((e) => e.id === cmd.targetEnemyId)!;
          enemy.attachments.push({ cardId: card.id, defId: card.defId });
        }
        break;
      }
      case 'decombine': {
        const target = findCard(cs.hand, cmd.decombineTargetId!) as ForgedCard;
        const { returned } = unmerge(target, cmd.burnConstituentId!);
        removeCard(cs.hand, target.id);
        cs.hand.push(...returned);
        events.push({ type: 'decombine', text: `${target.defId} comes apart.`, data: { cardId: target.id } });
        break;
      }
      case 'discard': {
        for (const id of cmd.discardIds!) { cs.discardPile.push(removeCard(cs.hand, id)); }
        break;
      }
      case 'charge': cs.charges[card.defId] = (cs.charges[card.defId] ?? 0) + 1; break;
      case 'freeMerge': cs.freeMerges += 1; break;
    }
  }
}

function doFreeDecombine(
  cs: CombatState, cmd: Extract<CombatCommand, { type: 'decombine' }>, events: GameEvent[],
): void {
  if (cs.freeDecombines <= 0) throw new Error('illegal: no free decombine');
  const target = findCard(cs.hand, cmd.cardId);
  if (target.kind !== 'forged') throw new Error('illegal: decombine targets forged cards');
  if (!cmd.burnConstituentId) throw new Error('illegal: decombine needs burnConstituentId');
  const { returned } = unmerge(target, cmd.burnConstituentId);
  removeCard(cs.hand, target.id);
  cs.hand.push(...returned);
  cs.freeDecombines -= 1;
  events.push({ type: 'decombine', text: `${target.defId} comes apart.`, data: { cardId: target.id } });
}
