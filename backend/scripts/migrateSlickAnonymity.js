/**
 * MIGRATE SLICK ANONYMITY — one-off, idempotent
 *
 * Existing rows store `encryptedAuthorId` as base64 of `{"id":"...","timestamp":...}`
 * — an encoding, not a cipher. Anyone holding the value could recover the author,
 * and the value was being returned to clients.
 *
 * This re-encrypts each row with AES-256-GCM and adds the deterministic HMAC
 * `authorTag` the new queries index on.
 *
 * Ordering matters: run this BEFORE deploying the new code, or immediately after.
 * Rows without `authorTag` are invisible to the new "slicks I sent" query, so a
 * gap between deploy and migration looks like a user's sent history vanishing.
 *
 * Requires SLICK_ENCRYPTION_KEY to be the same value the application will use.
 * Re-running is safe: already-migrated rows are detected and skipped.
 *
 * Run: node scripts/migrateSlickAnonymity.js
 */

import dotenv from 'dotenv';
import mongoose from 'mongoose';

import { authorTag, encryptAuthorId, isLegacyEncoding } from '../src/utils/anonymity.js';

dotenv.config();

if (!process.env.SLICK_ENCRYPTION_KEY) {
  console.error('❌ SLICK_ENCRYPTION_KEY is not set. Aborting — migrating with a');
  console.error('   different key than the app uses would make every author');
  console.error('   undecryptable and break the paid identity reveal.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
console.log(`🔌 Connected to "${mongoose.connection.db.databaseName}"\n`);

// The raw collection, deliberately: the model marks these fields select:false,
// and going through it would hide exactly what needs rewriting.
const col = mongoose.connection.db.collection('slicks');

const total = await col.countDocuments();
console.log(`📊 ${total} slick(s) total`);

const rows = await col.find(
  {},
  { projection: { _id: 1, encryptedAuthorId: 1, authorTag: 1 } },
).toArray();

let migrated = 0;
let alreadyDone = 0;
let unrecoverable = 0;

for (const row of rows) {
  const value = row.encryptedAuthorId;

  // Already migrated: GCM payload present and tagged.
  if (!isLegacyEncoding(value) && row.authorTag) {
    alreadyDone += 1;
    continue;
  }

  // Recover the author id from the legacy encoding.
  let authorId = null;
  try {
    const decoded = Buffer.from(value, 'base64').toString();
    authorId = JSON.parse(decoded).id;
  } catch {
    // The old code had a fallback that stored the bare id, base64'd.
    try {
      const bare = Buffer.from(value, 'base64').toString();
      if (/^[a-f0-9]{24}$/i.test(bare)) authorId = bare;
    } catch { /* unreadable */ }
  }

  if (!authorId) {
    // Left untouched rather than deleted: the slick's content and reactions are
    // still legitimate, it simply can never have its author revealed.
    unrecoverable += 1;
    console.warn(`   ⚠ ${row._id} — author unreadable, leaving as-is`);
    continue;
  }

  await col.updateOne(
    { _id: row._id },
    { $set: { encryptedAuthorId: encryptAuthorId(authorId), authorTag: authorTag(authorId) } },
  );
  migrated += 1;
}

console.log(`\n✅ Re-encrypted ${migrated}, already current ${alreadyDone}, unreadable ${unrecoverable}`);

// Verify no readable authorship remains.
const remaining = await col.countDocuments({
  $or: [{ authorTag: { $exists: false } }, { encryptedAuthorId: { $not: /\./ } }],
});
console.log(`   Rows still lacking a tag or cipher: ${remaining}`);

if (remaining === unrecoverable) {
  console.log('   Every recoverable row is now encrypted and queryable.');
} else {
  console.warn('   ⚠ Unexpected remainder — inspect before trusting the sent-slicks query.');
}

await mongoose.disconnect();
