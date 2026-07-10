import { elementDef } from '../../content/elements';
import type { RunState } from '../../core/run';
import { describeDef } from '../describe';
import type { Store } from '../store';

type Dispatch = Store['dispatch'];

export function renderOrigin(run: RunState, dispatch: Dispatch): HTMLElement {
  const root = document.createElement('div');
  root.className = 'origin-screen';
  const options = run.originOptions ?? [];
  root.innerHTML = `
    <h2>Choose your origin</h2>
    <div class="origin-options" data-testid="origin-options">
      ${options.map((defId) => {
        const def = elementDef(defId);
        const total = defId.split('-')[1];
        return `
          <button class="origin-card" data-action="choose-origin" data-def-id="${defId}" data-testid="origin-option">
            <div class="origin-card-name">${def.name}</div>
            <div class="origin-card-total">Variant total ${total} &middot; fuel cost ${def.fuelCost}</div>
            <div class="origin-card-text">${describeDef(defId)}</div>
          </button>`;
      }).join('')}
    </div>`;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action="choose-origin"]');
    if (!el) return;
    dispatch({ type: 'chooseOrigin', defId: el.dataset.defId! });
  });
  return root;
}
