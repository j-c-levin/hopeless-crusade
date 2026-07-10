// Task 18: a deterministic, greedy bot. It is a pure function of the run state — no
// Math.random anywhere. Any "random" choice the game itself makes still flows through the
// run's own rng, driven only by the commands issued here. Ties are always broken by array
// order (whatever appears first in the relevant list wins).
import { CONFIG } from '../content/config';
import { RELICS } from '../content/relics';
import { elementDef } from '../content/elements';
import { findCard, isForged, isRaw } from '../core/cards';
import { lowestHpEnemy, type CombatCommand } from '../core/combat';
import { tier3DefId } from '../core/forge';
import { nodesInColumn } from '../core/map';
import { famishedSurcharge, isScrapBlocked } from '../core/marks';
import type { RunCommand, RunState } from '../core/run';
import { COLOUR_ELEMENT, ELEMENT_COLOUR } from '../core/types';
import type { Card, Colour, CombatState, Element, ForgedCard, RawCard } from '../core/types';

const COLOURS: Colour[] = ['red', 'yellow', 'blue', 'green'];
const MERGE_TOTALS = [7, 8, 9] as const;

export function botCommand(run: RunState): RunCommand {
  switch (run.phase) {
    case 'originDraft': return originDraftCommand(run);
    case 'map': return mapCommand(run);
    case 'strugglePick': return struggleCommand(run);
    case 'combat': return combatBotCommand(run);
    case 'rewards': return rewardsCommand(run);
    case 'forgeWindow': return forgeWindowCommand(run);
    default:
      // originDraft..forgeWindow are the only phases with a legal command to give; victory
      // and defeat are terminal and simulate.ts stops driving the bot before reaching here.
      throw new Error(`botCommand: no legal command in phase ${run.phase}`);
  }
}

// ---- originDraft / map / strugglePick ------------------------------------

function originDraftCommand(run: RunState): RunCommand {
  return { type: 'chooseOrigin', defId: run.originOptions![0]! };
}

function mapCommand(run: RunState): RunCommand {
  const nextColumn = (run.map.position ?? -1) + 1;
  const nodes = nodesInColumn(run.map.current, nextColumn);
  return { type: 'moveTo', nodeId: nodes[0]!.id };
}

function struggleCommand(run: RunState): RunCommand {
  const opts = run.struggleOptions!;
  if (opts.chosen.length < opts.pick) {
    const next = opts.options.find((o) => !opts.chosen.includes(o.id));
    if (next) return { type: 'toggleStruggle', id: next.id };
  }
  return { type: 'confirmStruggles' };
}

// ---- combat ---------------------------------------------------------------

// blue-scrap is capped at one per round (unlike red/yellow, which drain fully) to avoid the
// bot chewing through the whole draw pile drawing-into-blue chains each round. Keyed by the
// CombatState object identity, which is stable for the life of one fight and unreachable
// (and so harmlessly collected) once the fight ends — this does not affect determinism since
// the sequence of CombatState objects and rounds visited is itself a deterministic function
// of the seed and the (also deterministic) commands issued so far.
const blueScrapRounds = new WeakMap<CombatState, number>();

function combatBotCommand(run: RunState): RunCommand {
  const cs = run.combat!;

  if (cs.pendingChoice) {
    const opts = cs.pendingChoice.options;
    const pay = opts.find((o) => o.id === 'pay');
    return { type: 'combat', cmd: { type: 'resolveChoice', optionId: (pay ?? opts[0]!).id } };
  }

  const activate = findActivateCommand(cs);
  if (activate) return { type: 'combat', cmd: activate };

  if (!cs.scrapSealed) {
    const green = findGreenScrapCommand(cs);
    if (green) return { type: 'combat', cmd: green };
    const red = findRedScrapCommand(cs);
    if (red) return { type: 'combat', cmd: red };
    const yellow = findYellowScrapCommand(cs);
    if (yellow) return { type: 'combat', cmd: yellow };
    const blue = findBlueScrapCommand(cs);
    if (blue) return { type: 'combat', cmd: blue };
  }

  return { type: 'combat', cmd: { type: 'endTurn' } };
}

function isFreeScrappable(c: Card): c is RawCard {
  return isRaw(c) && !isScrapBlocked(c) && !c.marks.famished;
}

// Deterministic backtracking subset-sum search (same shape as run.ts's internal helper),
// over whatever order the caller hands in — "first legal merge" is decided by that order.
function findSubsetSumming(cards: RawCard[], target: number): RawCard[] | null {
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

function findGreenScrapCommand(cs: CombatState): CombatCommand | null {
  const greens = cs.hand.filter((c) => isFreeScrappable(c) && c.colour === 'green') as RawCard[];
  for (const g of greens) {
    for (const colour of COLOURS) {
      const pool = cs.hand.filter(
        (c) => isFreeScrappable(c) && c.colour === colour && c.id !== g.id,
      ) as RawCard[];
      for (const total of MERGE_TOTALS) {
        const subset = findSubsetSumming(pool, total);
        if (subset && subset.length > 0) {
          return { type: 'scrap', cardId: g.id, mergeCardIds: subset.map((c) => c.id) };
        }
      }
    }
  }
  return null;
}

function findRedScrapCommand(cs: CombatState): CombatCommand | null {
  const red = cs.hand.find((c) => isFreeScrappable(c) && c.colour === 'red');
  if (!red) return null;
  const target = lowestHpEnemy(cs);
  if (!target) return null;
  return { type: 'scrap', cardId: red.id, targetEnemyId: target.id };
}

function findYellowScrapCommand(cs: CombatState): CombatCommand | null {
  const yellow = cs.hand.find((c) => isFreeScrappable(c) && c.colour === 'yellow');
  if (!yellow) return null;
  return { type: 'scrap', cardId: yellow.id };
}

function findBlueScrapCommand(cs: CombatState): CombatCommand | null {
  if (blueScrapRounds.get(cs) === cs.round) return null;
  const blue = cs.hand.find((c) => isFreeScrappable(c) && c.colour === 'blue');
  if (!blue) return null;
  blueScrapRounds.set(cs, cs.round);
  return { type: 'scrap', cardId: blue.id };
}

// Skips defs whose atoms need decombine/discard entirely (kept simple, per the bot policy),
// and mirrors combat.ts's own doActivate validation exactly so the command it builds is legal.
function tryBuildActivate(cs: CombatState, card: ForgedCard): CombatCommand | null {
  if (cs.activatedThisRound.includes(card.id)) return null;
  const def = elementDef(card.defId);
  if (def.onActivate.some((a) => a.op === 'decombine' || a.op === 'discard')) return null;

  const elements = card.colours.map((c) => COLOUR_ELEMENT[c]);
  if (elements.some((e) => cs.lockedElements.includes(e))) return null;

  const famished = famishedSurcharge(card);
  const fevered = cs.struggles.includes('fevered') && cs.activatedThisRound.length === 0 ? 1 : 0;
  const emberheartDiscount = cs.relics.includes('emberheart') && !cs.emberheartUsed
    && card.colours.includes(ELEMENT_COLOUR.fire) ? 1 : 0;
  const requiredFuelCost = Math.max(0, def.fuelCost - emberheartDiscount);
  const cost = requiredFuelCost + famished + fevered;

  const handRaws = cs.hand.filter(isRaw);
  const matching = handRaws.filter((r) => card.colours.includes(r.colour));
  if (matching.length < requiredFuelCost) return null;
  const chosenMatching = matching.slice(0, requiredFuelCost);
  const usedIds = new Set(chosenMatching.map((c) => c.id));
  const remainingNeeded = cost - requiredFuelCost;
  const others = handRaws.filter((r) => !usedIds.has(r.id));
  if (others.length < remainingNeeded) return null;
  const extra = others.slice(0, remainingNeeded);
  const fuelIds = [...chosenMatching, ...extra].map((c) => c.id);

  const needsTarget = def.onActivate.some(
    (a) => a.op === 'damage' || (a.op === 'attach' && !def.defender),
  );
  let targetEnemyId: string | undefined;
  if (needsTarget) {
    const target = lowestHpEnemy(cs);
    if (!target) return null;
    targetEnemyId = target.id;
  }
  return { type: 'activate', cardId: card.id, fuelIds, targetEnemyId };
}

function findActivateCommand(cs: CombatState): CombatCommand | null {
  for (const card of cs.hand) {
    if (!isForged(card)) continue;
    const cmd = tryBuildActivate(cs, card);
    if (cmd) return cmd;
  }
  return null;
}

// ---- rewards ----------------------------------------------------------------

// RunState doesn't persist which origin element was drafted, so this approximates it: the
// earliest-minted forged card still in the deck (smallest numeric suffix on its 'f<n>' id) is,
// in the overwhelming majority of runs, the origin forging itself (or a direct descendant of
// it) — good enough for a heuristic "buy relics matching my element" policy.
function originElement(run: RunState): Element | undefined {
  const forged = run.deck.filter(isForged);
  const numbered = forged
    .map((c) => ({ c, n: Number(c.id.replace(/^\D+/, '')) }))
    .filter((x) => Number.isFinite(x.n));
  if (numbered.length === 0) return undefined;
  const earliest = numbered.reduce((a, b) => (b.n < a.n ? b : a)).c;
  const colour = earliest.colours[0];
  return colour ? COLOUR_ELEMENT[colour] : undefined;
}

function findRelicToBuy(run: RunState): string | null {
  if (run.rewardPoints < CONFIG.relicCost) return null;
  const element = originElement(run);
  const candidates = Object.values(RELICS).filter(
    (r) => !run.relics.includes(r.id) && (element === undefined || r.element === element),
  );
  return candidates[0]?.id ?? null;
}

function rewardsCommand(run: RunState): RunCommand {
  // Buying happens before any suit is spent — the last suit spend auto-opens the forge
  // window, so a relic purchase must never be queued behind it.
  const relicId = findRelicToBuy(run);
  if (relicId) return { type: 'buyRelic', id: relicId };

  const suit = run.pendingRewards!.suitChoices[0]!;
  switch (suit) {
    case 'hearts':
      return {
        type: 'reward', suitIndex: 0,
        cmd: run.hp < 12 ? { type: 'heal' } : { type: 'skip' },
      };
    case 'spades': {
      const corruption = run.deck.find((c) => c.kind === 'corruption');
      return {
        type: 'reward', suitIndex: 0,
        cmd: corruption ? { type: 'burnCard', cardId: corruption.id } : { type: 'skip' },
      };
    }
    case 'clubs':
      return { type: 'reward', suitIndex: 0, cmd: { type: 'handSize' } };
    case 'diamonds':
    default:
      return { type: 'reward', suitIndex: 0, cmd: { type: 'skip' } };
  }
}

// ---- forgeWindow ------------------------------------------------------------

function findWindowTier2Merge(run: RunState): string[] | null {
  const win = run.window!;
  const slotRaws = win.slotIds.map((id) => findCard(run.deck, id)).filter(isRaw);
  for (const colour of COLOURS) {
    const pool = slotRaws.filter((c) => c.colour === colour);
    for (const total of MERGE_TOTALS) {
      const subset = findSubsetSumming(pool, total);
      if (subset && subset.length > 0) return subset.map((c) => c.id);
    }
  }
  return null;
}

function findTier2ForgedPair(run: RunState): [string, string] | null {
  const forged = run.deck.filter((c): c is ForgedCard => c.kind === 'forged' && c.tier === 2);
  for (let i = 0; i < forged.length; i++) {
    for (let j = i + 1; j < forged.length; j++) {
      if (tier3DefId(forged[i]!, forged[j]!)) return [forged[i]!.id, forged[j]!.id];
    }
  }
  return null;
}

function forgeWindowCommand(run: RunState): RunCommand {
  const tier2 = findWindowTier2Merge(run);
  if (tier2) return { type: 'windowMerge', cardIds: tier2 };
  const tier3 = findTier2ForgedPair(run);
  if (tier3) return { type: 'windowMerge', cardIds: tier3 };
  return { type: 'closeWindow' };
}
