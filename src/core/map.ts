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

function zoneBag(map: CampaignMap, domainSuits: Suit[], zone: string, rng: Rng): PlayingCard[] {
  const pools = zone.includes('-') ? zone.split('-') : [zone];
  const bag: PlayingCard[] = [];
  for (const pool of pools) {
    const poolName = pool === 'easy' || pool === 'med' || pool === 'hard' ? pool : pool;
    for (const suit of domainSuits) {
      for (const rank of POOL_RANKS[poolName]!) {
        const card = { suit, rank };
        if (!map.dealt.some((d) => d.suit === suit && d.rank === rank)) bag.push(card);
      }
    }
  }
  return rng.shuffle(bag);
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

    const need = spec.nodes * spec.cardsPerNode;
    const bag = zoneBag(map, domainSuits, spec.zone, rng);
    const drawn = bag.slice(0, need);
    for (const card of drawn) map.dealt.push(card);

    for (let i = 0; i < spec.nodes; i++) {
      const cards = drawn.slice(i * spec.cardsPerNode, (i + 1) * spec.cardsPerNode);
      nodes.push({
        id: `L${map.level}C${column}N${i}`,
        column,
        zone: spec.zone,
        cards,
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
