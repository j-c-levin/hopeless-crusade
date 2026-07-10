import { elementDef } from '../content/elements';
import { isForged, isRaw } from '../core/cards';
import { PAIR_DEF } from '../core/forge';
import { COLOUR_ELEMENT, ELEMENT_COLOUR } from '../core/types';
import type { Card, Colour, Element } from '../core/types';

/**
 * The forge forecast: for every tier-2 and tier-3 def, "can the player still get there from
 * here" — the visible-narrowing panel that's the emotional core of the forge loop (design spec
 * §9.4). Pure function of a card list; `proposedMergeIds` lets a caller ask "what would this
 * look like if these cards were spent" without touching the real deck.
 */
export interface Forecast {
  tier2: { defId: string; reachable: boolean }[];   // all 12 variants (fire-7..water-9)
  tier3: { defId: string; reachable: boolean }[];    // all 10
  fuel: { colour: Colour; raws: number; forgedNeedingIt: number }[];
  warnings: string[];
}

const COLOURS: Colour[] = ['red', 'yellow', 'blue', 'green'];
const ELEMENTS: Element[] = ['fire', 'earth', 'air', 'water'];
const TOTALS = [7, 8, 9] as const;

// PAIR_DEF is keyed 'elemA+elemB' (sorted) -> defId; invert it once so tier-3 reachability can
// look up "which two elements (possibly the same element twice, e.g. wind = air+air) does this
// defId need".
const TIER3_ELEMENTS: Record<string, [Element, Element]> = {};
for (const [key, defId] of Object.entries(PAIR_DEF)) {
  const [a, b] = key.split('+') as [Element, Element];
  TIER3_ELEMENTS[defId] = [a, b];
}

// Subset-sum DP over sums 0..9 for a single colour's raw values: reachable[s] is true iff some
// subset of `values` sums to exactly s. Values are 0-9 and there are at most 19 raws per colour
// in this game, so this is a trivial bitset DP. A value of 0 can never change any sum, so it's
// skipped (also sidesteps a zero-length inner loop edge case).
function subsetSumReachable(values: number[]): boolean[] {
  const reachable = new Array<boolean>(10).fill(false);
  reachable[0] = true;
  for (const v of values) {
    if (v <= 0) continue;
    for (let s = 9; s >= v; s--) {
      if (reachable[s - v]) reachable[s] = true;
    }
  }
  return reachable;
}

// Same idea, but tracks whether TWO disjoint subsets can simultaneously reach two (independently
// chosen) sums in 0..9 — this is what tells us a same-element tier-3 pair (wind = air+air) can be
// reached twice over purely from raws, rather than just once. dp[s1][s2] is true iff the raws
// processed so far can be split into two disjoint groups summing to s1 and s2 respectively (any
// leftover raws are simply unused). Cost is O(cards * 100), trivial at this scale.
function disjointPairSumReachable(values: number[]): boolean[][] {
  const dp: boolean[][] = Array.from({ length: 10 }, () => new Array<boolean>(10).fill(false));
  dp[0]![0] = true;
  for (const v of values) {
    if (v <= 0) continue;
    for (let s1 = 9; s1 >= 0; s1--) {
      for (let s2 = 9; s2 >= 0; s2--) {
        if (dp[s1]![s2]) continue;
        const fromBucket1 = s1 >= v && dp[s1 - v]![s2];
        const fromBucket2 = s2 >= v && dp[s1]![s2 - v];
        if (fromBucket1 || fromBucket2) dp[s1]![s2] = true;
      }
    }
  }
  return dp;
}

// How many *independent* tier-2s of this element could still be forged from raws alone: 0 (no
// total in {7,8,9} reachable), 1 (some total reachable, but not twice over from disjoint raws),
// or 2 (two disjoint subsets can each reach a total in {7,8,9} — enough for a same-element
// tier-3 pair like wind without needing an already-forged tier-2 of that element).
function rawCapacity(values: number[]): 0 | 1 | 2 {
  const single = subsetSumReachable(values);
  if (!TOTALS.some((t) => single[t])) return 0;
  const pair = disjointPairSumReachable(values);
  if (TOTALS.some((s1) => TOTALS.some((s2) => pair[s1]![s2]))) return 2;
  return 1;
}

function computeForecast(deck: Card[]): Omit<Forecast, 'warnings'> {
  const rawValuesByColour: Record<Colour, number[]> = { red: [], yellow: [], blue: [], green: [] };
  const rawCountByColour: Record<Colour, number> = { red: 0, yellow: 0, blue: 0, green: 0 };
  for (const c of deck) {
    if (isRaw(c)) {
      rawValuesByColour[c.colour].push(c.value);
      rawCountByColour[c.colour] += 1;
    }
  }

  const reachableByColour: Record<Colour, boolean[]> = {
    red: subsetSumReachable(rawValuesByColour.red),
    yellow: subsetSumReachable(rawValuesByColour.yellow),
    blue: subsetSumReachable(rawValuesByColour.blue),
    green: subsetSumReachable(rawValuesByColour.green),
  };

  const tier2: { defId: string; reachable: boolean }[] = [];
  for (const element of ELEMENTS) {
    const colour = ELEMENT_COLOUR[element];
    for (const total of TOTALS) {
      tier2.push({ defId: `${element}-${total}`, reachable: reachableByColour[colour][total]! });
    }
  }

  // Already-forged tier-2 cards in the deck count as "free" capacity toward a tier-3 pair; raws
  // contribute up to `rawCapacity` more (see its comment for the disjoint-subsets nuance).
  const forgedTier2CountByElement: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const c of deck) {
    if (isForged(c) && c.tier === 2) {
      forgedTier2CountByElement[COLOUR_ELEMENT[c.colours[0]!]] += 1;
    }
  }

  const capacity: Record<Element, number> = { fire: 0, earth: 0, air: 0, water: 0 };
  for (const element of ELEMENTS) {
    const colour = ELEMENT_COLOUR[element];
    capacity[element] = forgedTier2CountByElement[element] + rawCapacity(rawValuesByColour[colour]);
  }

  const tier3: { defId: string; reachable: boolean }[] = [];
  for (const defId of Object.values(PAIR_DEF)) {
    const [a, b] = TIER3_ELEMENTS[defId]!;
    const required = new Map<Element, number>();
    required.set(a, (required.get(a) ?? 0) + 1);
    required.set(b, (required.get(b) ?? 0) + 1);
    const reachable = [...required.entries()].every(([elem, count]) => capacity[elem] >= count);
    tier3.push({ defId, reachable });
  }

  const fuel = COLOURS.map((colour) => ({
    colour,
    raws: rawCountByColour[colour],
    forgedNeedingIt: deck.filter((c) => isForged(c) && c.colours.includes(colour)).length,
  }));

  return { tier2, tier3, fuel };
}

function pluralCards(n: number): string {
  return `${n} forged card${n === 1 ? '' : 's'}`;
}

function pluralNeed(n: number): string {
  return n === 1 ? 'needs' : 'need';
}

export function forecast(deck: Card[], proposedMergeIds?: string[]): Forecast {
  const before = computeForecast(deck);
  if (!proposedMergeIds || proposedMergeIds.length === 0) {
    return { ...before, warnings: [] };
  }

  const consumed = new Set(proposedMergeIds);
  const afterDeck = deck.filter((c) => !consumed.has(c.id));
  const after = computeForecast(afterDeck);

  const warnings: string[] = [];
  for (let i = 0; i < before.tier2.length; i++) {
    if (before.tier2[i]!.reachable && !after.tier2[i]!.reachable) {
      warnings.push(`${after.tier2[i]!.defId} would no longer be forgeable.`);
    }
  }
  for (let i = 0; i < before.tier3.length; i++) {
    if (before.tier3[i]!.reachable && !after.tier3[i]!.reachable) {
      warnings.push(`${after.tier3[i]!.defId} would no longer be forgeable.`);
    }
  }
  for (let i = 0; i < before.fuel.length; i++) {
    const b = before.fuel[i]!;
    const a = after.fuel[i]!;
    if (b.raws > 0 && a.raws === 0 && a.forgedNeedingIt > 0) {
      warnings.push(
        `This merge would leave 0 ${a.colour} raws while ${pluralCards(a.forgedNeedingIt)} `
        + `${pluralNeed(a.forgedNeedingIt)} ${a.colour} fuel.`,
      );
    }
  }

  return { ...after, warnings };
}

// --- rendering -------------------------------------------------------------------------------
// Shared markup for the forecast panel, used by both the forge window screen (always visible,
// live over the current merge selection) and the combat screen (collapsed <details>, over the
// fight's full deck). Kept here rather than duplicated in both screens.ts files.

// Tier-2 defIds are 'element-total' (fire-7, fire-8, fire-9); def.name is just the element name
// ("Fire") for all three, so the label needs the total appended too or the three chips would be
// indistinguishable. Tier-3 defIds (wind, smoke, ...) already have distinct names.
function forecastEntryLabel(defId: string): string {
  const def = elementDef(defId);
  const total = defId.split('-')[1];
  return total ? `${def.name} ${total}` : def.name;
}

function renderForecastEntry(e: { defId: string; reachable: boolean }, kind: 'tier2' | 'tier3'): string {
  return `
    <span class="forecast-entry ${e.reachable ? 'reachable' : 'unreachable'}"
      data-testid="forecast-${kind}-entry" data-def-id="${e.defId}">${forecastEntryLabel(e.defId)}</span>`;
}

function renderForecastFuelRow(row: Forecast['fuel'][number]): string {
  const starved = row.raws === 0 && row.forgedNeedingIt > 0;
  return `
    <div class="forecast-fuel-row ${starved ? 'starved' : ''}" data-testid="forecast-fuel-row" data-colour="${row.colour}">
      <span class="forecast-fuel-colour forecast-fuel-${row.colour}">${row.colour}</span>
      <span class="forecast-fuel-count">${row.raws} raw${row.raws === 1 ? '' : 's'}</span>
      <span class="forecast-fuel-need">${row.forgedNeedingIt} forged card${row.forgedNeedingIt === 1 ? '' : 's'} need it</span>
    </div>`;
}

export function renderForecastPanel(f: Forecast): string {
  const warningsHtml = f.warnings.length > 0
    ? `<div class="forecast-warnings" data-testid="forecast-warnings">
        ${f.warnings.map((w) => `<div class="forecast-warning">${w}</div>`).join('')}
      </div>`
    : '';
  return `
    <div class="forecast-panel" data-testid="forecast-panel">
      <div class="forecast-section">
        <div class="forecast-section-title">Tier 2 within reach</div>
        <div class="forecast-grid" data-testid="forecast-tier2">
          ${f.tier2.map((e) => renderForecastEntry(e, 'tier2')).join('')}
        </div>
      </div>
      <div class="forecast-section">
        <div class="forecast-section-title">Tier 3 within reach</div>
        <div class="forecast-grid" data-testid="forecast-tier3">
          ${f.tier3.map((e) => renderForecastEntry(e, 'tier3')).join('')}
        </div>
      </div>
      <div class="forecast-section">
        <div class="forecast-section-title">Fuel</div>
        <div class="forecast-fuel">${f.fuel.map(renderForecastFuelRow).join('')}</div>
      </div>
      ${warningsHtml}
    </div>`;
}
