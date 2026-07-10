import type { RunState } from '../../core/run';
import type { Suit } from '../../core/types';

const HORSEMAN: Record<Suit, string> = { diamonds: 'Famine', hearts: 'Disease', clubs: 'War', spades: 'Death' };

function countBurned(run: RunState): number {
  return run.log.filter((e) => e.type === 'burn').length;
}

// New Run restarts the whole page against seed+1 via the URL's ?seed= query param, rather
// than plumbing a restart hook through Store/render: src/ui/main.ts already reads ?seed= on
// load, so bumping it and reloading gets a fully fresh RunState/Store *and* resets the small
// module-level `let` caches each screen keeps for its own UI-only picker state (origin/map
// have none, but rewards.ts/window.ts/combat.ts do) which a rebuilt Store alone wouldn't touch.
function restart(run: RunState): void {
  const params = new URLSearchParams(window.location.search);
  params.set('seed', String(run.seed + 1));
  window.location.search = params.toString();
}

export function renderEnding(run: RunState): HTMLElement {
  const root = document.createElement('div');
  root.className = 'ending-screen';
  const victory = run.phase === 'victory';
  const defeatedHorsemen = run.map.defeated.map((s) => HORSEMAN[s]);
  root.innerHTML = `
    <h2 data-testid="ending-title">${victory ? 'Victory' : 'Defeat'}</h2>
    <div class="ending-stats" data-testid="ending-stats">
      <div>Level reached: ${run.map.level + 1}</div>
      <div>Deck size: ${run.deck.length}</div>
      <div>Cards burned: ${countBurned(run)}</div>
      <div>Horsemen defeated: ${defeatedHorsemen.length > 0 ? defeatedHorsemen.join(', ') : 'none'}</div>
    </div>
    <button data-action="new-run" data-testid="new-run">New Run</button>
  `;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action="new-run"]');
    if (!el) return;
    restart(run);
  });
  return root;
}
