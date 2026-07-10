import type { RunState } from '../../core/run';
import type { Suit } from '../../core/types';
import type { Store } from '../store';

type Dispatch = Store['dispatch'];

const SUIT_GLYPH: Record<Suit, string> = { diamonds: '♦', hearts: '♥', clubs: '♣', spades: '♠' };

export function renderStruggles(run: RunState, dispatch: Dispatch): HTMLElement {
  const root = document.createElement('div');
  root.className = 'struggles-screen';
  const opts = run.struggleOptions!;
  root.innerHTML = `
    <h2>Choose ${opts.pick} struggle(s)</h2>
    <div class="struggle-options" data-testid="struggle-options">
      ${opts.options.map((o) => {
        const chosen = opts.chosen.includes(o.id);
        return `
          <button class="struggle-card ${chosen ? 'chosen' : ''}" data-action="toggle-struggle"
            data-id="${o.id}" data-testid="struggle-option">
            <div class="struggle-card-name">${SUIT_GLYPH[o.domain]} ${o.name}</div>
            <div class="struggle-card-text">${o.text}</div>
          </button>`;
      }).join('')}
    </div>
    <button data-action="confirm-struggles" data-testid="confirm-struggles"
      ${opts.chosen.length === opts.pick ? '' : 'disabled'}>Confirm</button>`;
  root.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'toggle-struggle') dispatch({ type: 'toggleStruggle', id: el.dataset.id! });
    if (el.dataset.action === 'confirm-struggles') dispatch({ type: 'confirmStruggles' });
  });
  return root;
}
