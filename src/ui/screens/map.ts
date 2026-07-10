import { enemySpecsFor, nodesInColumn, scoutCost } from '../../core/map';
import type { CampaignMap, MapNode } from '../../core/map';
import type { RunState } from '../../core/run';
import type { RankClass, Suit } from '../../core/types';
import type { Store } from '../store';

type Dispatch = Store['dispatch'];

const SUIT_GLYPH: Record<Suit, string> = { diamonds: '♦', hearts: '♥', clubs: '♣', spades: '♠' };
const HORSEMAN: Record<Suit, string> = { diamonds: 'Famine', hearts: 'Disease', clubs: 'War', spades: 'Death' };
const RANK_LABEL: Record<RankClass, string> = { tower: 'T', stronghold: 'S', fortress: 'F', manifestation: 'M' };

// Card-exhaustion widening (src/core/map.ts drawZoneCards) can fill a node with cards
// weaker/other-suited than its zone label suggests — so once revealed we always render the
// actual cards, and the zone name stays flavour-only. Unrevealed nodes only leak rank-class
// counts (via enemySpecsFor, which is already public), never suit or exact rank.
function silhouette(node: MapNode): string {
  const counts = new Map<RankClass, number>();
  for (const spec of enemySpecsFor(node)) counts.set(spec.rank, (counts.get(spec.rank) ?? 0) + 1);
  if (counts.size === 0) return '<span class="node-empty">(empty)</span>';
  return [...counts.entries()]
    .map(([rank, n]) => `<span class="silhouette-chip silhouette-${rank}">${n}&times;${RANK_LABEL[rank]}</span>`)
    .join('');
}

function revealedChips(node: MapNode): string {
  return node.cards.map((c) => `<span class="card-chip">${SUIT_GLYPH[c.suit]}${c.rank}</span>`).join('');
}

function renderNode(map: CampaignMap, node: MapNode, nextColumn: number, scoutTokens: number): string {
  const isCurrent = node.id === map.chosenNode;
  const isNext = node.column === nextColumn;
  const classes = ['map-node'];
  if (isCurrent) classes.push('current');
  if (isNext) classes.push('reachable');
  const cost = scoutCost(map, node);
  const showScout = scoutTokens > 0 && !node.revealed && node.column >= nextColumn;
  return `
    <div class="${classes.join(' ')}" data-testid="map-node" data-node-id="${node.id}">
      <div class="map-node-zone">${node.zone}</div>
      <div class="map-node-cards">${node.revealed ? revealedChips(node) : silhouette(node)}</div>
      <div class="map-node-actions">
        ${isNext ? `<button data-action="move-to" data-node-id="${node.id}">Advance</button>` : ''}
        ${showScout
          ? `<button data-action="scout" data-node-id="${node.id}" ${scoutTokens < cost ? 'disabled' : ''}>Scout (${cost})</button>`
          : ''}
      </div>
    </div>`;
}

export function renderMap(run: RunState, dispatch: Dispatch): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-screen';
  const map = run.map;
  const nextColumn = (map.position ?? -1) + 1;
  const columns = Array.from({ length: map.current.columns }, (_, c) => c);

  const domainLine = map.domainOrder
    .map((s) => (map.defeated.includes(s) ? `<s>${HORSEMAN[s]}</s>` : HORSEMAN[s]))
    .join(', ');

  root.innerHTML = `
    <h2>Level ${map.level + 1} &mdash; Domain of ${HORSEMAN[map.current.domain]}</h2>
    <div class="domain-order" data-testid="domain-order">Horsemen: ${domainLine}</div>
    <div class="map-columns" data-testid="map-columns">
      ${columns.map((c) => `
        <div class="map-column" data-testid="map-column">
          ${nodesInColumn(map.current, c).map((n) => renderNode(map, n, nextColumn, run.scoutTokens)).join('')}
        </div>`).join('')}
    </div>`;

  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    const nodeId = el.dataset.nodeId!;
    if (el.dataset.action === 'move-to') dispatch({ type: 'moveTo', nodeId });
    if (el.dataset.action === 'scout') dispatch({ type: 'scout', nodeId });
  });
  return root;
}
