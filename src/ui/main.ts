import { createStore } from './store';
import { render } from './render';

function getSeed(): number {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('seed');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : 1;
}

const app = document.querySelector<HTMLDivElement>('#app')!;
const store = createStore(getSeed());
render(app, store);
