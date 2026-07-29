/**
 * NORMALISE DEBATE MEMORY SHAPE — one-off, idempotent
 *
 * `debatememories` accumulated two record shapes. The DebateMemory model writes
 * `turnId`/`debateId` with descriptive fields nested under `metadata`. An earlier
 * version of vectorStoreService.addToMemory passed those fields flat to LangChain,
 * which spreads Document metadata across the root — producing `side`, `quality`
 * and friends at the top level instead.
 *
 * Only the nested paths are declared as Atlas filter fields, so flat records are
 * invisible to any filtered query. This rewrites them into the canonical shape.
 *
 * Run: node scripts/normalizeMemoryShape.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
console.log(`🔌 Connected to "${mongoose.connection.db.databaseName}"\n`);

const col = mongoose.connection.db.collection('debatememories');

// A record is flat if any descriptive field sits at the root.
const flat = await col.find({
  $or: [
    { side:    { $exists: true } },
    { round:   { $exists: true } },
    { quality: { $exists: true } },
    { topic:   { $exists: true } },
    { turn:    { $exists: true } },
    { debate:  { $exists: true } },
  ],
}).toArray();

console.log(`📊 ${await col.countDocuments()} records total, ${flat.length} in the flat shape\n`);

let migrated = 0;

for (const doc of flat) {
  const nested = doc.metadata ?? {};

  // Root values win only where the nested object has nothing — a record that
  // somehow carries both keeps the canonical side.
  const merged = {
    topic:   nested.topic   ?? doc.topic,
    side:    nested.side    ?? doc.side,
    round:   nested.round   ?? doc.round,
    quality: nested.quality ?? doc.quality,
    author:  nested.author  ?? doc.author,
  };

  // Undefined values would be stored as nulls, which read back as present.
  Object.keys(merged).forEach(k => merged[k] === undefined && delete merged[k]);

  await col.updateOne(
    { _id: doc._id },
    {
      $set: {
        metadata:  merged,
        turnId:    doc.turnId   ?? doc.turn,
        debateId:  doc.debateId ?? doc.debate,
      },
      $unset: {
        side: '', round: '', quality: '', topic: '', author: '', turn: '', debate: '',
      },
    },
  );

  migrated += 1;
  console.log(`   ✓ ${doc._id} → side=${merged.side ?? '—'} quality=${merged.quality ?? '—'}`);
}

const remaining = await col.countDocuments({
  $or: [{ side: { $exists: true } }, { quality: { $exists: true } }],
});

console.log(`\n✅ Normalised ${migrated} record(s); ${remaining} still flat`);
console.log(`   Nested metadata: ${await col.countDocuments({ metadata: { $type: 'object' } })}/${await col.countDocuments()}`);

await mongoose.disconnect();
