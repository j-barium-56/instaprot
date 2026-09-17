// Tunables for the feed. Everything here is client-side; there is no server.

export const SEARCH_URL = 'https://search.rcsb.org/rcsbsearch/v2/query';
export const GRAPHQL_URL = 'https://data.rcsb.org/graphql';
export const FILE_URL = id => `https://files.rcsb.org/download/${id}.cif`;
export const FILE_URL_FALLBACK = id => `https://files.rcsb.org/download/${id}.pdb`;
export const RCSB_PAGE = id => `https://www.rcsb.org/structure/${id}`;

// Keeps the feed to structures that are worth looking at and quick to download:
// big enough to have a shape, small enough that a phone can draw it.
export const MIN_RESIDUES = 60;
export const MAX_RESIDUES = 2000;
export const MAX_ATOMS = 40000;

export const PREFETCH_AHEAD = 4;   // slides kept queued in front of the reader
export const POOL_SIZE = 3;        // live py2Dmol canvases (one WebGL context each)
export const STRUCTURE_CACHE = 24; // parsed coordinate files kept in memory
export const FACT_MS = 5200;       // how long each fact card holds the caption

export const STYLES = ['richardson', 'tube', 'ribbon', '3d'];
export const COLORS = ['rainbow', 'chain', 'ss', 'hydrophobicity', 'deepmind'];

export const COLOR_LABELS = {
  chain: 'chain',
  rainbow: 'rainbow',
  ss: 'secondary structure',
  hydrophobicity: 'hydrophobicity',
  deepmind: 'deepmind',
};
