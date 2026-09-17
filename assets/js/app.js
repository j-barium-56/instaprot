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

// Two separate lists, deliberately not merged. `saved` is whatever this
// visitor hearted, in their own localStorage — friends open the same site and
// only ever see their own. `picks` is the curated list committed to picks.json,
// read-only, shown to everyone. Merging them (an earlier design) made a
// friend's list fill with structures they never saved, and implied they could
// commit to a repo they cannot write to.
const saved = {
  items: JSON.parse(localStorage.getItem('instaprot:saved') || '[]'),
  has(id) { return this.items.some(i => i.id === id); },
  toggle(id, item) {
    const on = !this.has(id);
    this.items = on ? [item, ...this.items].slice(0, 200) : this.items.filter(i => i.id !== id);
    this._persist();
    return on;
  },
  add(entries) {
    const fresh = entries.filter(e => e && e.id && !this.has(e.id));
    if (!fresh.length) return 0;
    this.items = [...fresh, ...this.items].slice(0, 200);
    this._persist();
    return fresh.length;
  },
  // The body picks.json wants, for whoever can commit it.
  toJSON() {
    return JSON.stringify({ picks: this.items.map(i => ({ id: i.id, name: i.name || '' })) }, null, 2);
  },
  // Durability for people without repo access: the whole list in a URL.
  toLink() {
    const ids = this.items.map(i => i.id).join(',');
    return `${location.origin}${location.pathname}#saves=${ids}`;
  },
  _persist() {
    try { localStorage.setItem('instaprot:saved', JSON.stringify(this.items)); } catch {}
    renderSavedCount();
  },
};

const picks = { items: [] };

// no-cache because Pages serves this with a long max-age, and a stale copy
// would silently swallow whatever was just committed.
async function loadPicks() {
  try {
    const res = await fetch('picks.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.picks)) picks.items = data.picks.filter(p => p && p.id);
  } catch {}
}

// A bookmarked #saves= link restores a list on any device. The hash is cleared
// afterwards so a later reload cannot resurrect something since un-hearted.
function importFromHash() {
  const m = location.hash.match(/^#saves=([0-9A-Za-z,_]+)$/);
  if (!m) return 0;
  const entries = m[1].split(',').filter(Boolean).map(id => ({ id: id.toUpperCase(), name: '' }));
  const n = saved.add(entries);
  history.replaceState(null, '', location.pathname + location.search);
  return n;
}

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

function row(item, muted) {
  const a = document.createElement('a');
  a.className = 'sheet-row' + (muted ? ' is-pick' : '');
  a.href = RCSB_PAGE(item.id);
  a.target = '_blank';
  a.rel = 'noopener';
  a.innerHTML = `<span class="sheet-id"></span><span class="sheet-name"></span>`;
  a.querySelector('.sheet-id').textContent = item.id;
  a.querySelector('.sheet-name').textContent = item.name || '';
  return a;
}

function section(title, items, muted) {
  const frag = document.createDocumentFragment();
  const h = document.createElement('h3');
  h.className = 'sheet-section';
  h.textContent = title;
  frag.append(h);
  for (const item of items) frag.append(row(item, muted));
  return frag;
}

function renderSheet() {
  const list = $('savedList');
  list.innerHTML = '';

  if (saved.items.length) {
    list.append(section('Yours', saved.items, false));
  } else {
    list.innerHTML = '<p class="sheet-empty">Nothing saved yet. Hit \u2665 on a structure you like.</p>';
  }

  // A pick you have also hearted is already listed above; showing it twice
  // just reads as a bug.
  const unsaved = picks.items.filter(p => !saved.has(p.id));
  if (unsaved.length) list.append(section('Picks', unsaved, true));
}

$('savedBtn').addEventListener('click', () => {
  renderSheet();
  sheet.showModal();
});
$('savedClose').addEventListener('click', () => sheet.close());

async function copy(text, ok) {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    console.log(text);
    toast('clipboard blocked — logged to console');
  }
}

// Works for anyone, repo access or not: the list travels in the URL.
$('savedLink').addEventListener('click', () => {
  if (!saved.items.length) return toast('nothing saved yet');
  copy(saved.toLink(), 'link copied — bookmark it');
});

// The paste-into-GitHub half of the round trip, and useful only to whoever can
// push. Hidden unless this device has been flagged the owner's via #owner.
$('savedJson').addEventListener('click', () => {
  copy(saved.toJSON(), 'copied — paste into picks.json');
});

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
    case 'ArrowLeft': feed.previousFact(); break;
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
  if (location.hash === '#owner') {
    try { localStorage.setItem('instaprot:owner', '1'); } catch {}
    history.replaceState(null, '', location.pathname);
  }
  if (localStorage.getItem('instaprot:owner')) $('savedJson').hidden = false;

  const imported = importFromHash();
  await loadPicks();
  if (imported) toast(`imported ${imported} saved structure${imported === 1 ? '' : 's'}`);
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
