// A small pool of live py2Dmol viewers.
//
// Each viewer owns a WebGL context and browsers only allow a handful at once,
// so the feed never creates one per slide. Instead a few canvases are kept
// alive and moved through the DOM to whichever slides are near the reader,
// reloading their coordinates as they go. Reparenting a canvas keeps its
// context, so this is much cheaper than tearing viewers down.

import { POOL_SIZE } from './config.js';

const BACKGROUND_IS_TRANSPARENT = true;

export class StagePool {
  constructor({ size = POOL_SIZE, style, color } = {}) {
    this.size = size;
    this.style = style;
    this.color = color;
    this.slots = [];
    this.clock = 0;
    this.activeKey = null;
  }

  /** py2Dmol attaches to a plain div; we make one slot's worth of them lazily. */
  _newSlot() {
    const host = document.createElement('div');
    host.className = 'stage';
    // py2Dmol reads the wheel as zoom. Here the wheel is how you move through
    // the feed, so the event is stopped before it reaches the canvas — and,
    // crucially, without preventDefault, so the scroller still scrolls.
    host.addEventListener('wheel', e => e.stopPropagation(), { capture: true });
    const slot = { host, viewer: null, key: null, token: 0, used: 0 };
    this.slots.push(slot);
    return slot;
  }

  _slotFor(key, keep) {
    const mine = this.slots.find(s => s.key === key);
    if (mine) return mine;
    if (this.slots.length < this.size) return this._newSlot();
    const free = this.slots
      .filter(s => !keep.has(s.key))
      .sort((a, b) => a.used - b.used)[0];
    return free || this.slots.sort((a, b) => a.used - b.used)[0];
  }

  /**
   * Put `key`'s structure on screen inside `container`. `keep` lists the keys
   * that must not be evicted (the reader's neighbours).
   */
  async show({ key, container, text, keep = new Set() }) {
    const slot = this._slotFor(key, new Set([...keep, key]));
    slot.used = ++this.clock;

    if (slot.host.parentElement !== container) container.appendChild(slot.host);
    if (slot.key === key && slot.viewer) {
      this._applyLook(slot.viewer);
      return slot.viewer;
    }

    const token = ++slot.token;
    slot.key = key;

    // Wait for layout: py2Dmol sizes itself from the host, and a zero-height
    // host produces a zero-size canvas that never recovers.
    if (!slot.host.clientHeight) await new Promise(requestAnimationFrame);
    if (token !== slot.token) return null;

    try {
      if (!slot.viewer) {
        slot.viewer = py2Dmol.show(slot.host, text, {
          name: key,
          style: this.style,
          color: this.color,
          box: false,
          controls: false,
          orient: true,
          select: false,
        });
      } else {
        slot.viewer.resetAll();
        slot.viewer.load(text, key);
        slot.viewer.setStyle(this.style);
        slot.viewer.setColor(this.color);
        slot.viewer.orient({ animate: false });
      }
      this._applyLook(slot.viewer);
      slot.viewer.autoRotate = key === this.activeKey;
      slot.viewer.render('instaprot:show');
      return slot.viewer;
    } catch (err) {
      slot.key = null;
      throw err;
    }
  }

  _applyLook(viewer) {
    if (BACKGROUND_IS_TRANSPARENT && !viewer.isTransparent) viewer.setClearColor(true);
  }

  /** Only the slide being watched is allowed to burn GPU on spinning. */
  setActive(key) {
    this.activeKey = key;
    for (const slot of this.slots) {
      if (!slot.viewer) continue;
      const shouldSpin = slot.key === key && !this.paused;
      if (slot.viewer.autoRotate !== shouldSpin) {
        slot.viewer.autoRotate = shouldSpin;
        slot.viewer.render('instaprot:spin');
      }
    }
  }

  setPaused(paused) {
    this.paused = paused;
    this.setActive(this.activeKey);
  }

  setStyle(style) {
    this.style = style;
    for (const slot of this.slots) {
      if (!slot.viewer) continue;
      slot.viewer.setStyle(style);
      this._applyLook(slot.viewer);
      slot.viewer.render('instaprot:style');
    }
  }

  setColor(color) {
    this.color = color;
    for (const slot of this.slots) {
      if (!slot.viewer) continue;
      try { slot.viewer.setColor(color); } catch { /* mode unsupported for this data */ }
      slot.viewer.render('instaprot:color');
    }
  }

  /** Re-frame the structure on the active slide. */
  recenter(key) {
    const slot = this.slots.find(s => s.key === key);
    if (slot?.viewer) { slot.viewer.orient(); slot.viewer.render('instaprot:orient'); }
  }

  /**
   * A transparent PNG of one structure as it is currently posed. py2Dmol
   * re-renders offscreen for this, so it is the view on screen at full quality
   * rather than a scrape of the canvas.
   */
  snapshot(key) {
    const slot = this.slots.find(s => s.key === key);
    if (!slot?.viewer) return Promise.reject(new Error('nothing to save yet'));
    return new Promise((resolve, reject) => {
      slot.viewer._renderImage(
        { format: 'png', dpi: 200, transparent: true },
        (image, err) => (err || !image?.blob ? reject(err || new Error('render failed')) : resolve(image.blob)),
      );
    });
  }

  has(key) { return this.slots.some(s => s.key === key && s.viewer); }
}
