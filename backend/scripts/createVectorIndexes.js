/**
 * ATLAS VECTOR INDEX SETUP — run once per environment
 *
 * RAG retrieval runs through Atlas `$vectorSearch`, which needs a vector search
 * index on each collection. Without one the aggregation returns zero results
 * rather than erroring, so retrieval degrades silently and the app still reports
 * "RAG enabled". This script creates the indexes and reports their build status.
 *
 * Run: node scripts/createVectorIndexes.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const EMBEDDING_DIMENSIONS = 384; // all-MiniLM-L6-v2

/**
 * Filter paths must be declared here to be usable as a `$vectorSearch` pre-filter.
 * Querying an undeclared path does not degrade — Atlas raises "Path 'x' needs to
 * be indexed as filter", which the retrieval layer catches and reports as zero
 * results, indistinguishable from a genuine miss.
 *
 * Memory paths are dotted because DebateMemory nests them under `metadata`.
 */
const INDEXES = [
  {
    collection: 'knowledgeitems',
    name: 'knowledge_vector_index',
    filters: [
      { type: 'filter', path: 'category' },
      { type: 'filter', path: 'type' },
    ],
  },
  {
    collection: 'debatememories',
    name: 'memory_vector_index',
    filters: [
      { type: 'filter', path: 'metadata.side' },
      { type: 'filter', path: 'metadata.quality' },
      { type: 'filter', path: 'metadata.topic' },
    ],
  },
];

const definitionFor = (filters = []) => ({
  fields: [
    {
      type: 'vector',
      path: 'embedding',
      numDimensions: EMBEDDING_DIMENSIONS,
      similarity: 'cosine',
    },
    ...filters,
  ],
});

/** Compare by (type, path) so a re-run is a no-op rather than a rebuild. */
const sameFields = (a = [], b = []) => {
  const key = f => `${f.type}:${f.path}`;
  const A = a.map(key).sort();
  const B = b.map(key).sort();
  return A.length === B.length && A.every((v, i) => v === B[i]);
};

await mongoose.connect(process.env.MONGODB_URI);
console.log(`🔌 Connected to "${mongoose.connection.db.databaseName}"\n`);

for (const { collection, name, filters } of INDEXES) {
  const col = mongoose.connection.db.collection(collection);
  const definition = definitionFor(filters);

  try {
    const existing = await col.listSearchIndexes().toArray();
    const current = existing.find(idx => idx.name === name);

    if (current) {
      const live = current.latestDefinition?.fields ?? [];

      if (sameFields(live, definition.fields)) {
        console.log(`✓ ${collection}/${name} up to date (status: ${current.status ?? 'unknown'})`);
        continue;
      }

      // An index created before filter paths were declared searches fine but
      // rejects every filtered query, so it has to be amended in place.
      await col.updateSearchIndex(name, definition);

      const added = definition.fields.length - live.length;
      console.log(`🔄 ${collection}/${name} updated (+${added} filter path(s)) — Atlas rebuilds asynchronously`);
      continue;
    }

    await col.createSearchIndex({
      name,
      type: 'vectorSearch',
      definition,
    });

    console.log(`✅ ${collection}/${name} created — Atlas builds it asynchronously`);
  } catch (error) {
    console.error(`❌ ${collection}/${name} failed: ${error.message}`);
    console.error('   Atlas Search may be unavailable on this tier, or the API user lacks permission.');
    console.error('   Fallback: Atlas UI → Collection → Search Indexes → Create Vector Search Index');
  }
}

console.log('\nIndexes report READY once Atlas finishes building them (usually under a minute).');
console.log('Re-run this script to check status.');

await mongoose.disconnect();
