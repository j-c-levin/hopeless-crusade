import { elementDef } from '../../content/elements';
import { isCorruption, isForged, isRaw } from '../../core/cards';
import type { RunCommand, RunState } from '../../core/run';
import type {
  Card, CombatState, CorruptionCard, Enemy, ForgedCard, RawCard,
} from '../../core/types';

type Dispatch = (cmd: RunCommand) => void;

const SUIT_GLYPH: Record<string, string> = {
  diamonds: '♦', hearts: '♥', clubs: '♣', spades: '♠',
};
const MARK_LABEL: Record<string, string> = {
  famished: 'FAM', plagued: 'PLG', scarred: 'SCR', doomed: 'DMD',
};

// Which enemy is the current target for red scrap / activate-attach / hail mary. UI-only —
// not part of RunState — re-validated (and reset if dead/absent) on every render.
let targetId: string | null = null;

// A modal picker awaiting player input before a command is dispatched. UI-only, mirrors the
// extra fields a CombatCommand needs beyond the single card that opened the picker.
type Picker =
  | { kind: 'greenScrap'; cardId: string; selected: string[] }
  | { kind: 'activate'; cardId: string; fuelIds: string[]; decombineTargetId?: string;
      burnConstituentId?: string; discardIds: string[] }
  | { kind: 'freeDecombine'; cardId: string; burnConstituentId?: string }
  | { kind: 'hailMary'; selected: string[] };

let picker: Picker | null = null;

function pickerAnchorCardId(p: Picker): string | null {
  return p.kind === 'hailMary' ? null : p.cardId;
}

function toggleSelected(arr: string[], id: string): void {
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1); else arr.push(id);
}

function cardLabel(c: Card): string {
  if (isRaw(c)) return `${c.colour} ${c.value}`;
  if (isForged(c)) return `${elementDef(c.defId).name} (${c.defId})`;
  return `${(c as CorruptionCard).suit} ${(c as CorruptionCard).rank} corruption`;
}

function markBadges(card: Card): string {
  return Object.entries(card.marks)
    .filter(([, n]) => (n ?? 0) > 0)
    .map(([mark]) => `<span class="mark-badge mark-${mark}">${MARK_LABEL[mark] ?? mark}</span>`)
    .join('');
}

function countCorruption(combat: CombatState): number {
  return [...combat.drawPile, ...combat.discardPile, ...combat.hand, ...combat.attachedCards]
    .filter(isCorruption).length;
}

function renderEnemy(e: Enemy): string {
  const classes = ['enemy-panel'];
  if (e.id === targetId) classes.push('selected');
  if (e.hp <= 0) classes.push('dead');
  return `
    <div class="${classes.join(' ')}" data-testid="enemy-panel" data-action="select-target" data-enemy-id="${e.id}">
      <div class="enemy-rank">${SUIT_GLYPH[e.suit] ?? '?'} ${e.rank}</div>
      <div class="enemy-hp">HP ${e.hp}/${e.maxHp}</div>
      <div class="enemy-power">Power ${e.power}</div>
      <div class="enemy-attachments">Attachments: ${e.attachments.length}</div>
    </div>`;
}

function renderRawCard(card: RawCard, combat: CombatState): string {
  const blocked = combat.scrapSealed || card.marks.scarred !== undefined;
  return `
    <div class="card card-raw card-${card.colour}" data-testid="hand-card" data-card-id="${card.id}">
      <div class="card-title">${card.colour} ${card.value}</div>
      <div class="card-marks">${markBadges(card)}</div>
      <button data-action="scrap" data-card-id="${card.id}" ${blocked ? 'disabled' : ''}>Scrap</button>
    </div>`;
}

function renderForgedCard(card: ForgedCard, combat: CombatState): string {
  const def = elementDef(card.defId);
  const activated = combat.activatedThisRound.includes(card.id);
  return `
    <div class="card card-forged" data-testid="hand-card" data-card-id="${card.id}">
      <div class="card-title">${def.name} — ${card.defId} (T${card.tier})</div>
      <div class="card-fuel">Fuel cost: ${def.fuelCost}</div>
      <div class="card-marks">${markBadges(card)}</div>
      <button data-action="open-activate" data-card-id="${card.id}" ${activated ? 'disabled' : ''}>Activate</button>
      ${combat.freeDecombines > 0
        ? `<button data-action="open-free-decombine" data-card-id="${card.id}">Decombine (free)</button>`
        : ''}
    </div>`;
}

function renderCorruptionCard(card: CorruptionCard): string {
  return `
    <div class="card card-corruption" data-testid="hand-card" data-card-id="${card.id}">
      <div class="card-title">${SUIT_GLYPH[card.suit] ?? '?'} ${card.rank} corruption</div>
    </div>`;
}

function renderHandCard(card: Card, combat: CombatState): string {
  if (isForged(card)) return renderForgedCard(card, combat);
  if (isCorruption(card)) return renderCorruptionCard(card);
  return renderRawCard(card as RawCard, combat);
}

function renderStatusBar(combat: CombatState): string {
  const parts = [
    `HP ${combat.hp}`,
    `Block ${combat.block}`,
    `Round ${combat.round}`,
    `Draw ${combat.drawPile.length}`,
    `Discard ${combat.discardPile.length}`,
    `Corruption in deck ${countCorruption(combat)}`,
    `Death counter ${combat.deathCounter}`,
  ];
  if (combat.clock !== undefined) parts.push(`Clock ${combat.clock}`);
  if (combat.struggles.length > 0) parts.push(`Struggles: ${combat.struggles.join(', ')}`);
  if (combat.freeMerges > 0) parts.push(`Free merges ${combat.freeMerges}`);
  if (combat.freeDecombines > 0) parts.push(`Free decombines ${combat.freeDecombines}`);
  return `<div class="status-bar" data-testid="status-bar">${parts.map((p) => `<span>${p}</span>`).join('')}</div>`;
}

function renderChoiceModal(combat: CombatState): string {
  const pc = combat.pendingChoice!;
  const buttons = pc.options
    .map((o) => `<button data-action="resolve-choice" data-option-id="${o.id}">${o.label}</button>`)
    .join('');
  return `
    <div class="modal" data-testid="choice-modal">
      <div class="modal-prompt">${pc.prompt}</div>
      <div class="modal-options">${buttons}</div>
    </div>`;
}

function renderGreenScrapPicker(p: Extract<Picker, { kind: 'greenScrap' }>, combat: CombatState): string {
  const options = combat.hand.filter((c) => c.id !== p.cardId);
  const boxes = options.map((c) => {
    const checked = p.selected.includes(c.id) ? 'checked' : '';
    return `<label class="picker-option"><input type="checkbox" data-action="toggle-merge-card"
      data-card-id="${c.id}" ${checked}/> ${cardLabel(c)}</label>`;
  }).join('');
  return `
    <div class="picker" data-testid="picker">
      <div class="picker-title">Green scrap — choose cards to merge with</div>
      <div class="picker-options">${boxes}</div>
      <button data-action="confirm-green-scrap">Confirm Merge</button>
      <button data-action="cancel-picker">Cancel</button>
    </div>`;
}

function renderActivatePicker(p: Extract<Picker, { kind: 'activate' }>, combat: CombatState): string {
  const card = combat.hand.find((c) => c.id === p.cardId);
  if (!card || card.kind !== 'forged') return '';
  const def = elementDef(card.defId);
  const needsDecombine = def.onActivate.some((a) => a.op === 'decombine');
  const discardAtom = def.onActivate.find((a) => a.op === 'discard');

  const fuelOptions = combat.hand.filter(isRaw).map((c) => {
    const checked = p.fuelIds.includes(c.id) ? 'checked' : '';
    return `<label class="picker-option"><input type="checkbox" data-action="toggle-fuel"
      data-card-id="${c.id}" ${checked}/> ${cardLabel(c)}</label>`;
  }).join('');

  let decombineHtml = '';
  if (needsDecombine) {
    const targets = combat.hand.filter(isForged).filter((c) => c.id !== p.cardId);
    const targetButtons = targets.map((t) => {
      const sel = p.decombineTargetId === t.id ? ' selected-option' : '';
      return `<button class="picker-choice${sel}" data-action="select-decombine-target" data-card-id="${t.id}">${cardLabel(t)}</button>`;
    }).join('');
    decombineHtml += `<div class="picker-subsection"><div>Decombine target:</div>${targetButtons}</div>`;
    const chosenTarget = targets.find((t) => t.id === p.decombineTargetId);
    if (chosenTarget) {
      const constituentButtons = chosenTarget.constituents.map((c) => {
        const sel = p.burnConstituentId === c.id ? ' selected-option' : '';
        return `<button class="picker-choice${sel}" data-action="select-burn-constituent" data-card-id="${c.id}">${cardLabel(c)}</button>`;
      }).join('');
      decombineHtml += `<div class="picker-subsection"><div>Burn constituent:</div>${constituentButtons}</div>`;
    }
  }

  let discardHtml = '';
  if (discardAtom) {
    const discardOptions = combat.hand.filter((c) => c.id !== p.cardId).map((c) => {
      const checked = p.discardIds.includes(c.id) ? 'checked' : '';
      return `<label class="picker-option"><input type="checkbox" data-action="toggle-discard"
        data-card-id="${c.id}" ${checked}/> ${cardLabel(c)}</label>`;
    }).join('');
    discardHtml = `<div class="picker-subsection"><div>Discard (${discardAtom.amount}):</div>${discardOptions}</div>`;
  }

  return `
    <div class="picker" data-testid="picker">
      <div class="picker-title">Activate ${def.name} — choose fuel (current target used for damage/attach)</div>
      <div class="picker-options">${fuelOptions}</div>
      ${decombineHtml}
      ${discardHtml}
      <button data-action="confirm-activate">Confirm Activate</button>
      <button data-action="cancel-picker">Cancel</button>
    </div>`;
}

function renderFreeDecombinePicker(p: Extract<Picker, { kind: 'freeDecombine' }>, combat: CombatState): string {
  const target = combat.hand.find((c) => c.id === p.cardId);
  if (!target || target.kind !== 'forged') return '';
  const options = target.constituents.map((c) => {
    const sel = p.burnConstituentId === c.id ? ' selected-option' : '';
    return `<button class="picker-choice${sel}" data-action="select-burn-constituent" data-card-id="${c.id}">${cardLabel(c)}</button>`;
  }).join('');
  return `
    <div class="picker" data-testid="picker">
      <div class="picker-title">Decombine ${target.defId} (free) — choose a constituent to burn</div>
      <div class="picker-options">${options}</div>
      <button data-action="confirm-free-decombine">Confirm Decombine</button>
      <button data-action="cancel-picker">Cancel</button>
    </div>`;
}

function renderHailMaryPicker(p: Extract<Picker, { kind: 'hailMary' }>, combat: CombatState): string {
  const raws = combat.hand.filter(isRaw);
  const boxes = raws.map((c) => {
    const checked = p.selected.includes(c.id) ? 'checked' : '';
    return `<label class="picker-option"><input type="checkbox" data-action="toggle-hail-mary-card"
      data-card-id="${c.id}" ${checked}/> ${cardLabel(c)}</label>`;
  }).join('');
  return `
    <div class="picker" data-testid="picker">
      <div class="picker-title">Hail Mary — choose exactly 3 raws (burns them; targets the current selection)</div>
      <div class="picker-options">${boxes}</div>
      <button data-action="confirm-hail-mary">Confirm Hail Mary</button>
      <button data-action="cancel-picker">Cancel</button>
    </div>`;
}

function renderPicker(p: Picker, combat: CombatState): string {
  switch (p.kind) {
    case 'greenScrap': return renderGreenScrapPicker(p, combat);
    case 'activate': return renderActivatePicker(p, combat);
    case 'freeDecombine': return renderFreeDecombinePicker(p, combat);
    case 'hailMary': return renderHailMaryPicker(p, combat);
    default: return '';
  }
}

function renderLog(run: RunState): string {
  const entries = run.log.slice(-20);
  return `
    <div class="event-log" data-testid="event-log">
      <div class="event-log-title">Log</div>
      <ul>${entries.map((e) => `<li>${e.text}</li>`).join('')}</ul>
    </div>`;
}

function handleClick(
  ev: Event, combat: CombatState, dispatch: Dispatch, rerender: () => void,
): void {
  const clicked = ev.target as HTMLElement;
  const el = clicked.closest<HTMLElement>('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  const cardId = el.dataset.cardId;
  const optionId = el.dataset.optionId;

  switch (action) {
    case 'select-target': {
      const enemyId = el.dataset.enemyId!;
      const enemy = combat.enemies.find((e) => e.id === enemyId);
      if (enemy && enemy.hp > 0) targetId = enemyId;
      rerender();
      break;
    }
    case 'scrap': {
      const card = combat.hand.find((c) => c.id === cardId);
      if (card && card.kind === 'raw' && card.colour === 'green') {
        picker = { kind: 'greenScrap', cardId: cardId!, selected: [] };
        rerender();
      } else {
        dispatch({ type: 'combat', cmd: { type: 'scrap', cardId: cardId!, targetEnemyId: targetId ?? undefined } });
      }
      break;
    }
    case 'toggle-merge-card':
      if (picker && picker.kind === 'greenScrap') { toggleSelected(picker.selected, cardId!); rerender(); }
      break;
    case 'confirm-green-scrap':
      if (picker && picker.kind === 'greenScrap') {
        dispatch({ type: 'combat', cmd: { type: 'scrap', cardId: picker.cardId, mergeCardIds: picker.selected } });
        picker = null;
      }
      break;
    case 'open-activate':
      picker = { kind: 'activate', cardId: cardId!, fuelIds: [], discardIds: [] };
      rerender();
      break;
    case 'toggle-fuel':
      if (picker && picker.kind === 'activate') { toggleSelected(picker.fuelIds, cardId!); rerender(); }
      break;
    case 'toggle-discard':
      if (picker && picker.kind === 'activate') { toggleSelected(picker.discardIds, cardId!); rerender(); }
      break;
    case 'select-decombine-target':
      if (picker && picker.kind === 'activate') {
        picker.decombineTargetId = cardId!;
        picker.burnConstituentId = undefined;
        rerender();
      }
      break;
    case 'select-burn-constituent':
      if (picker && (picker.kind === 'activate' || picker.kind === 'freeDecombine')) {
        picker.burnConstituentId = cardId!;
        rerender();
      }
      break;
    case 'confirm-activate':
      if (picker && picker.kind === 'activate') {
        dispatch({
          type: 'combat',
          cmd: {
            type: 'activate',
            cardId: picker.cardId,
            fuelIds: picker.fuelIds,
            targetEnemyId: targetId ?? undefined,
            decombineTargetId: picker.decombineTargetId,
            burnConstituentId: picker.burnConstituentId,
            discardIds: picker.discardIds.length > 0 ? picker.discardIds : undefined,
          },
        });
        picker = null;
      }
      break;
    case 'open-free-decombine':
      picker = { kind: 'freeDecombine', cardId: cardId! };
      rerender();
      break;
    case 'confirm-free-decombine':
      if (picker && picker.kind === 'freeDecombine') {
        dispatch({
          type: 'combat',
          cmd: { type: 'decombine', cardId: picker.cardId, burnConstituentId: picker.burnConstituentId },
        });
        picker = null;
      }
      break;
    case 'open-hail-mary':
      picker = { kind: 'hailMary', selected: [] };
      rerender();
      break;
    case 'toggle-hail-mary-card':
      if (picker && picker.kind === 'hailMary') { toggleSelected(picker.selected, cardId!); rerender(); }
      break;
    case 'confirm-hail-mary':
      if (picker && picker.kind === 'hailMary') {
        dispatch({
          type: 'combat',
          cmd: { type: 'hailMary', cardIds: picker.selected, targetEnemyId: targetId ?? '' },
        });
        picker = null;
      }
      break;
    case 'cancel-picker':
      picker = null;
      rerender();
      break;
    case 'end-turn':
      dispatch({ type: 'combat', cmd: { type: 'endTurn' } });
      break;
    case 'resolve-choice':
      dispatch({ type: 'combat', cmd: { type: 'resolveChoice', optionId: optionId! } });
      break;
    default:
      break;
  }
}

export function renderCombat(run: RunState, dispatch: Dispatch, rerender: () => void): HTMLElement {
  const combat = run.combat!;

  if (targetId && !combat.enemies.some((e) => e.id === targetId && e.hp > 0)) {
    targetId = null;
  }
  if (picker) {
    const anchor = pickerAnchorCardId(picker);
    if (anchor && !combat.hand.some((c) => c.id === anchor)) picker = null;
  }

  const root = document.createElement('div');
  root.className = 'combat-screen';
  root.innerHTML = `
    ${combat.pendingChoice ? renderChoiceModal(combat) : ''}
    ${renderStatusBar(combat)}
    <div class="enemy-row" data-testid="enemy-row">${combat.enemies.map(renderEnemy).join('')}</div>
    <div class="hand-row" data-testid="hand-row">${combat.hand.map((c) => renderHandCard(c, combat)).join('')}</div>
    <div class="actions-row">
      <button data-action="open-hail-mary">Hail Mary</button>
      <button data-action="end-turn">End Turn</button>
    </div>
    ${picker ? renderPicker(picker, combat) : ''}
    ${renderLog(run)}
  `;
  root.addEventListener('click', (ev) => handleClick(ev, combat, dispatch, rerender));
  return root;
}
