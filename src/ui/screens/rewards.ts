import { elementDef } from '../../content/elements';
import { CONFIG } from '../../content/config';
import { RELICS } from '../../content/relics';
import type { RewardCommand } from '../../core/rewards';
import type { RunState } from '../../core/run';
import type { Card, MarkType, Suit } from '../../core/types';
import type { Store } from '../store';

type Dispatch = Store['dispatch'];

const SUIT_GLYPH: Record<Suit, string> = { diamonds: '♦', hearts: '♥', clubs: '♣', spades: '♠' };

// A modal picker awaiting a card (and, for cleanse, a mark) before a reward command is
// dispatched. UI-only, mirrors the picker pattern in screens/combat.ts. Keyed by suitIndex
// so it's obvious which unspent choice it belongs to; cleared on ANY reward dispatch since
// spending a choice splices suitChoices and shifts every later index.
type PickerKind = 'burnCard' | 'cleanse' | 'tutor';
interface Picker { suitIndex: number; kind: PickerKind; cardId?: string; mark?: MarkType }
let picker: Picker | null = null;

function cardLabel(c: Card): string {
  if (c.kind === 'raw') return `${c.colour} ${c.value}`;
  if (c.kind === 'forged') return `${elementDef(c.defId).name} (${c.defId})`;
  return `${c.suit} ${c.rank} corruption`;
}

function cardMarks(c: Card): MarkType[] {
  return Object.entries(c.marks)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([mark]) => mark as MarkType);
}

function renderSummary(run: RunState): string {
  return `
    <div class="reward-summary" data-testid="reward-summary">
      <span>Points: ${run.rewardPoints}</span>
      <span>Scout tokens: ${run.scoutTokens}</span>
      <span>Reroll tokens: ${run.rerollTokens}</span>
      <span>Widen tokens: ${run.widenTokens}</span>
      <span>Next hand bonus: ${run.nextHandBonus}</span>
    </div>`;
}

function suitOptionsHtml(suit: Suit, suitIndex: number, suffix: string): string {
  const btn = (label: string, action: string): string =>
    `<button data-action="${action}" data-suit-index="${suitIndex}">${label}${suffix}</button>`;
  const parts: string[] = [];
  switch (suit) {
    case 'hearts':
      parts.push(btn(`Heal +${CONFIG.healAmount}`, 'reward-heal'));
      break;
    case 'spades':
      parts.push(btn('Burn a card', 'open-burn'));
      parts.push(btn('Cleanse a mark', 'open-cleanse'));
      break;
    case 'diamonds':
      parts.push(btn('Scout token', 'reward-scout-token'));
      parts.push(btn('Reroll token', 'reward-reroll-token'));
      parts.push(btn('Widen token', 'reward-widen-token'));
      parts.push(btn('Tutor a card', 'open-tutor'));
      break;
    case 'clubs':
      parts.push(btn('Hand size +1', 'reward-hand-size'));
      break;
    default:
      break;
  }
  parts.push(btn('Skip', 'reward-skip'));
  return parts.join('');
}

function renderRewardPicker(p: Picker, run: RunState): string {
  const deck = run.deck;
  const eligible = p.kind === 'cleanse' ? deck.filter((c) => cardMarks(c).length > 0) : deck;
  const title = p.kind === 'burnCard' ? 'Choose a card to burn'
    : p.kind === 'cleanse' ? 'Choose a marked card to cleanse'
      : 'Choose a card to tutor atop the next draw';
  const cardButtons = eligible.map((c) => {
    const sel = p.cardId === c.id ? ' selected-option' : '';
    return `<button class="picker-choice${sel}" data-action="select-reward-card" data-card-id="${c.id}">${cardLabel(c)}</button>`;
  }).join('');
  let markHtml = '';
  if (p.kind === 'cleanse' && p.cardId) {
    const card = deck.find((c) => c.id === p.cardId);
    const markButtons = card ? cardMarks(card).map((m) => {
      const sel = p.mark === m ? ' selected-option' : '';
      return `<button class="picker-choice${sel}" data-action="select-cleanse-mark" data-mark="${m}">${m}</button>`;
    }).join('') : '';
    markHtml = `<div class="picker-subsection"><div>Mark to cleanse:</div>${markButtons}</div>`;
  }
  const canConfirm = p.kind === 'cleanse' ? Boolean(p.cardId && p.mark) : Boolean(p.cardId);
  return `
    <div class="picker" data-testid="reward-picker">
      <div class="picker-title">${title}</div>
      <div class="picker-options">${cardButtons}</div>
      ${markHtml}
      <button data-action="confirm-reward-picker" ${canConfirm ? '' : 'disabled'}>Confirm</button>
      <button data-action="cancel-reward-picker">Cancel</button>
    </div>`;
}

function renderSuitRow(run: RunState, suit: Suit, suitIndex: number, isLast: boolean): string {
  const suffix = isLast ? ' & open forge' : '';
  const body = picker && picker.suitIndex === suitIndex
    ? renderRewardPicker(picker, run)
    : `<div class="reward-row-options">${suitOptionsHtml(suit, suitIndex, suffix)}</div>`;
  return `
    <div class="reward-row" data-testid="reward-row">
      <div class="reward-row-suit">${SUIT_GLYPH[suit]} ${suit}</div>
      ${body}
    </div>`;
}

function renderRelicShop(run: RunState): string {
  const relics = Object.values(RELICS);
  return `
    <div class="relic-shop" data-testid="relic-shop">
      <h3>Relics</h3>
      <div class="relic-list">
        ${relics.map((r) => {
          const owned = run.relics.includes(r.id);
          const canBuy = !owned && run.rewardPoints >= CONFIG.relicCost;
          return `
            <div class="relic-card ${owned ? 'owned' : ''}" data-testid="relic-card">
              <div class="relic-name">${r.name} (${r.element})</div>
              <div class="relic-text">${r.text}</div>
              <button data-action="buy-relic" data-id="${r.id}" ${canBuy ? '' : 'disabled'}>
                ${owned ? 'Owned' : `Buy (${CONFIG.relicCost})`}
              </button>
            </div>`;
        }).join('')}
      </div>
      <button data-action="buy-reduced-struggles" ${run.rewardPoints >= CONFIG.reducedStrugglesCost ? '' : 'disabled'}>
        Buy Reduced Struggles (${CONFIG.reducedStrugglesCost})
      </button>
    </div>`;
}

export function renderRewards(run: RunState, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const rewards = run.pendingRewards!;
  if (picker && picker.suitIndex >= rewards.suitChoices.length) picker = null;

  const root = document.createElement('div');
  root.className = 'rewards-screen';
  root.innerHTML = `
    <h2>Rewards</h2>
    ${renderSummary(run)}
    <div class="reward-rows" data-testid="reward-rows">
      ${rewards.suitChoices.map((suit, i) => renderSuitRow(run, suit, i, rewards.suitChoices.length === 1)).join('')}
    </div>
    ${rewards.suitChoices.length > 1
      ? '<button data-action="skip-all-rewards">Skip all remaining & open forge</button>'
      : ''}
    ${renderRelicShop(run)}
  `;

  root.addEventListener('click', (ev) => handleClick(ev, run, dispatch, rerender));
  return root;
}

function handleClick(ev: Event, run: RunState, dispatch: Dispatch, rerender: () => void): void {
  const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const suitIndex = el.dataset.suitIndex !== undefined ? Number(el.dataset.suitIndex) : undefined;

  const dispatchReward = (cmd: RewardCommand, idx: number): void => {
    dispatch({ type: 'reward', suitIndex: idx, cmd });
    picker = null;
  };

  switch (action) {
    case 'reward-heal': dispatchReward({ type: 'heal' }, suitIndex!); break;
    case 'reward-scout-token': dispatchReward({ type: 'scoutToken' }, suitIndex!); break;
    case 'reward-reroll-token': dispatchReward({ type: 'rerollToken' }, suitIndex!); break;
    case 'reward-widen-token': dispatchReward({ type: 'widenToken' }, suitIndex!); break;
    case 'reward-hand-size': dispatchReward({ type: 'handSize' }, suitIndex!); break;
    case 'reward-skip': dispatchReward({ type: 'skip' }, suitIndex!); break;
    case 'open-burn': picker = { suitIndex: suitIndex!, kind: 'burnCard' }; rerender(); break;
    case 'open-cleanse': picker = { suitIndex: suitIndex!, kind: 'cleanse' }; rerender(); break;
    case 'open-tutor': picker = { suitIndex: suitIndex!, kind: 'tutor' }; rerender(); break;
    case 'select-reward-card':
      if (picker) { picker.cardId = el.dataset.cardId!; picker.mark = undefined; rerender(); }
      break;
    case 'select-cleanse-mark':
      if (picker && picker.kind === 'cleanse') { picker.mark = el.dataset.mark as MarkType; rerender(); }
      break;
    case 'confirm-reward-picker':
      if (picker && picker.cardId) {
        if (picker.kind === 'burnCard') dispatchReward({ type: 'burnCard', cardId: picker.cardId }, picker.suitIndex);
        else if (picker.kind === 'tutor') dispatchReward({ type: 'tutor', cardId: picker.cardId }, picker.suitIndex);
        else if (picker.kind === 'cleanse' && picker.mark) {
          dispatchReward({ type: 'cleanse', cardId: picker.cardId, mark: picker.mark }, picker.suitIndex);
        }
      }
      break;
    case 'cancel-reward-picker': picker = null; rerender(); break;
    case 'skip-all-rewards':
      while (run.pendingRewards && run.pendingRewards.suitChoices.length > 0) {
        dispatch({ type: 'reward', suitIndex: 0, cmd: { type: 'skip' } });
      }
      picker = null;
      break;
    case 'buy-relic': dispatch({ type: 'buyRelic', id: el.dataset.id! }); break;
    case 'buy-reduced-struggles': dispatch({ type: 'buyReducedStruggles' }); break;
    default: break;
  }
}
