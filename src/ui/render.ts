import type { RunState } from '../core/run';
import { renderCombat } from './screens/combat';
import { renderEnding } from './screens/ending';
import { renderMap } from './screens/map';
import { renderOrigin } from './screens/origin';
import { renderRewards } from './screens/rewards';
import { renderStruggles } from './screens/struggles';
import { renderWindow } from './screens/window';
import type { Store } from './store';

// Fallback for any phase whose expected substate is missing (shouldn't happen in practice,
// since runCommand keeps phase and substate in lockstep) — a raw JSON dump for inspection
// rather than a crash.
function renderPlaceholder(run: RunState): HTMLElement {
  const root = document.createElement('div');
  root.className = 'placeholder-screen';
  root.innerHTML = `
    <h2>Phase: ${run.phase}</h2>
    <pre>${JSON.stringify(run, null, 2)}</pre>`;
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
        screen = renderOrigin(run, store.dispatch);
        break;
      case 'map':
        screen = renderMap(run, store.dispatch);
        break;
      case 'strugglePick':
        screen = renderStruggles(run, store.dispatch);
        break;
      case 'rewards':
        screen = run.pendingRewards ? renderRewards(run, store.dispatch, doRender) : renderPlaceholder(run);
        break;
      case 'forgeWindow':
        screen = run.window ? renderWindow(run, store.dispatch, doRender) : renderPlaceholder(run);
        break;
      case 'victory':
      case 'defeat':
        screen = renderEnding(run);
        break;
      default:
        screen = renderPlaceholder(run);
    }
    root.appendChild(screen);
  }

  store.onRender(doRender);
  doRender();
}
