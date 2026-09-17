// Wiring: boot the feed, keep the toolbar in sync, handle keys and the saved list.

import { STYLES, COLORS, COLOR_LABELS, RCSB_PAGE } from './config.js';
import { poolCount } from './rcsb.js';
import { StagePool } from './viewer.js';
import { Feed, toast } from './feed.js';

const $ = id => document.getElementById(id);

const prefs = {
  get style() { return localStorage.getItem('instaprot:style') || STYLES[0]; },
  set style(v) { try { localStorage.setItem('instaprot:style', v); } catch {} },
  get color() { return localStorage.getItem('instaprot:color') || COLORS[0]; },
  set color(v) { try { localStorage.setItem('instaprot:color', v); } catch {} },
};

const saved = {
  items: JSON.parse(localStorage.getItem('instaprot:saved') || '[]'),
  has(id) { return this.items.some(i => i.id === id); },
  toggle(id, item) {
    const on = !this.has(id);
    this.items = on ? [item, ...this.items].slice(0, 200) : this.items.filter(i => i.id !== id);
    this._persist();
    return on;
  },
  _persist() {
    try { localStorage.setItem('instaprot:saved', JSON.stringify(this.items)); } catch {}
    renderSavedCount();
  },
};

function renderSavedCount() {
  const badge = $('savedCount');
  badge.textContent = String(saved.items.length);
  badge.hidden = saved.items.length === 0;
}

const pool = new StagePool({ style: prefs.style, color: prefs.color });
const feed = new Feed({ root: $('feed'), pool, saved, onActive: () => hideHint() });

// Handy from the console, and the seam any future feature would hang off.
window.instaprot = { feed, pool, prefs, saved };

function setStyle(style) {
  prefs.style = style;
  pool.setStyle(style);
  $('styleLabel').textContent = style;
}

function setColor(color) {
  prefs.color = color;
  pool.setColor(color);
  $('colorLabel').textContent = COLOR_LABELS[color] || color;
}

$('styleBtn').addEventListener('click', () => {
  setStyle(STYLES[(STYLES.indexOf(prefs.style) + 1) % STYLES.length]);
});
$('colorBtn').addEventListener('click', () => {
  setColor(COLORS[(COLORS.indexOf(prefs.color) + 1) % COLORS.length]);
});

const sheet = $('savedSheet');
$('savedBtn').addEventListener('click', () => {
  const list = $('savedList');
  list.innerHTML = '';
  if (!saved.items.length) {
    list.innerHTML = '<p class="sheet-empty">Nothing saved yet. Hit ♥ on a structure you like.</p>';
  }
  for (const item of saved.items) {
    const row = document.createElement('a');
    row.className = 'sheet-row';
    row.href = RCSB_PAGE(item.id);
    row.target = '_blank';
    row.rel = 'noopener';
    row.innerHTML = `<span class="sheet-id">${item.id}</span><span class="sheet-name"></span>`;
    row.querySelector('.sheet-name').textContent = item.name || '';
    list.append(row);
  }
  sheet.showModal();
});
$('savedClose').addEventListener('click', () => sheet.close());
sheet.addEventListener('click', e => { if (e.target === sheet) sheet.close(); });

let hintTimer;
function hideHint() {
  clearTimeout(hintTimer);
  const hint = $('hint');
  if (!hint.hidden) hint.hidden = true;
}

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea')) return;
  switch (e.key) {
    case 'ArrowDown': case 'PageDown': case 'j': e.preventDefault(); feed.next(); break;
    case 'ArrowUp': case 'PageUp': case 'k': e.preventDefault(); feed.previous(); break;
    case ' ': e.preventDefault(); feed.setPaused(!feed.paused); toast(feed.paused ? 'paused' : 'spinning'); break;
    case 'ArrowRight': case 'f': feed.nextFact(); break;
    case 's': setStyle(STYLES[(STYLES.indexOf(prefs.style) + 1) % STYLES.length]); break;
    case 'c': setColor(COLORS[(COLORS.indexOf(prefs.color) + 1) % COLORS.length]); break;
    default: break;
  }
});

// Spinning a hidden tab is pure waste.
document.addEventListener('visibilitychange', () => {
  pool.setPaused(document.hidden || feed.paused);
});

async function boot() {
  const sub = $('bootSub');
  renderSavedCount();
  $('styleLabel').textContent = prefs.style;
  $('colorLabel').textContent = COLOR_LABELS[prefs.color] || prefs.color;

  try {
    const total = await poolCount();
    sub.textContent = `shuffling ${total.toLocaleString('en-US')} structures…`;
  } catch {
    sub.textContent = 'reaching the PDB…';
  }

  const seed = (location.hash.match(/^#([0-9A-Za-z]{4}|pdb_[0-9a-zA-Z]{8})$/) || [])[1];
  try {
    await feed.start(seed ? seed.toUpperCase() : null);
  } catch (err) {
    sub.innerHTML = `couldn’t reach RCSB.<br><span class="boot-err">${err.message}</span>`;
    return;
  }

  $('boot').classList.add('gone');
  setTimeout(() => $('boot').remove(), 600);
  const hint = $('hint');
  hint.hidden = false;
  hintTimer = setTimeout(() => { hint.hidden = true; }, 4200);
}

boot();
