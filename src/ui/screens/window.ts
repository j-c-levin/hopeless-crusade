import { isCorruption, isForged, isRaw } from '../../core/cards';
import { elementDef } from '../../content/elements';
import { tier2Target, tier3DefId } from '../../core/forge';
import type { RunState } from '../../core/run';
import type { Card, ForgedCard } from '../../core/types';
import type { Store } from '../store';

type Dispatch = Store['dispatch'];

// Multi-select state for the two merge flows (raw slots -> tier 2; tier-2 tray cards -> tier
// 3) plus the unmerge picker. UI-only, mirrors screens/combat.ts's module-level picker/target
// pattern; pruned against the live deck/window on every render so a card that left the deck
// (merged, burned, closed window) can never leave a dangling selection.
let selectedRaws: string[] = [];
let selectedForged: string[] = [];
let unmergeTarget: { cardId: string; burnConstituentId?: string } | null = null;

function toggle(arr: string[], id: string): void {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
}

function cardLabel(c: Card): string {
  if (isRaw(c)) return `${c.colour} ${c.value}`;
  if (isForged(c)) return `${elementDef(c.defId).name} (${c.defId})`;
  return `${c.suit} ${c.rank} corruption`;
}

function findForgedTier2(deck: Card[], id: string): ForgedCard | undefined {
  const c = deck.find((x) => x.id === id);
  return c && isForged(c) && c.tier === 2 ? c : undefined;
}

function renderSlot(card: Card | undefined, cardId: string): string {
  if (!card) return '';
  if (isCorruption(card)) {
    return `
      <div class="card card-corruption card-inert" data-testid="window-slot" data-card-id="${cardId}">
        <div class="card-title">${cardLabel(card)}</div>
        <div class="card-note">rotten &mdash; inert</div>
      </div>`;
  }
  if (!isRaw(card)) return ''; // slots (src/core/forgewindow.ts) only ever hold raw/corruption
  const selected = selectedRaws.includes(cardId);
  return `
    <div class="card card-raw card-${card.colour} ${selected ? 'selected' : ''}" data-testid="window-slot"
      data-action="toggle-slot" data-card-id="${cardId}">
      <div class="card-title">${cardLabel(card)}</div>
    </div>`;
}

function renderUnmergePicker(c: ForgedCard): string {
  const buttons = c.constituents.map((con) => {
    const sel = unmergeTarget?.burnConstituentId === con.id ? ' selected-option' : '';
    return `<button class="picker-choice${sel}" data-action="select-burn-constituent" data-card-id="${con.id}">${cardLabel(con)}</button>`;
  }).join('');
  return `
    <div class="picker" data-testid="unmerge-picker">
      <div class="picker-title">Burn a constituent:</div>
      <div class="picker-options">${buttons}</div>
      <button data-action="confirm-unmerge" ${unmergeTarget?.burnConstituentId ? '' : 'disabled'}>Confirm Unmerge</button>
      <button data-action="cancel-unmerge">Cancel</button>
    </div>`;
}

function renderForgedTrayCard(c: ForgedCard): string {
  const def = elementDef(c.defId);
  const selected = selectedForged.includes(c.id);
  const isUnmergeTarget = unmergeTarget?.cardId === c.id;
  return `
    <div class="card card-forged ${selected ? 'selected' : ''}" data-testid="forged-card" data-card-id="${c.id}">
      <div class="card-title">${def.name} &mdash; ${c.defId} (T${c.tier})</div>
      ${c.tier === 2
        ? `<label class="picker-option"><input type="checkbox" data-action="toggle-forged"
            data-card-id="${c.id}" ${selected ? 'checked' : ''}/> select for tier-3 merge</label>`
        : ''}
      <button data-action="open-unmerge" data-card-id="${c.id}">Unmerge</button>
      ${isUnmergeTarget ? renderUnmergePicker(c) : ''}
    </div>`;
}

function renderForgedTray(run: RunState): string {
  const forged = run.deck.filter(isForged);
  return `
    <div class="forged-tray" data-testid="forged-tray">
      <h3>Forged cards</h3>
      ${forged.length === 0 ? '<div class="node-empty">(none yet)</div>' : forged.map(renderForgedTrayCard).join('')}
    </div>`;
}

export function renderWindow(run: RunState, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const win = run.window!;
  selectedRaws = selectedRaws.filter((id) => win.slotIds.includes(id));
  selectedForged = selectedForged.filter((id) => findForgedTier2(run.deck, id) !== undefined);
  if (unmergeTarget && !run.deck.some((c) => c.id === unmergeTarget!.cardId)) unmergeTarget = null;

  const selectedRawCards = selectedRaws.map((id) => run.deck.find((c) => c.id === id)).filter((c): c is Card => Boolean(c));
  const tier2Ready = selectedRaws.length > 0 && tier2Target(selectedRawCards) !== null;

  const selectedForgedCards = selectedForged
    .map((id) => findForgedTier2(run.deck, id))
    .filter((c): c is ForgedCard => c !== undefined);
  const tier3Ready = selectedForgedCards.length === 2
    && tier3DefId(selectedForgedCards[0]!, selectedForgedCards[1]!) !== null;

  const root = document.createElement('div');
  root.className = 'window-screen';
  root.innerHTML = `
    <h2>Forge Window</h2>
    <div class="window-slots" data-testid="window-slots">
      ${win.slotIds.map((id) => renderSlot(run.deck.find((c) => c.id === id), id)).join('')}
    </div>
    <div class="window-actions">
      <button data-action="merge-tier2" ${tier2Ready ? '' : 'disabled'}>Merge</button>
      <button data-action="reroll-window" ${win.rerollsLeft > 0 ? '' : 'disabled'}>Reroll (${win.rerollsLeft})</button>
    </div>
    ${renderForgedTray(run)}
    <div class="window-tier3-actions">
      <button data-action="merge-tier3" ${tier3Ready ? '' : 'disabled'}>Merge (tier 3)</button>
    </div>
    <button data-action="close-window">Close</button>
  `;

  root.addEventListener('click', (ev) => handleClick(ev, dispatch, rerender));
  return root;
}

function handleClick(ev: Event, dispatch: Dispatch, rerender: () => void): void {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const cardId = el.dataset.cardId;
  switch (el.dataset.action) {
    case 'toggle-slot':
      toggle(selectedRaws, cardId!);
      rerender();
      break;
    case 'toggle-forged':
      toggle(selectedForged, cardId!);
      rerender();
      break;
    case 'merge-tier2':
      dispatch({ type: 'windowMerge', cardIds: [...selectedRaws] });
      selectedRaws = [];
      break;
    case 'merge-tier3':
      dispatch({ type: 'windowMerge', cardIds: [...selectedForged] });
      selectedForged = [];
      break;
    case 'reroll-window':
      dispatch({ type: 'windowReroll' });
      break;
    case 'open-unmerge':
      unmergeTarget = { cardId: cardId! };
      rerender();
      break;
    case 'select-burn-constituent':
      if (unmergeTarget) { unmergeTarget.burnConstituentId = cardId!; rerender(); }
      break;
    case 'confirm-unmerge':
      if (unmergeTarget?.burnConstituentId) {
        dispatch({ type: 'windowUnmerge', cardId: unmergeTarget.cardId, burnConstituentId: unmergeTarget.burnConstituentId });
        unmergeTarget = null;
      }
      break;
    case 'cancel-unmerge':
      unmergeTarget = null;
      rerender();
      break;
    case 'close-window':
      dispatch({ type: 'closeWindow' });
      break;
    default: break;
  }
}
