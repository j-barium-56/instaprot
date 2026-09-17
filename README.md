# InstaProt

Doomscroll the Protein Data Bank.

A vertical, full-screen feed of protein structures pulled at random out of the
PDB, each one spinning, each one with a caption of fun facts assembled from its
own metadata and the paper that described it. Swipe up for the next protein.

Structures are drawn with [py2Dmol](https://github.com/sokrypton/py2Dmol)
(Sergey Ovchinnikov), on a transparent canvas so the page's colour shows
through.

It is a static site — no build step, no server, no API keys. Everything happens
in the browser against RCSB's public endpoints.

## Run it locally

```bash
python3 serve.py
```

Then open <http://localhost:8777>. (A server is needed only because the app is
written as ES modules, which browsers refuse to load over `file://`.)

## Deploy to GitHub Pages

`.github/workflows/pages.yml` publishes the repository root on every push to
`main`. Enable it once, under **Settings → Pages → Build and deployment →
Source → GitHub Actions**, and the next push goes live. There is nothing to
build and no output directory.

## Controls

| | |
| --- | --- |
| swipe / scroll, `↑` `↓` `j` `k` | previous / next structure |
| tap the fact card, swipe it left, `→` or `f` | next fact |
| swipe the fact card right, `←` | previous fact |
| `space` | stop and start the spin |
| `s` / `c` | cycle drawing style / colour scheme |
| ♥ | keep a structure in your saved list ([see below](#saves-picks-and-sharing)) |
| ↗ | copy a link straight to that structure |
| ⤢ | re-centre the view after you have dragged it around |
| ⎙ | download a transparent PNG of the structure as posed |

`https://…/#1HHO` opens on that entry and then keeps shuffling.

## Saves, picks and sharing

There is no account and no server — GitHub Pages serves static files only — so
saves work in two layers.

**Yours.** ♥ writes to `localStorage`: per browser, private to you, and cleared
by iOS Safari after about a week of not opening the site. **copy link** in the
Saved sheet packs your ids into a `#saves=…` URL; opening it anywhere restores
them. That is the backup, and it works for visitors who have no repo access.
Adding the site to your Home Screen also makes Safari far less eager to evict.

**Picks.** [`picks.json`](picks.json) is a curated list committed to the repo
and shown to *everyone*, in its own section below their own saves, read-only. To
add to it, visit `#owner` once to unlock the **json** button, then paste what it
copies over `picks.json` and commit — editing on github.com is enough.

Your friends' saves never leave their own browsers, and nothing they do can
touch your picks.

## How it works

**Picking at random.** RCSB's search API has no shuffle, so `rcsb.js` asks for
the total number of entries matching the feed's filters (protein, 60–2000
residues, under 40,000 atoms — big enough to have a shape, small enough to draw
on a phone), then requests a single row at a uniformly random offset into that
result set. One request per structure, and a genuine uniform draw over the whole
filtered archive.

**The facts.** One GraphQL request per batch of entries returns everything
`facts.js` needs: source organism, method and resolution, bound ligands, EC
lineage, assembly symmetry, sequence, Pfam and GO annotations, crystallisation
conditions, the primary citation, and the PubMed abstract. `factDeck()` turns
that into a ranked deck of cards — some are lookups (what a heme is, why the
glycerol in the model is antifreeze rather than biology), most are computed from
the entry itself. The caption cycles through them.

**Keeping it smooth.** Every py2Dmol viewer owns a WebGL context and browsers
only allow a handful, so `viewer.js` keeps a pool of three and moves those
canvases through the DOM to whichever slides are near the reader, reloading
coordinates as they go. Only the slide being watched is allowed to spin. Slides
far behind the reader are dropped, with the scroll offset corrected by exactly
the height removed, so the feed can run indefinitely without growing.

## Layout

```
index.html              markup and the script tags
assets/css/app.css      the whole look
assets/js/config.js     tunables: filters, pool sizes, styles, timings
assets/js/rcsb.js       random sampling, metadata, coordinate files
assets/js/facts.js      metadata in, fun facts out
assets/js/viewer.js     the py2Dmol viewer pool
assets/js/feed.js       slides, scrolling, prefetching, the caption
assets/js/app.js        wiring: toolbar, keys, saved list, boot
picks.json              curated picks, shown to every visitor
vendor/                 the py2Dmol embed bundle (see vendor/README.md)
```

`window.instaprot` exposes the feed, the viewer pool and the saved list from the
console.

## Handoff

[HANDOFF.md](HANDOFF.md) has the current state, the decisions behind the
awkward bits, and the gotchas — read it before changing the viewer pool or
upgrading py2Dmol.

## Credits

Structures and metadata from the [RCSB Protein Data Bank](https://www.rcsb.org/).
Abstracts via RCSB from PubMed. Rendering by py2Dmol.
