import { Rng } from './rng';
import type { Suit, RankClass, EnemySpec } from './types';
import { CONFIG } from '../content/config';

export interface PlayingCard { suit: Suit; rank: number } // 2–10, 11=J, 12=Q, 13=K, 14=A
export interface MapNode {
  id: string; column: number; zone: string;
  cards: PlayingCard[]; revealed: boolean;
}
export interface LevelMap { domain: Suit; nodes: MapNode[]; columns: number }
export interface CampaignMap {
  domainOrder: Suit[];           // dealt at run start; 'spades' always last
  level: number;                 // 0-based
  current: LevelMap;
  position: number | null;       // current column; null = before first column
  chosenNode?: string;
  defeated: Suit[];
  dealt: PlayingCard[];          // cards consumed so far (never reshuffled)
}

const ALL_SUITS: Suit[] = ['diamonds', 'hearts', 'clubs', 'spades'];

const TEMPLATE = [
  { zone: 'easy', nodes: 1, cardsPerNode: 1 },
  { zone: 'easy-med', nodes: 2, cardsPerNode: 1 },
  { zone: 'med', nodes: 2, cardsPerNode: 1 },
  { zone: 'med-hard', nodes: 2, cardsPerNode: 2 },
  { zone: 'hard', nodes: 1, cardsPerNode: 2 },
  { zone: 'boss', nodes: 1, cardsPerNode: 0 }, // boss holds the ace, added explicitly
] as const;

const POOL_RANKS: Record<string, number[]> = {
  easy: [2, 3, 4, 5], med: [6, 7, 8, 9, 10], hard: [11, 12, 13],
};

/** When a zone's own bag runs dry, widen to adjacent pools (same living suits) in this order. */
const WIDEN_ORDER: Record<string, string[]> = {
  easy: ['med', 'hard'],
  med: ['easy', 'hard'],
  hard: ['med', 'easy'],
  'easy-med': ['hard'],
  'med-hard': ['easy'],
};

function undealtCards(
  map: CampaignMap, suits: readonly Suit[], pools: string[], taken: PlayingCard[],
): PlayingCard[] {
  const out: PlayingCard[] = [];
  for (const pool of pools) {
    for (const suit of suits) {
      for (const rank of POOL_RANKS[pool]!) {
        const used =
          map.dealt.some((d) => d.suit === suit && d.rank === rank) ||
          taken.some((d) => d.suit === suit && d.rank === rank);
        if (!used) out.push({ suit, rank });
      }
    }
  }
  return out;
}

/**
 * Draw up to `need` cards for a zone, widening in stages when the bag underflows:
 * the zone's own pools, then adjacent difficulty pools of the living suits, then
 * any undealt non-ace card from the full 52-card deck. Each stage is shuffled
 * before drawing so all randomness flows through the passed Rng.
 */
function drawZoneCards(
  map: CampaignMap, domainSuits: Suit[], zone: string, need: number, rng: Rng,
): PlayingCard[] {
  const basePools = zone.includes('-') ? zone.split('-') : [zone];
  const stages: { suits: readonly Suit[]; pools: string[] }[] = [
    { suits: domainSuits, pools: basePools },
    ...(WIDEN_ORDER[zone] ?? []).map((pool) => ({ suits: domainSuits, pools: [pool] })),
    // echoes of fallen domains — last-resort supply so nodes are never empty
    { suits: ALL_SUITS, pools: ['easy', 'med', 'hard'] },
  ];
  const taken: PlayingCard[] = [];
  for (const stage of stages) {
    if (taken.length >= need) break;
    const bag = rng.shuffle(undealtCards(map, stage.suits, stage.pools, taken));
    taken.push(...bag.slice(0, need - taken.length));
  }
  return taken;
}

function classifyRank(rank: number): RankClass {
  if (rank === 14) return 'manifestation';
  if (rank >= 11) return 'fortress';
  if (rank >= 6) return 'stronghold';
  return 'tower'; // 2-5
}

export function generateLevel(map: CampaignMap, rng: Rng): LevelMap {
  const domain = map.domainOrder[map.level]!;
  const domainSuits = ALL_SUITS.filter((s) => !map.defeated.includes(s));

  // Two-phase deal so a supply shortage degrades per-node card count instead of
  // emptying whole nodes: phase 1 secures one card per node across every zone,
  // phase 2 tops up to cardsPerNode while the deck can still supply.
  const zoneCards: PlayingCard[][] = TEMPLATE.map(() => []);
  for (const phase of [1, 2] as const) {
    TEMPLATE.forEach((spec, column) => {
      if (spec.zone === 'boss') return;
      const target = phase === 1 ? spec.nodes : spec.nodes * spec.cardsPerNode;
      const want = target - zoneCards[column]!.length;
      if (want <= 0) return;
      const drawn = drawZoneCards(map, domainSuits, spec.zone, want, rng);
      zoneCards[column]!.push(...drawn);
      map.dealt.push(...drawn);
    });
  }

  const nodes: MapNode[] = [];
  TEMPLATE.forEach((spec, column) => {
    if (spec.zone === 'boss') {
      const card: PlayingCard = { suit: domain, rank: 14 };
      map.dealt.push(card);
      nodes.push({
        id: `L${map.level}C${column}N0`,
        column,
        zone: spec.zone,
        cards: [card],
        revealed: true,
      });
      return;
    }

    // Round-robin so a partial phase-2 top-up spreads evenly across the zone's nodes.
    const perNode: PlayingCard[][] = Array.from({ length: spec.nodes }, () => []);
    zoneCards[column]!.forEach((card, idx) => perNode[idx % spec.nodes]!.push(card));

    for (let i = 0; i < spec.nodes; i++) {
      nodes.push({
        id: `L${map.level}C${column}N${i}`,
        column,
        zone: spec.zone,
        cards: perNode[i]!,
        revealed: false,
      });
    }
  });

  return { domain, nodes, columns: TEMPLATE.length };
}

export function newCampaign(rng: Rng): CampaignMap {
  const domainOrder: Suit[] = [...rng.shuffle(['diamonds', 'hearts', 'clubs'] as Suit[]), 'spades'];
  const map: CampaignMap = {
    domainOrder,
    level: 0,
    current: { domain: domainOrder[0]!, nodes: [], columns: TEMPLATE.length },
    position: null,
    defeated: [],
    dealt: [],
  };
  map.current = generateLevel(map, rng);
  return map;
}

export function nodesInColumn(level: LevelMap, column: number): MapNode[] {
  return level.nodes.filter((n) => n.column === column);
}

export function enemySpecsFor(node: MapNode): EnemySpec[] {
  return node.cards.map((c) => ({ suit: c.suit, rank: classifyRank(c.rank), hp: c.rank }));
}

export function advance(map: CampaignMap, nodeId: string): MapNode {
  const node = map.current.nodes.find((n) => n.id === nodeId);
  if (!node) throw new Error(`no such node: ${nodeId}`);
  const nextColumn = (map.position ?? -1) + 1;
  if (node.column !== nextColumn) {
    throw new Error(`cannot advance to column ${node.column} from position ${map.position ?? -1}`);
  }
  map.position = node.column;
  map.chosenNode = nodeId;
  node.revealed = true;
  return node;
}

export function onLevelCleared(map: CampaignMap, rng: Rng): 'nextLevel' | 'victory' {
  map.defeated.push(map.current.domain);
  map.level += 1;
  if (map.level === 4) return 'victory';
  map.current = generateLevel(map, rng);
  map.position = null;
  map.chosenNode = undefined;
  return 'nextLevel';
}

export function scoutCost(map: CampaignMap, node: MapNode): number {
  const stepsAhead = Math.max(0, node.column - ((map.position ?? -1) + 1));
  return CONFIG.scoutBaseCost + stepsAhead;
}
