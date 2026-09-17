// Everything that talks to RCSB: picking random entries, pulling their
// metadata, and downloading coordinates.

import {
  SEARCH_URL, GRAPHQL_URL, FILE_URL, FILE_URL_FALLBACK,
  MIN_RESIDUES, MAX_RESIDUES, MAX_ATOMS, STRUCTURE_CACHE,
} from './config.js';

const rangeQuery = (attribute, operator, value) => ({
  type: 'terminal', service: 'text', parameters: { attribute, operator, value },
});

// The pool we sample from: real experimental entries containing protein, of a
// size that renders smoothly.
const POOL_QUERY = {
  type: 'group',
  logical_operator: 'and',
  nodes: [
    rangeQuery('rcsb_entry_info.polymer_entity_count_protein', 'greater', 0),
    rangeQuery('rcsb_entry_info.deposited_polymer_monomer_count', 'range', {
      from: MIN_RESIDUES, to: MAX_RESIDUES, include_lower: true, include_upper: true,
    }),
    rangeQuery('rcsb_entry_info.deposited_atom_count', 'less', MAX_ATOMS),
  ],
};

async function search(requestOptions) {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: POOL_QUERY,
      return_type: 'entry',
      request_options: { results_content_type: ['experimental'], ...requestOptions },
    }),
  });
  if (!res.ok) throw new Error(`RCSB search failed (${res.status})`);
  return res.json();
}

let poolSize = null;

/** How many PDB entries the feed draws from. Asked once, then remembered. */
export async function poolCount() {
  if (poolSize) return poolSize;
  const cached = Number(sessionStorage.getItem('instaprot:poolCount'));
  if (cached > 0) return (poolSize = cached);
  const { total_count } = await search({ return_counts: true });
  poolSize = total_count;
  try { sessionStorage.setItem('instaprot:poolCount', String(total_count)); } catch { /* private mode */ }
  return poolSize;
}

const served = new Set();

/**
 * Random entry IDs. The search API has no "shuffle", so instead we ask for a
 * single row at a uniformly random offset into the result set — which is a
 * genuine uniform draw over the whole filtered PDB, one request per structure.
 */
export async function randomEntryIds(n) {
  const total = await poolCount();
  const picks = await Promise.all(
    Array.from({ length: n }, async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const start = Math.floor(Math.random() * total);
        const { result_set } = await search({ paginate: { start, rows: 1 } });
        const id = result_set?.[0]?.identifier;
        if (id && !served.has(id)) { served.add(id); return id; }
      }
      return null;
    }),
  );
  return picks.filter(Boolean);
}

/** Mark IDs as already shown so the shuffler does not serve them again. */
export function markServed(...ids) { ids.forEach(id => served.add(id)); }

const METADATA_QUERY = `query Entries($ids: [String!]!) {
  entries(entry_ids: $ids) {
    rcsb_id
    struct { title pdbx_descriptor }
    struct_keywords { pdbx_keywords text }
    exptl { method }
    rcsb_accession_info { initial_release_date deposit_date }
    rcsb_entry_info {
      resolution_combined experimental_method molecular_weight
      deposited_atom_count deposited_model_count deposited_polymer_monomer_count
      polymer_entity_count_protein polymer_composition
      polymer_entity_count_DNA polymer_entity_count_RNA
      disulfide_bond_count inter_mol_covalent_bond_count
      diffrn_radiation_wavelength_maximum
    }
    exptl_crystal_grow { temp pH method }
    audit_author { name }
    rcsb_primary_citation {
      title journal_abbrev rcsb_journal_abbrev year rcsb_authors
      pdbx_database_id_DOI pdbx_database_id_PubMed
    }
    pubmed { rcsb_pubmed_abstract_text }
    assemblies {
      rcsb_assembly_info { polymer_entity_instance_count }
      rcsb_struct_symmetry { symbol kind oligomeric_state stoichiometry type }
    }
    polymer_entities {
      entity_poly { pdbx_seq_one_letter_code_can rcsb_sample_sequence_length type }
      rcsb_polymer_entity {
        pdbx_description
        rcsb_ec_lineage { id name }
      }
      rcsb_entity_source_organism {
        ncbi_scientific_name ncbi_taxonomy_id common_name
        rcsb_gene_name { value }
      }
      rcsb_entity_host_organism { ncbi_scientific_name }
      uniprots { rcsb_uniprot_protein { name { value } } rcsb_id }
      rcsb_polymer_entity_annotation { type name }
      rcsb_polymer_entity_container_identifiers { auth_asym_ids }
    }
    nonpolymer_entities {
      nonpolymer_comp { chem_comp { id name formula_weight formula } }
      rcsb_nonpolymer_entity_container_identifiers { auth_asym_ids }
    }
  }
}`;

/** Full metadata for a batch of entries — one request, everything a fact needs. */
export async function fetchMetadata(ids) {
  if (!ids.length) return [];
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: METADATA_QUERY, variables: { ids } }),
  });
  if (!res.ok) throw new Error(`RCSB metadata failed (${res.status})`);
  const { data, errors } = await res.json();
  if (errors?.length && !data?.entries) throw new Error(errors[0].message);
  return (data?.entries || []).filter(Boolean);
}

/** How many entries the PDB held at the end of a given year — used by a fact. */
export async function releasedBefore(year) {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: {
        type: 'terminal', service: 'text',
        parameters: {
          attribute: 'rcsb_accession_info.initial_release_date',
          operator: 'less_or_equal', value: `${year}-12-31T00:00:00Z`,
        },
      },
      return_type: 'entry',
      request_options: { results_content_type: ['experimental'], return_counts: true },
    }),
  });
  if (!res.ok) throw new Error('count failed');
  const { total_count } = await res.json();
  return total_count;
}

const structures = new Map();

/** Coordinates as text. mmCIF first; a few very old entries only have PDB. */
export async function fetchStructure(id) {
  if (structures.has(id)) return structures.get(id);
  const promise = (async () => {
    for (const url of [FILE_URL(id), FILE_URL_FALLBACK(id)]) {
      const res = await fetch(url);
      if (res.ok) return res.text();
    }
    throw new Error(`no coordinates for ${id}`);
  })();
  structures.set(id, promise);
  promise.catch(() => structures.delete(id));
  if (structures.size > STRUCTURE_CACHE) {
    structures.delete(structures.keys().next().value);
  }
  return promise;
}
