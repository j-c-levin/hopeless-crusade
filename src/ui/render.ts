import { nodesInColumn } from '../core/map';
import type { RunState } from '../core/run';
import { renderCombat } from './screens/combat';
import type { Store } from './store';

// Screens for the pre-/post-combat phases are intentionally minimal here — Task 20 replaces
// them with proper UIs. originDraft/map/strugglePick get just enough interactivity to reach
// combat by mouse; everything else is a phase-name header plus a raw JSON dump for inspection.

function renderOriginDraft(run: RunState, dispatch: Store['dispatch']): HTMLElement {
  const root = document.createElement('div');
  root.className = 'origin-draft-screen';
  const options = run.originOptions ?? [];
  root.innerHTML = `
    <h2>Choose your origin</h2>
    <div class="origin-options">
      ${options.map((id) => `<button data-action="choose-origin" data-def-id="${id}">${id}</button>`).join('')}
    </div>`;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action="choose-origin"]');
    if (!el) return;
    dispatch({ type: 'chooseOrigin', defId: el.dataset.defId! });
  });
  return root;
}

function renderMap(run: RunState, dispatch: Store['dispatch']): HTMLElement {
  const root = document.createElement('div');
  root.className = 'map-screen';
  const nextColumn = (run.map.position ?? -1) + 1;
  const nodes = nodesInColumn(run.map.current, nextColumn);
  root.innerHTML = `
    <h2>Map — level ${run.map.level}, domain ${run.map.current.domain}</h2>
    <div class="map-nodes">
      ${nodes.map((n) => `<button data-action="move-to" data-node-id="${n.id}">${n.zone} (${n.id})</button>`).join('')}
    </div>`;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action="move-to"]');
    if (!el) return;
    dispatch({ type: 'moveTo', nodeId: el.dataset.nodeId! });
  });
  return root;
}

function renderStrugglePick(run: RunState, dispatch: Store['dispatch']): HTMLElement {
  const root = document.createElement('div');
  root.className = 'struggle-pick-screen';
  const opts = run.struggleOptions!;
  root.innerHTML = `
    <h2>Choose ${opts.pick} struggle(s)</h2>
    <div class="struggle-options">
      ${opts.options.map((o) => {
        const chosen = opts.chosen.includes(o.id);
        return `<button data-action="toggle-struggle" data-id="${o.id}" class="${chosen ? 'chosen' : ''}">${o.id}</button>`;
      }).join('')}
    </div>
    <button data-action="confirm-struggles" ${opts.chosen.length === opts.pick ? '' : 'disabled'}>Confirm</button>`;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'toggle-struggle') dispatch({ type: 'toggleStruggle', id: el.dataset.id! });
    if (el.dataset.action === 'confirm-struggles') dispatch({ type: 'confirmStruggles' });
  });
  return root;
}

function renderPlaceholder(run: RunState): HTMLElement {
  const root = document.createElement('div');
  root.className = 'placeholder-screen';
  const relevant = run.phase === 'rewards' ? run.pendingRewards
    : run.phase === 'forgeWindow' ? run.window
    : run;
  root.innerHTML = `
    <h2>Phase: ${run.phase}</h2>
    <pre>${JSON.stringify(relevant, null, 2)}</pre>`;
  return root;
}

export function render(root: HTMLElement, store: Store): void {
  function doRender(): void {
    const run = store.run;
    root.innerHTML = '';

    const status = document.createElement('div');
    status.className = 'app-status';
    status.setAttribute('data-testid', 'status-message');
    status.textContent = store.status ?? '';
    root.appendChild(status);

    let screen: HTMLElement;
    switch (run.phase) {
      case 'combat':
        screen = run.combat ? renderCombat(run, store.dispatch, doRender) : renderPlaceholder(run);
        break;
      case 'originDraft':
        screen = renderOriginDraft(run, store.dispatch);
        break;
      case 'map':
        screen = renderMap(run, store.dispatch);
        break;
      case 'strugglePick':
        screen = renderStrugglePick(run, store.dispatch);
        break;
      default:
        screen = renderPlaceholder(run);
    }
    root.appendChild(screen);
  }

  store.onRender(doRender);
  doRender();
}
