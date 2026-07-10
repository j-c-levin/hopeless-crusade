import { CONFIG } from '../content/config';
import { RELICS } from '../content/relics';
import { dealStruggleChoices, type StruggleDef } from '../content/struggles';
import { findCard, isRaw, makeStartingDeck, nextId, removeCard, type IdGen } from './cards';
import { combatCommand, startCombat, type CombatCommand } from './combat';
import { makeCorruptionCard } from './corruption';
import { forgeTier2 } from './forge';
import { openWindow, windowMerge, windowReroll, windowUnmerge, type ForgeWindow } from './forgewindow';
import {
  advance, enemySpecsFor, newCampaign, onLevelCleared, scoutCost,
  type CampaignMap, type MapNode,
} from './map';
import { cleanse } from './marks';
import { computeRewards, type PendingRewards, type RewardCommand } from './rewards';
import { Rng } from './rng';
import {
  ELEMENT_COLOUR, type Card, type CombatState, type Element, type GameEvent, type RawCard, type Suit,
} from './types';

export type Phase = 'originDraft' | 'map' | 'strugglePick' | 'combat'
  | 'rewards' | 'forgeWindow' | 'victory' | 'defeat';

export interface RunState {
  phase: Phase;
  seed: number; rngState: number; idGen: IdGen;
  hp: number; deck: Card[];                     // every player card (raw/forged/corruption)
  relics: string[]; rewardPoints: number;
  scoutTokens: number; rerollTokens: number; widenTokens: number;
  nextHandBonus: number;                        // clubs reward, consumed by next fight
  struggleRelief: number;                       // "reduced struggles" reward purchases; consumed by moveTo
  tutoredIds: string[];                         // diamonds "tutor" reward: surfaced atop the next combat draw pile
  map: CampaignMap;
  originOptions?: string[];                     // three tier-2 defIds
  struggleOptions?: { options: StruggleDef[]; pick: number; chosen: string[] };
  combat?: CombatState;
  pendingRewards?: PendingRewards;
  window?: ForgeWindow;
  log: GameEvent[];
}

export type RunCommand =
  | { type: 'chooseOrigin'; defId: string }
  | { type: 'moveTo'; nodeId: string }
  | { type: 'scout'; nodeId: string }
  | { type: 'toggleStruggle'; id: string } | { type: 'confirmStruggles' }
  | { type: 'combat'; cmd: CombatCommand }
  | { type: 'reward'; suitIndex: number; cmd: RewardCommand }
  | { type: 'buyRelic'; id: string } | { type: 'buyReducedStruggles' }
  | { type: 'windowMerge'; cardIds: string[] } | { type: 'windowUnmerge'; cardId: string; burnConstituentId: string }
  | { type: 'windowReroll' } | { type: 'closeWindow' };

const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const TOTALS = [7, 8, 9] as const;

function allTier2DefIds(): string[] {
  const out: string[] = [];
  for (const e of ELEMENTS) for (const t of TOTALS) out.push(`${e}-${t}`);
  return out;
}

export function newRun(seed: number): RunState {
  const idGen: IdGen = { n: 0 };
  const rng = new Rng(seed);
  const deck: Card[] = makeStartingDeck(idGen);
  const map = newCampaign(rng);
  const originOptions = rng.shuffle(allTier2DefIds()).slice(0, 3);
  return {
    phase: 'originDraft',
    seed, rngState: rng.state, idGen,
    hp: CONFIG.startingHp, deck,
    relics: [], rewardPoints: 0,
    scoutTokens: 0, rerollTokens: 0, widenTokens: 0,
    nextHandBonus: 0,
    struggleRelief: 0, tutoredIds: [],
    map,
    originOptions,
    log: [],
  };
}

// Deterministic backtracking subset-sum search over a (caller-shuffled) list of raws.
// Always succeeds when called against a fresh starting deck's colour bucket for a 7/8/9 target.
function findSubsetSummingTo(cards: RawCard[], target: number): RawCard[] | null {
  function rec(idx: number, remaining: number): RawCard[] | null {
    if (remaining === 0) return [];
    if (idx >= cards.length || remaining < 0) return null;
    const card = cards[idx]!;
    const withIt = rec(idx + 1, remaining - card.value);
    if (withIt) return [card, ...withIt];
    return rec(idx + 1, remaining);
  }
  return rec(0, target);
}

function currentNode(run: RunState): MapNode {
  const node = run.map.current.nodes.find((n) => n.id === run.map.chosenNode);
  if (!node) throw new Error('illegal: no current node');
  return node;
}

// Starts combat: applies the corruption ratchet, resets the hand-size bonus, consumes any
// tutored cards onto the top of the fresh draw pile, and flips phase -> 'combat'.
function beginCombat(run: RunState, node: MapNode, struggleIds: string[]): GameEvent[] {
  const events: GameEvent[] = [];
  const rng = new Rng(run.rngState);
  const specs = enemySpecsFor(node);
  for (const spec of specs) {
    const n = CONFIG.corruptionInjection[spec.rank] ?? 0;
    for (let i = 0; i < n; i++) {
      run.deck.push(makeCorruptionCard(run.idGen, spec.suit, spec.rank));
    }
    if (n > 0) {
      events.push({
        type: 'corruption-injected', text: `${n} ${spec.suit} corruption seeps in.`,
        data: { suit: spec.suit, rank: spec.rank, count: n },
      });
    }
  }
  const handSize = CONFIG.handSize + run.nextHandBonus;
  run.nextHandBonus = 0;
  const combatDeck = [...run.deck];
  const cs = startCombat({
    deck: combatDeck, hp: run.hp, handSize,
    enemies: specs, struggles: struggleIds, relics: run.relics,
    rng, idGen: run.idGen,
    topIds: run.tutoredIds, // consumed: surfaced atop the draw pile before the opening draw
  });
  run.tutoredIds = [];
  run.combat = cs;
  run.phase = 'combat';
  run.rngState = rng.state;
  resolveCombatOutcome(run); // the opening draw can itself already end the fight (rare corruption swing)
  return events;
}

// Shared by beginCombat (the opening draw can itself resolve a fight via a corruption trigger)
// and the 'combat' command proxy: whenever combat.outcome flips away from 'ongoing', react.
function resolveCombatOutcome(run: RunState): void {
  const combat = run.combat!;
  if (combat.outcome === 'lost') {
    run.phase = 'defeat';
  } else if (combat.outcome === 'won') {
    const node = currentNode(run);
    run.hp = combat.hp;
    run.deck = [...combat.drawPile, ...combat.discardPile, ...combat.hand, ...combat.attachedCards];
    const rewards = computeRewards(enemySpecsFor(node));
    run.pendingRewards = rewards;
    run.rewardPoints += rewards.points;
    run.phase = 'rewards';
  }
}

function openForgeWindowPhase(run: RunState): void {
  const rng = new Rng(run.rngState);
  const size = CONFIG.forgeWindowSize + run.widenTokens * CONFIG.windowWidenAmount;
  const rerolls = run.rerollTokens;
  run.window = openWindow(run.deck, rng, size, rerolls);
  run.widenTokens = 0;
  run.rerollTokens = 0;
  run.pendingRewards = undefined;
  run.phase = 'forgeWindow';
  run.rngState = rng.state;
}

// Suit -> reward-command menu (spec §7); 'skip' is always legal regardless of suit.
function suitAllows(suit: Suit, type: RewardCommand['type']): boolean {
  if (type === 'skip') return true;
  switch (suit) {
    case 'hearts': return type === 'heal';
    case 'spades': return type === 'burnCard' || type === 'cleanse';
    case 'diamonds':
      return type === 'scoutToken' || type === 'rerollToken' || type === 'widenToken' || type === 'tutor';
    case 'clubs': return type === 'handSize';
    default: return false;
  }
}

function applyRewardCmd(run: RunState, cmd: RewardCommand, events: GameEvent[]): void {
  switch (cmd.type) {
    case 'heal':
      run.hp = Math.min(CONFIG.startingHp, run.hp + CONFIG.healAmount);
      events.push({ type: 'heal', text: `Healed ${CONFIG.healAmount}.`, data: { amount: CONFIG.healAmount } });
      break;
    case 'burnCard':
      removeCard(run.deck, cmd.cardId); // throws before any mutation if not found
      events.push({ type: 'burn', text: 'A card is burned from the run.', data: { cardId: cmd.cardId } });
      break;
    case 'cleanse': {
      const card = findCard(run.deck, cmd.cardId); // throws if not found
      cleanse(card, cmd.mark, events);
      break;
    }
    case 'scoutToken': run.scoutTokens += 1; break;
    case 'rerollToken': run.rerollTokens += 1; break;
    case 'widenToken': run.widenTokens += 1; break;
    case 'tutor':
      findCard(run.deck, cmd.cardId); // validate it exists before queuing it
      run.tutoredIds.push(cmd.cardId);
      break;
    case 'handSize': run.nextHandBonus += 1; break;
    case 'skip': break;
    default: break;
  }
}

export function runCommand(run: RunState, cmd: RunCommand): GameEvent[] {
  const events: GameEvent[] = [];
  switch (cmd.type) {
    case 'chooseOrigin': {
      if (run.phase !== 'originDraft' || !run.originOptions) throw new Error('illegal: not in origin draft');
      if (!run.originOptions.includes(cmd.defId)) throw new Error('illegal: not an offered origin');
      const [elementStr, totalStr] = cmd.defId.split('-');
      const element = elementStr as Element;
      const total = Number(totalStr);
      const colour = ELEMENT_COLOUR[element];
      const rng = new Rng(run.rngState);
      const colourRaws = run.deck.filter(isRaw).filter((c) => c.colour === colour);
      const shuffled = rng.shuffle(colourRaws);
      const chosen = findSubsetSummingTo(shuffled, total);
      if (!chosen) throw new Error('illegal: no raw subset sums to the origin target');
      for (const c of chosen) removeCard(run.deck, c.id);
      const forged = forgeTier2(chosen, nextId(run.idGen, 'f'));
      run.deck.push(forged);
      const corruptionSuit = run.map.domainOrder[0]!;
      for (let i = 0; i < CONFIG.startingCorruption; i++) {
        run.deck.push(makeCorruptionCard(run.idGen, corruptionSuit, 'tower'));
      }
      run.originOptions = undefined;
      run.phase = 'map';
      run.rngState = rng.state;
      events.push({ type: 'origin', text: `Forged the ${cmd.defId} origin.`, data: { defId: cmd.defId } });
      break;
    }

    case 'moveTo': {
      if (run.phase !== 'map') throw new Error('illegal: not in map phase');
      const node = advance(run.map, cmd.nodeId); // throws before mutation on illegal moves
      const rng = new Rng(run.rngState);
      const specs = enemySpecsFor(node);
      const rawCount = Math.max(...specs.map((s) => CONFIG.strugglesByRank[s.rank] ?? 0));
      const count = Math.max(0, rawCount - run.struggleRelief);
      run.struggleRelief = 0; // consumed by this move
      if (count === 0) {
        // no rng consumed on this path — beginCombat reconstructs from run.rngState itself
        events.push(...beginCombat(run, node, []));
      } else {
        const dealt = dealStruggleChoices(rng, run.map.current.domain, count);
        run.struggleOptions = { options: dealt.options, pick: dealt.pick, chosen: [] };
        run.phase = 'strugglePick';
        run.rngState = rng.state;
      }
      break;
    }

    case 'scout': {
      if (run.phase !== 'map') throw new Error('illegal: not in map phase');
      const node = run.map.current.nodes.find((n) => n.id === cmd.nodeId);
      if (!node) throw new Error('illegal: no such node');
      const cost = scoutCost(run.map, node);
      if (run.scoutTokens < cost) throw new Error('illegal: insufficient scout tokens');
      run.scoutTokens -= cost;
      node.revealed = true;
      break;
    }

    case 'toggleStruggle': {
      if (run.phase !== 'strugglePick' || !run.struggleOptions) throw new Error('illegal: not in struggle pick');
      const opts = run.struggleOptions;
      if (!opts.options.some((o) => o.id === cmd.id)) throw new Error('illegal: unknown struggle option');
      if (opts.chosen.includes(cmd.id)) {
        opts.chosen = opts.chosen.filter((x) => x !== cmd.id);
      } else {
        if (opts.chosen.length >= opts.pick) throw new Error('illegal: already picked enough struggles');
        opts.chosen.push(cmd.id);
      }
      break;
    }

    case 'confirmStruggles': {
      if (run.phase !== 'strugglePick' || !run.struggleOptions) throw new Error('illegal: not in struggle pick');
      if (run.struggleOptions.chosen.length !== run.struggleOptions.pick) {
        throw new Error('illegal: must choose exactly the required number of struggles');
      }
      const node = currentNode(run);
      const ids = run.struggleOptions.chosen;
      run.struggleOptions = undefined;
      events.push(...beginCombat(run, node, ids));
      break;
    }

    case 'combat': {
      if (run.phase !== 'combat' || !run.combat) throw new Error('illegal: not in combat');
      const rng = new Rng(run.rngState);
      events.push(...combatCommand(run.combat, rng, run.idGen, cmd.cmd));
      run.rngState = rng.state;
      resolveCombatOutcome(run);
      break;
    }

    case 'reward': {
      if (run.phase !== 'rewards' || !run.pendingRewards) throw new Error('illegal: not in rewards phase');
      const suit = run.pendingRewards.suitChoices[cmd.suitIndex];
      if (suit === undefined) throw new Error('illegal: invalid suit choice index');
      if (!suitAllows(suit, cmd.cmd.type)) throw new Error('illegal: reward command does not match this suit');
      applyRewardCmd(run, cmd.cmd, events);
      run.pendingRewards.suitChoices.splice(cmd.suitIndex, 1);
      if (run.pendingRewards.suitChoices.length === 0) {
        openForgeWindowPhase(run);
      }
      break;
    }

    case 'buyRelic': {
      if (run.phase !== 'rewards') throw new Error('illegal: not in rewards phase');
      if (!RELICS[cmd.id]) throw new Error('illegal: unknown relic');
      if (run.relics.includes(cmd.id)) throw new Error('illegal: relic already owned');
      if (run.rewardPoints < CONFIG.relicCost) throw new Error('illegal: insufficient reward points');
      run.rewardPoints -= CONFIG.relicCost;
      run.relics.push(cmd.id);
      events.push({ type: 'relic-bought', text: `Bought ${cmd.id}.`, data: { relic: cmd.id } });
      break;
    }

    case 'buyReducedStruggles': {
      if (run.phase !== 'rewards') throw new Error('illegal: not in rewards phase');
      if (run.rewardPoints < CONFIG.reducedStrugglesCost) throw new Error('illegal: insufficient reward points');
      run.rewardPoints -= CONFIG.reducedStrugglesCost;
      run.struggleRelief += 1;
      events.push({ type: 'reduced-struggles-bought', text: 'Bought a reduced struggle.' });
      break;
    }

    case 'windowMerge': {
      if (run.phase !== 'forgeWindow' || !run.window) throw new Error('illegal: not in forge window');
      windowMerge(run.deck, run.window, run.idGen, cmd.cardIds, events);
      break;
    }

    case 'windowUnmerge': {
      if (run.phase !== 'forgeWindow') throw new Error('illegal: not in forge window');
      windowUnmerge(run.deck, run.idGen, cmd.cardId, cmd.burnConstituentId, events);
      break;
    }

    case 'windowReroll': {
      if (run.phase !== 'forgeWindow' || !run.window) throw new Error('illegal: not in forge window');
      const rng = new Rng(run.rngState);
      windowReroll(run.deck, run.window, rng);
      run.rngState = rng.state;
      break;
    }

    case 'closeWindow': {
      if (run.phase !== 'forgeWindow') throw new Error('illegal: not in forge window');
      if (!run.window) throw new Error('illegal: no window open');
      const node = currentNode(run);
      const isBoss = node.column === run.map.current.columns - 1;
      run.window = undefined;
      run.combat = undefined;
      run.pendingRewards = undefined;
      if (isBoss) {
        const rng = new Rng(run.rngState);
        const result = onLevelCleared(run.map, rng);
        run.rngState = rng.state;
        run.phase = result === 'victory' ? 'victory' : 'map';
      } else {
        run.phase = 'map';
      }
      break;
    }

    default: break;
  }
  run.log.push(...events);
  return events;
}

export function serialize(run: RunState): string {
  return JSON.stringify(run);
}

export function deserialize(json: string): RunState {
  return JSON.parse(json) as RunState;
}
