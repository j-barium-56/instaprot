// Turns an RCSB metadata record into the caption of a reel: a headline, a
// handful of hashtags, and a deck of fun-fact cards.

const EC_CLASSES = {
  1: 'an oxidoreductase — it moves electrons around',
  2: 'a transferase — it hands a chemical group from one molecule to another',
  3: 'a hydrolase — it cuts bonds using water',
  4: 'a lyase — it breaks bonds without water or oxidation',
  5: 'an isomerase — it rearranges a molecule into a different shape',
  6: 'a ligase — it welds two molecules together, usually burning ATP',
  7: 'a translocase — it pushes molecules across a membrane',
};

// Small molecules worth pointing at. Anything not in here still gets a plain
// "bound to X" card.
const LIGANDS = {
  HEM: ['🩸', 'It carries a heme: a flat organic ring clamped around a single iron atom. That one atom is why blood is red.'],
  HEC: ['🩸', 'It carries a heme c, stitched to the protein through cysteines rather than just resting in a pocket.'],
  ATP: ['⚡', 'Caught holding ATP — the molecule your body makes and spends roughly its own body weight of every day.'],
  ADP: ['⚡', 'Caught holding ADP: the spent half of ATP, still in the pocket after the energy was taken.'],
  GTP: ['⚡', 'Bound to GTP. Proteins that hold GTP are usually switches — GTP on means "go".'],
  GDP: ['🔌', 'Bound to GDP, which for a switch protein is the "off" position.'],
  NAD: ['🔋', 'Bound to NAD — the cell\'s rechargeable electron battery.'],
  NAP: ['🔋', 'Bound to NADP, the electron carrier cells keep charged for building things rather than burning them.'],
  FAD: ['🟡', 'Bound to FAD, a bright yellow cofactor built from vitamin B2.'],
  FMN: ['🟡', 'Bound to FMN, another riboflavin-derived cofactor — these are the reason some enzymes are literally yellow.'],
  SAM: ['✉️', 'Bound to S-adenosylmethionine, the cell\'s universal methyl-group delivery van.'],
  SAH: ['📭', 'Bound to SAH — SAM after its methyl group has already been delivered.'],
  ZN: ['🔩', 'A zinc ion sits inside it. Zinc does not react; it just holds a shape rigid, like a rivet.'],
  MG: ['🔩', 'Magnesium ions hold it together — the most common metal in enzymes that touch nucleotides.'],
  CA: ['🦴', 'Calcium ions are bound. Outside bone, calcium is mostly used as a signal and a structural clip.'],
  FE: ['🧲', 'It has bare iron bound — no ring, just the metal.'],
  FE2: ['🧲', 'It has ferrous iron (Fe²⁺) bound.'],
  SF4: ['🧊', 'It carries a 4Fe-4S cluster: a tiny cube of iron and sulfur, chemistry inherited from life before oxygen.'],
  FES: ['🧊', 'It carries a 2Fe-2S cluster — a mineral fragment used as a wire.'],
  CU: ['🟠', 'Copper is bound. Copper proteins are often blue, and often move electrons.'],
  MN: ['🟣', 'Manganese is bound — the metal at the heart of splitting water in photosynthesis.'],
  NAG: ['🍭', 'Sugar chains hang off it: this protein is glycosylated, which usually means it lives outside the cell or in a membrane.'],
  RET: ['👁️', 'It holds retinal, a vitamin-A fragment that changes shape when it absorbs a photon. This is how seeing starts.'],
  CLR: ['🧈', 'Cholesterol is bound — a strong hint this protein sits in a membrane.'],
  GOL: ['🧪', 'The glycerol in the model is not biology. It is antifreeze, added so the crystal survives being plunged into liquid nitrogen.'],
  EDO: ['🧪', 'Those ethylene glycol molecules are cryoprotectant, not cargo — leftovers from freezing the crystal.'],
  PEG: ['🧪', 'The PEG in here came from the drop the crystal grew in, not from the cell.'],
  SO4: ['🧂', 'The sulfates are usually crystallisation salt sitting in positively charged pockets, not real ligands.'],
  PO4: ['🧂', 'Phosphate ions are bound — sometimes real signal, sometimes just what was in the buffer.'],
  ACT: ['🧂', 'The acetate came out of the buffer.'],
  CLA: ['🌿', 'It holds chlorophyll — the pigment that takes sunlight apart.'],
  BCL: ['🌿', 'It holds bacteriochlorophyll, the version of the pigment tuned to infrared light.'],
};

// Organisms with a story. Matched by the start of the scientific name.
const ORGANISMS = [
  ['Homo sapiens', '🧍', 'you'],
  ['Escherichia coli', '🦠', 'the lab rat of molecular biology'],
  ['Saccharomyces cerevisiae', '🍞', 'brewer\'s yeast'],
  ['Thermus thermophilus', '🌋', 'a bacterium that lives near boiling water'],
  ['Thermus aquaticus', '🌋', 'the hot-spring bacterium that gave us the enzyme behind every PCR test'],
  ['Pyrococcus', '🌋', 'an archaeon happiest above 100 °C'],
  ['Sulfolobus', '🌋', 'an archaeon that lives in hot acid'],
  ['Deinococcus radiodurans', '☢️', 'the bacterium that shrugs off radiation that would kill you thousands of times over'],
  ['Mycobacterium tuberculosis', '🫁', 'the cause of TB'],
  ['Plasmodium falciparum', '🦟', 'the malaria parasite'],
  ['Severe acute respiratory syndrome coronavirus 2', '🦠', 'SARS-CoV-2'],
  ['Human immunodeficiency virus', '🎗️', 'HIV'],
  ['Influenza A virus', '🤧', 'influenza'],
  ['Arabidopsis thaliana', '🌱', 'a small weed that plant biology runs on'],
  ['Drosophila melanogaster', '🪰', 'the fruit fly'],
  ['Caenorhabditis elegans', '🪱', 'a millimetre-long worm with exactly 959 cells'],
  ['Danio rerio', '🐟', 'zebrafish'],
  ['Mus musculus', '🐁', 'the house mouse'],
  ['Bos taurus', '🐄', 'cattle — a lot of classic structures came from an abattoir'],
  ['Gallus gallus', '🐔', 'the chicken; hen egg white lysozyme is the most-solved protein in the PDB'],
  ['Sus scrofa', '🐖', 'the pig'],
  ['Oryctolagus cuniculus', '🐇', 'the rabbit'],
  ['Halobacterium', '🧂', 'an archaeon that needs near-saturated salt to survive'],
  ['Aequorea victoria', '💚', 'the jellyfish that gave biology green fluorescent protein'],
  ['Synechocystis', '🌿', 'a cyanobacterium — the lineage that first put oxygen in the air'],
  ['Bacillus subtilis', '🦠', 'a soil bacterium and a workhorse of industrial enzymes'],
  ['Staphylococcus aureus', '🧫', 'the cause of staph infections, MRSA included'],
];

const AA_NAMES = {
  A: 'alanine', R: 'arginine', N: 'asparagine', D: 'aspartate', C: 'cysteine',
  Q: 'glutamine', E: 'glutamate', G: 'glycine', H: 'histidine', I: 'isoleucine',
  L: 'leucine', K: 'lysine', M: 'methionine', F: 'phenylalanine', P: 'proline',
  S: 'serine', T: 'threonine', W: 'tryptophan', Y: 'tyrosine', V: 'valine',
};

const UBIQUITIN_KDA = 8.6;

const titleCase = s => s.replace(/\w[^\s/-]*/g, w => (
  w.length > 3 && w === w.toUpperCase() && !/\d/.test(w)
    ? w[0] + w.slice(1).toLowerCase()
    : w
));

const commas = n => n.toLocaleString('en-US');

const yearOf = entry => {
  const d = entry.rcsb_accession_info?.initial_release_date;
  return d ? Number(d.slice(0, 4)) : null;
};

const prettyDate = iso => new Date(iso).toLocaleDateString('en-US', {
  year: 'numeric', month: 'long', day: 'numeric',
});

const firstEntity = entry => entry.polymer_entities?.[0];

// "synthetic construct" and friends are bookkeeping, not provenance — a real
// organism further down the list is always the more interesting answer.
const PLACEHOLDER_ORGANISM = /^(synthetic construct|unidentified|unclassified|artificial)/i;

function sourceOrganisms(entry) {
  const names = (entry.polymer_entities || [])
    .flatMap(e => e.rcsb_entity_source_organism || [])
    .map(o => o?.ncbi_scientific_name)
    .filter(Boolean);
  const real = names.filter(n => !PLACEHOLDER_ORGANISM.test(n));
  return { names, real, primary: real[0] || names[0] || null };
}

/** The name shown as the reel's headline. */
export function headline(entry) {
  const e = firstEntity(entry);
  const uniprot = e?.uniprots?.[0]?.rcsb_uniprot_protein?.name?.value;
  const desc = e?.rcsb_polymer_entity?.pdbx_description;
  const name = uniprot || desc || entry.struct?.title || entry.rcsb_id;
  return titleCase(name.replace(/\s*\(E\.C\..*?\)/i, '').trim());
}

/** The "@handle" line: the organism the molecule came from. */
export function handle(entry) {
  const org = sourceOrganisms(entry).primary;
  if (!org) return null;
  return org.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export function hashtags(entry) {
  const raw = [
    entry.struct_keywords?.pdbx_keywords,
    ...(entry.struct_keywords?.text || '').split(/,\s*/),
  ].filter(Boolean);
  const seen = new Set();
  const tags = [];
  for (const term of raw) {
    const tag = term.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (tag.length < 3 || tag.length > 24 || seen.has(tag)) continue;
    seen.add(tag);
    tags.push('#' + tag);
    if (tags.length === 5) break;
  }
  return tags;
}

const card = (key, icon, text, extra = {}) => ({ key, icon, text, ...extra });

function organismFact(entry) {
  const { names, real, primary } = sourceOrganisms(entry);
  if (!primary) return null;
  if (!real.length) {
    return card('organism', '🛠️', 'No organism made this one: the chain is a synthetic construct, designed or stitched together in a lab and then produced to order.');
  }
  const known = ORGANISMS.find(([prefix]) => primary.startsWith(prefix));
  const others = [...new Set(names.filter(o => o !== primary))];
  const tail = others.length ? ` It is shown here together with ${PLACEHOLDER_ORGANISM.test(others[0]) ? 'a synthetic chain' : `protein from ${others[0]}`}.` : '';
  if (known) return card('organism', known[1], `This one came out of ${primary} — ${known[2]}.${tail}`);
  return card('organism', '🧬', `This one came out of ${primary}.${tail}`);
}

function methodFact(entry) {
  const method = entry.exptl?.[0]?.method || entry.rcsb_entry_info?.experimental_method || '';
  const res = entry.rcsb_entry_info?.resolution_combined?.[0];
  const m = method.toUpperCase();
  if (m.includes('ELECTRON MICROSCOPY')) {
    return card('method', '❄️', `Solved by cryo-EM: the sample was frozen so fast the water never had time to form ice crystals, then photographed with electrons${res ? ` at ${res} Å` : ''}.`);
  }
  if (m.includes('NMR')) {
    const models = entry.rcsb_entry_info?.deposited_model_count || 1;
    return card('method', '🧲', `Solved by NMR in solution, not frozen in a crystal${models > 1 ? ` — which is why there are ${models} models here instead of one. They are all consistent with the data.` : '.'}`);
  }
  if (m.includes('NEUTRON')) {
    return card('method', '⚛️', 'Solved with neutrons instead of X-rays — the one technique that can actually see hydrogen atoms.');
  }
  if (m.includes('X-RAY') && res) {
    let note = '';
    if (res <= 1.0) note = ' That is atomic resolution: individual atoms are separate blobs in the map.';
    else if (res <= 1.6) note = ' Sharp enough to see which way individual side chains are pointing, and to spot ordered water.';
    else if (res <= 2.5) note = ' Typical, workable resolution — the backbone and most side chains are unambiguous.';
    else if (res <= 3.5) note = ' Low resolution: the fold is solid, but individual side chains are partly interpretation.';
    else note = ' Very low resolution — treat the detail here as a sketch of the shape, not a photograph.';
    return card('method', '🔬', `X-ray crystallography at ${res} Å.${note}`);
  }
  return method ? card('method', '🔬', `Determined by ${method.toLowerCase()}.`) : null;
}

function sizeFact(entry) {
  const info = entry.rcsb_entry_info || {};
  const mass = info.molecular_weight;
  const residues = info.deposited_polymer_monomer_count;
  const atoms = info.deposited_atom_count;
  if (!mass && !residues) return null;
  const parts = [];
  if (mass) parts.push(`${mass} kDa`);
  if (residues) parts.push(`${commas(residues)} amino acids`);
  if (atoms) parts.push(`${commas(atoms)} atoms in the model`);
  const ratio = mass ? mass / UBIQUITIN_KDA : 0;
  const compare = ratio >= 2
    ? ` That is about ${Math.round(ratio)}× the mass of ubiquitin, the usual yardstick for "small protein".`
    : '';
  return card('size', '⚖️', `${parts.join(', ')}.${compare}`);
}

function ageFact(entry) {
  const date = entry.rcsb_accession_info?.initial_release_date;
  if (!date) return null;
  const year = Number(date.slice(0, 4));
  const age = new Date().getFullYear() - year;
  return card('age', '📅', `Released to the public on ${prettyDate(date)}${age >= 1 ? `, ${age} year${age === 1 ? '' : 's'} ago` : ''}.`, { year });
}

function ligandFact(entry) {
  const comps = (entry.nonpolymer_entities || [])
    .map(n => n.nonpolymer_comp?.chem_comp)
    .filter(Boolean);
  if (!comps.length) return null;
  const known = comps.find(c => LIGANDS[c.id] && !['GOL', 'EDO', 'PEG', 'SO4', 'PO4', 'ACT'].includes(c.id));
  if (known) {
    const [icon, text] = LIGANDS[known.id];
    return card('ligand', icon, text);
  }
  const junk = comps.find(c => LIGANDS[c.id]);
  if (junk) {
    const [icon, text] = LIGANDS[junk.id];
    return card('ligand', icon, text);
  }
  const named = comps.find(c => c.name && c.name.length < 70);
  if (!named) return null;
  return card('ligand', '💊', `There is a small molecule sitting in it: ${named.name.toLowerCase()} (${named.id}).`);
}

function enzymeFact(entry) {
  const lineage = entry.polymer_entities
    ?.map(e => e.rcsb_polymer_entity?.rcsb_ec_lineage)
    .find(l => l?.length);
  if (!lineage) return null;
  const full = lineage[lineage.length - 1];
  const top = Number(lineage[0].id);
  const klass = EC_CLASSES[top];
  const specific = full.name && full.id !== String(top) ? ` Specifically: ${full.name.toLowerCase()} (EC ${full.id}).` : '';
  return card('enzyme', '✂️', `It is an enzyme${klass ? `, and by class ${klass}` : ''}.${specific}`);
}

function symmetryFact(entry) {
  const sym = entry.assemblies
    ?.flatMap(a => a.rcsb_struct_symmetry || [])
    .find(s => s?.kind === 'Global Symmetry');
  if (!sym) return null;
  const state = (sym.oligomeric_state || '').toLowerCase();
  if (!state || state.includes('monomer')) {
    return card('symmetry', '1️⃣', 'In the cell this one works alone — it does not pair up into a larger assembly.');
  }
  const notes = {
    Cyclic: 'arranged in a ring',
    Dihedral: 'a ring of rings — two stacked layers',
    Tetrahedral: 'arranged on the corners of a tetrahedron',
    Octahedral: 'arranged with the symmetry of a cube',
    Icosahedral: 'a closed shell, the geometry viruses use for their coats',
    Helical: 'stacked into a helical filament',
  };
  const note = notes[sym.type] ? `, ${notes[sym.type]}` : '';
  return card('symmetry', '🔁', `The working molecule is a ${state}${note} — point group ${sym.symbol}.`);
}

function sequenceFact(entry) {
  const entities = (entry.polymer_entities || [])
    .map(e => e.entity_poly?.pdbx_seq_one_letter_code_can)
    .filter(s => s && s.length > 40);
  if (!entities.length) return null;
  const seq = entities.sort((a, b) => b.length - a.length)[0];
  const counts = {};
  for (const ch of seq) counts[ch] = (counts[ch] || 0) + 1;
  const cys = (counts.C || 0) / seq.length;
  const gly = (counts.G || 0) / seq.length;
  const pro = (counts.P || 0) / seq.length;
  const trp = counts.W || 0;
  if (gly > 0.18 && pro > 0.12) {
    return card('sequence', '🪢', `${Math.round(gly * 100)}% of this chain is glycine and ${Math.round(pro * 100)}% is proline — the signature of a collagen-like rope.`);
  }
  if (cys > 0.07) {
    return card('sequence', '🔗', `${Math.round(cys * 100)}% of its residues are cysteine. Chains that cysteine-rich are usually stapled together by disulfide bonds, which is how proteins survive outside the cell.`);
  }
  if (!trp) {
    return card('sequence', '🕵️', 'Not one tryptophan in the whole chain — which also means it barely absorbs UV light, a genuine nuisance when you are trying to measure how much of it you have.');
  }
  const [top, n] = Object.entries(counts)
    .filter(([ch]) => AA_NAMES[ch])
    .sort((a, b) => b[1] - a[1])[0] || [];
  if (!top) return null;
  return card('sequence', '🔤', `Its longest chain is ${commas(seq.length)} residues, and the amino acid it uses most is ${AA_NAMES[top]} (${Math.round((n / seq.length) * 100)}% of the chain).`);
}

function disulfideFact(entry) {
  const n = entry.rcsb_entry_info?.disulfide_bond_count;
  if (!n) return null;
  return card('disulfide', '🔗', `${n} disulfide bond${n === 1 ? '' : 's'} pin this structure shut — covalent staples between cysteines, far stronger than the rest of the folding.`);
}

function nucleicFact(entry) {
  const dna = entry.rcsb_entry_info?.polymer_entity_count_DNA || 0;
  const rna = entry.rcsb_entry_info?.polymer_entity_count_RNA || 0;
  if (!dna && !rna) return null;
  const what = dna && rna ? 'both DNA and RNA' : dna ? 'DNA' : 'RNA';
  return card('nucleic', '🧬', `This is not just protein — there is ${what} in the picture, caught in the act of being read, cut, copied or held.`);
}

function familyFact(entry) {
  const anns = entry.polymer_entities?.flatMap(e => e.rcsb_polymer_entity_annotation || []) || [];
  const fam = anns.find(a => a.type === 'Pfam') || anns.find(a => a.type === 'InterPro');
  if (!fam?.name) return null;
  const clean = fam.name.replace(/\s*\(.*?\)\s*$/, '');
  return card('family', '🏷️', `Its fold belongs to the ${clean} family — the same architecture turns up across the tree of life.`);
}

function goFact(entry) {
  const anns = entry.polymer_entities?.flatMap(e => e.rcsb_polymer_entity_annotation || []) || [];
  const go = anns.filter(a => a.type === 'GO' && a.name && a.name.length < 60).slice(0, 3);
  if (go.length < 2) return null;
  return card('go', '🧠', `What it is annotated to do: ${go.map(g => g.name).join('; ')}.`);
}

function crystalFact(entry) {
  const grow = entry.exptl_crystal_grow?.[0];
  if (!grow?.pH) return null;
  const temp = grow.temp ? ` at ${Math.round(grow.temp - 273.15)} °C` : '';
  return card('crystal', '💎', `The crystal behind this model grew at pH ${grow.pH}${temp}. Getting a protein to crystallise at all is still mostly trial and error.`);
}

function hostFact(entry) {
  const host = entry.polymer_entities
    ?.flatMap(e => e.rcsb_entity_host_organism || [])
    .find(h => h?.ncbi_scientific_name)?.ncbi_scientific_name;
  const source = sourceOrganisms(entry).primary;
  if (!host || host === source) return null;
  return card('host', '🏭', `The protein itself is from ${source || 'another organism'}, but it was grown in ${host} — a gene moved into a more cooperative cell and harvested by the litre.`);
}

function paperFact(entry) {
  const cit = entry.rcsb_primary_citation;
  if (!cit?.title) return null;
  const journal = cit.rcsb_journal_abbrev || cit.journal_abbrev;
  const authors = cit.rcsb_authors || [];
  const who = authors.length
    ? `${authors[0].split(',')[0]}${authors.length > 1 ? ' et al.' : ''}`
    : '';
  const href = cit.pdbx_database_id_DOI
    ? `https://doi.org/${cit.pdbx_database_id_DOI}`
    : cit.pdbx_database_id_PubMed
      ? `https://pubmed.ncbi.nlm.nih.gov/${cit.pdbx_database_id_PubMed}/`
      : null;
  return card('paper', '📖', `“${cit.title.replace(/\.$/, '')}” — ${who ? `${who}, ` : ''}${journal || 'unpublished'}${cit.year ? `, ${cit.year}` : ''}.`, {
    href, linkText: 'read the paper',
  });
}

const HOOK_WORDS = /\b(reveal|unexpected|surprising|first|here we|we show|suggest|mechanism|explain|unlike|previously unknown|novel|allow)/i;

function abstractFact(entry) {
  const text = entry.pubmed?.rcsb_pubmed_abstract_text;
  if (!text || text.length < 120) return null;
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .filter(s => s.length > 60 && s.length < 320);
  if (!sentences.length) return null;
  const scored = sentences
    .map((s, i) => ({ s, score: (HOOK_WORDS.test(s) ? 2 : 0) + (i >= sentences.length - 2 ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  const pick = scored[0].s;
  return card('abstract', '📝', `From the paper that described it: “${pick}”`);
}

function authorFact(entry) {
  const authors = entry.audit_author?.map(a => a.name).filter(Boolean) || [];
  if (authors.length < 6) return null;
  return card('authors', '🧑‍🔬', `${authors.length} people are named as depositors on this one structure.`);
}

function chainFact(entry) {
  const chains = entry.polymer_entities
    ?.flatMap(e => e.rcsb_polymer_entity_container_identifiers?.auth_asym_ids || []) || [];
  if (chains.length < 3) return null;
  const distinct = entry.polymer_entities?.length || 1;
  return card('chains', '🧩', `${chains.length} polymer chains in the file, of ${distinct} different kind${distinct === 1 ? '' : 's'} — this is an assembly, not a single molecule.`);
}

function idFact(entry) {
  const [first] = entry.rcsb_id;
  const old = /[1-4]/.test(first);
  return card('id', '🆔', `PDB ${entry.rcsb_id}. The codes are handed out roughly in order, so the first character dates it — this one is ${old ? 'from the archive\u2019s early decades' : 'recent'}. Four characters only stretch so far, and the PDB already has an eight-character format (pdb_00001abc) waiting for when they run out.`, {
    href: `https://www.rcsb.org/structure/${entry.rcsb_id}`,
    linkText: 'open on RCSB',
  });
}

/** The full deck for one entry, most interesting first. */
export function factDeck(entry) {
  const facts = [
    organismFact(entry),
    abstractFact(entry),
    methodFact(entry),
    ligandFact(entry),
    enzymeFact(entry),
    symmetryFact(entry),
    sizeFact(entry),
    nucleicFact(entry),
    sequenceFact(entry),
    familyFact(entry),
    disulfideFact(entry),
    ageFact(entry),
    hostFact(entry),
    crystalFact(entry),
    goFact(entry),
    chainFact(entry),
    authorFact(entry),
    paperFact(entry),
    idFact(entry),
  ].filter(Boolean);
  return facts;
}

export { yearOf, commas };
