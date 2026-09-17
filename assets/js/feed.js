// The feed itself: slides, the scroll observer, prefetching, and the caption
// that cycles through a structure's fun facts.

import { PREFETCH_AHEAD, FACT_MS, RCSB_PAGE } from './config.js';

const KEEP_BEHIND = 12;  // slides kept above the reader before trimming
const TRIM_BATCH = 6;    // don't bother reshuffling the scroll for fewer than this
import { randomEntryIds, fetchMetadata, fetchStructure, markServed, releasedBefore } from './rcsb.js';
import { headline, handle, hashtags, factDeck } from './facts.js';

// Short enough to feel responsive on a phone, long enough that a tap with a
// little drift in it still reads as a tap.
const SWIPE_PX = 36;

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
};

export class Feed {
  constructor({ root, pool, saved, onActive }) {
    this.root = root;
    this.pool = pool;
    this.saved = saved;
    this.onActive = onActive || (() => {});
    this.slides = [];
    this.activeIndex = -1;
    this.paused = false;
    this.filling = null;

    // The feed snaps one full-height slide at a time, so the slide being
    // watched is just a division — no IntersectionObserver needed, and no
    // dependence on observer timing during a fling.
    // Throttled on a timer rather than requestAnimationFrame: rAF stops in a
    // backgrounded tab, and the feed should still know where it is when the
    // reader comes back to it.
    let pending = false;
    root.addEventListener('scroll', () => {
      if (pending) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        this._syncActive();
        this._maybeFill();
        this._trim();
      }, 90);
    }, { passive: true });
    window.addEventListener('resize', () => this._syncActive(), { passive: true });
  }

  get active() { return this.slides[this.activeIndex] || null; }

  _syncActive() {
    const height = this.root.clientHeight;
    if (!height || !this.slides.length) return;
    const index = Math.max(0, Math.min(
      this.slides.length - 1,
      Math.round(this.root.scrollTop / height),
    ));
    if (index !== this.activeIndex) this._activate(index);
  }

  /** Build the first slides. `seedId` comes from a #PDBID deep link. */
  async start(seedId) {
    if (seedId) {
      markServed(seedId);
      const [meta] = await fetchMetadata([seedId]);
      if (meta) this._append([meta]);
    }
    await this._fill(PREFETCH_AHEAD);
    if (this.slides.length) this._activate(0);
  }

  async _fill(count) {
    if (this.filling) return this.filling;
    this.filling = (async () => {
      const ids = await randomEntryIds(count);
      const metas = await fetchMetadata(ids);
      this._append(metas);
    })();
    try { await this.filling; } finally { this.filling = null; }
  }

  _maybeFill() {
    const remaining = this.slides.length - 1 - this.activeIndex;
    if (remaining >= PREFETCH_AHEAD) return;
    this._fill(PREFETCH_AHEAD - remaining).catch(() => {});
  }

  _append(metas) {
    for (const meta of metas) {
      const slide = this._buildSlide(meta);
      this.slides.push(slide);
      this.root.appendChild(slide.node);
    }
  }

  _buildSlide(meta) {
    const id = meta.rcsb_id;
    const node = el('section', 'slide');
    node.dataset.id = id;
    // Each entry gets its own background wash, keyed off the PDB code, so the
    // feed reads as a sequence of distinct posts rather than one long page.
    let hash = 0;
    for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
    node.style.setProperty('--hue', String(hash));

    const mount = el('div', 'stage-mount');
    const spinner = el('div', 'slide-status');
    spinner.innerHTML = '<span class="spinner"></span>';
    node.append(mount, spinner);

    const caption = el('div', 'caption');
    const who = handle(meta);
    const meta1 = el('div', 'cap-meta');
    meta1.append(el('span', 'cap-handle', who ? `@${who}` : `@pdb`));
    meta1.append(el('span', 'cap-dot', '·'));
    const idLink = el('a', 'cap-id', id);
    idLink.href = RCSB_PAGE(id);
    idLink.target = '_blank';
    idLink.rel = 'noopener';
    meta1.append(idLink);

    const title = el('h2', 'cap-title', headline(meta));
    title.title = meta.struct?.title || '';

    const factBox = el('button', 'fact');
    factBox.type = 'button';
    const factIcon = el('span', 'fact-icon', '');
    const factText = el('span', 'fact-text', '');
    const factLink = el('a', 'fact-link');
    factLink.target = '_blank';
    factLink.rel = 'noopener';
    factLink.hidden = true;
    factBox.append(factIcon, factText);

    const tags = el('div', 'cap-tags');
    for (const tag of hashtags(meta)) tags.append(el('span', 'tag', tag));

    caption.append(meta1, title, factBox, factLink, tags);

    const ticks = el('div', 'ticks');

    const rail = el('div', 'rail');
    const likeBtn = el('button', 'rail-btn like');
    likeBtn.innerHTML = '<span class="rail-icon">♥</span><span class="rail-label">save</span>';
    likeBtn.classList.toggle('on', this.saved.has(id));
    const shareBtn = el('button', 'rail-btn');
    shareBtn.innerHTML = '<span class="rail-icon">↗</span><span class="rail-label">link</span>';
    const recenterBtn = el('button', 'rail-btn');
    recenterBtn.innerHTML = '<span class="rail-icon">⤢</span><span class="rail-label">fit</span>';
    const shotBtn = el('button', 'rail-btn');
    shotBtn.innerHTML = '<span class="rail-icon">⎙</span><span class="rail-label">png</span>';
    const rcsbBtn = el('a', 'rail-btn');
    rcsbBtn.href = RCSB_PAGE(id);
    rcsbBtn.target = '_blank';
    rcsbBtn.rel = 'noopener';
    rcsbBtn.innerHTML = '<span class="rail-icon">↻</span><span class="rail-label">RCSB</span>';
    rail.append(likeBtn, shareBtn, recenterBtn, shotBtn, rcsbBtn);

    node.append(caption, ticks, rail);

    const slide = {
      id, meta, node, mount, spinner, factIcon, factText, factLink, ticks,
      facts: factDeck(meta), factIndex: 0, timer: null, loaded: false, failed: false,
    };

    for (let i = 0; i < slide.facts.length; i++) ticks.append(el('i', 'tick'));

    // Horizontal drag flips facts; vertical is left alone so the same gesture
    // started on the card still scrolls the feed. `touch-action: pan-y` on
    // .fact is what makes the browser hand us the horizontal movement without
    // giving up the vertical scroll. Pointer capture so a finger that drifts
    // off the card still lands its swipe.
    let downX = 0, downY = 0, swiped = false;
    factBox.addEventListener('pointerdown', e => {
      downX = e.clientX; downY = e.clientY; swiped = false;
      try { factBox.setPointerCapture(e.pointerId); } catch {}
    });
    factBox.addEventListener('pointerup', e => {
      const dx = e.clientX - downX, dy = e.clientY - downY;
      if (Math.abs(dx) < SWIPE_PX && Math.abs(dy) < SWIPE_PX) return;  // a tap
      // Anything longer was meant as a drag, so swallow the click either way:
      // sideways flips a fact, up or down was aiming at the feed.
      swiped = true;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      this._showFact(slide, slide.factIndex + (dx < 0 ? 1 : -1));
      this._restartFactTimer(slide);
    });
    // Touch scrolling steals the gesture rather than ending it, so there is no
    // pointerup and no click — just reset and let the feed have it.
    factBox.addEventListener('pointercancel', () => { swiped = false; });
    // A swipe still fires a click afterwards; without this the card would
    // advance twice and a right-swipe would land back where it started.
    factBox.addEventListener('click', () => {
      if (swiped) { swiped = false; return; }
      this._showFact(slide, slide.factIndex + 1);
      this._restartFactTimer(slide);
    });
    likeBtn.addEventListener('click', () => {
      const on = this.saved.toggle(id, { id, name: headline(meta) });
      likeBtn.classList.toggle('on', on);
      if (on) likeBtn.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.35)' }, { transform: 'scale(1)' }],
        { duration: 320, easing: 'ease-out' },
      );
    });
    shareBtn.addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#${id}`;
      try { await navigator.clipboard.writeText(url); toast('link copied'); }
      catch { toast(url); }
    });
    recenterBtn.addEventListener('click', () => this.pool.recenter(id));
    shotBtn.addEventListener('click', async () => {
      try {
        const blob = await this.pool.snapshot(id);
        const url = URL.createObjectURL(blob);
        const link = el('a');
        link.href = url;
        link.download = `instaprot-${id}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast(`saved instaprot-${id}.png`);
      } catch {
        toast('couldn’t make a picture of this one');
      }
    });

    this._showFact(slide, 0);
    return slide;
  }

  _showFact(slide, index) {
    if (!slide.facts.length) return;
    slide.factIndex = ((index % slide.facts.length) + slide.facts.length) % slide.facts.length;
    const fact = slide.facts[slide.factIndex];
    slide.factIcon.textContent = fact.icon;
    slide.factText.textContent = fact.text;
    slide.factText.animate(
      [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
      { duration: 260, easing: 'ease-out' },
    );
    if (fact.href) {
      slide.factLink.hidden = false;
      slide.factLink.href = fact.href;
      slide.factLink.textContent = fact.linkText || 'source ↗';
    } else {
      slide.factLink.hidden = true;
    }
    [...slide.ticks.children].forEach((tick, i) => tick.classList.toggle('on', i === slide.factIndex));
  }

  _restartFactTimer(slide) {
    clearInterval(slide.timer);
    if (this.paused || this.active !== slide) return;
    slide.timer = setInterval(() => this._showFact(slide, slide.factIndex + 1), FACT_MS);
  }

  async _activate(index) {
    const previous = this.active;
    if (previous) clearInterval(previous.timer);
    this.activeIndex = index;
    const slide = this.slides[index];
    if (!slide) return;

    this.pool.setActive(slide.id);
    this._restartFactTimer(slide);
    history.replaceState(null, '', `#${slide.id}`);
    this.onActive(slide);

    const neighbours = [index, index + 1, index - 1]
      .map(i => this.slides[i])
      .filter(Boolean);
    const keep = new Set(neighbours.map(s => s.id));

    for (const target of neighbours) {
      this._render(target, keep).catch(() => {});
    }
    this._enrichAge(slide).catch(() => {});
    this._maybeFill();
  }

  /**
   * Turns "released in 1991" into "released in 1991, when the whole archive
   * held 700 structures" — one extra count query, asked only for the slide
   * actually being read.
   */
  async _enrichAge(slide) {
    const fact = slide.facts.find(f => f.key === 'age');
    if (!fact || fact.enriched || !fact.year) return;
    fact.enriched = true;
    const total = await releasedBefore(fact.year - 1);
    if (!total) return;
    fact.text += ` At the start of that year the entire Protein Data Bank held ${total.toLocaleString('en-US')} structures; it now holds well over 200,000.`;
    if (this.active === slide && slide.facts[slide.factIndex] === fact) this._showFact(slide, slide.factIndex);
  }

  async _render(slide, keep) {
    if (slide.failed) return;
    if (slide.loaded) {
      // The pool may have reused this slide's canvas for someone else while the
      // reader was further down the feed; if so, draw it again.
      if (this.pool.has(slide.id)) return;
      slide.loaded = false;
      slide.node.classList.remove('ready');
    }
    if (slide.rendering) return slide.rendering;
    slide.rendering = (async () => {
      try {
        const text = await fetchStructure(slide.id);
        await this.pool.show({ key: slide.id, container: slide.mount, text, keep });
        slide.loaded = true;
        slide.spinner.hidden = true;
        slide.node.classList.add('ready');
        if (this.active === slide) this.pool.setActive(slide.id);
      } catch (err) {
        slide.failed = true;
        slide.spinner.innerHTML = '';
        slide.spinner.append(el('div', 'slide-error', `couldn’t load ${slide.id} — keep scrolling`));
      } finally {
        slide.rendering = null;
      }
    })();
    return slide.rendering;
  }

  /**
   * A doomscroller runs forever, so old slides are dropped once the reader is
   * well past them. Removing nodes above the viewport would yank the scroll
   * position, so the scroll offset is corrected by exactly the height removed.
   */
  _trim() {
    const excess = this.activeIndex - KEEP_BEHIND;
    if (excess < TRIM_BATCH) return;
    const drop = this.slides.splice(0, excess);
    for (const slide of drop) {
      clearInterval(slide.timer);
      slide.node.remove();
    }
    this.activeIndex -= drop.length;
    this.root.scrollTop -= drop.length * this.root.clientHeight;
  }

  goTo(index) {
    const slide = this.slides[index];
    if (slide) slide.node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  next() { this.goTo(this.activeIndex + 1); }
  previous() { this.goTo(this.activeIndex - 1); }

  setPaused(paused) {
    this.paused = paused;
    this.pool.setPaused(paused);
    const slide = this.active;
    if (slide) this._restartFactTimer(slide);
  }

  nextFact() {
    const slide = this.active;
    if (slide) { this._showFact(slide, slide.factIndex + 1); this._restartFactTimer(slide); }
  }

  previousFact() {
    const slide = this.active;
    if (slide) { this._showFact(slide, slide.factIndex - 1); this._restartFactTimer(slide); }
  }
}

let toastTimer;
export function toast(message) {
  let node = document.querySelector('.toast');
  if (!node) {
    node = el('div', 'toast');
    document.body.append(node);
  }
  node.textContent = message;
  node.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('on'), 1800);
}
