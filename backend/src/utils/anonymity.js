/**
 * ANONYMITY PRIMITIVES for anonymous feedback ("slicks").
 *
 * The previous implementation named itself `encryptAuthorId` and was base64:
 *
 *     Buffer.from(JSON.stringify({ id, timestamp })).toString('base64')
 *
 * That is an encoding, not a cipher — reversible by anyone, no key involved. The
 * value was also returned to clients, so any recipient of anonymous criticism
 * could run `atob()` in devtools and identify the sender. It additionally
 * bypassed `canRevealIdentity`, which charges the recipient to learn exactly
 * that. `SLICK_ENCRYPTION_KEY` existed in the environment but was referenced
 * nowhere in the codebase.
 *
 * Two values are derived per author, because the feature needs two different
 * and normally incompatible properties:
 *
 *   cipher — AES-256-GCM. Reversible, but only server-side with the key, and
 *            only for the paid identity reveal. Authenticated, so a tampered
 *            ciphertext fails loudly instead of decrypting to garbage.
 *
 *   tag    — HMAC-SHA256. Deterministic for a given author, so "slicks I sent"
 *            is an indexed equality lookup rather than a full-collection scan
 *            that decodes every row. One-way, so exposure reveals nothing.
 *
 * The tag is deliberately deterministic and therefore correlatable: two slicks
 * from the same author share a tag. That is required for the query and does not
 * identify the author, but it does mean the tag must never be sent to clients —
 * a recipient could otherwise tell that two anonymous notes came from one person.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit nonce, the recommended size for GCM
const KEY_BYTES = 32;  // AES-256

let cachedKey = null;

/**
 * The key is derived once and cached. Accepts either a base64 32-byte key (what
 * Render's generateValue produces) or an arbitrary passphrase, which is hashed
 * to the right length rather than rejected.
 */
const getKey = () => {
  if (cachedKey) return cachedKey;

  const raw = process.env.SLICK_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      'SLICK_ENCRYPTION_KEY is not set. Anonymous feedback cannot be stored '
      + 'without it — refusing to fall back to reversible encoding.',
    );
  }

  const decoded = Buffer.from(raw, 'base64');
  cachedKey = decoded.length === KEY_BYTES
    ? decoded
    : crypto.createHash('sha256').update(raw).digest();

  return cachedKey;
};

/** Test seam: clears the cached key so a changed env var takes effect. */
export const resetKeyCache = () => { cachedKey = null; };

/**
 * Encrypt an author id. Output is `iv.authTag.ciphertext`, all base64.
 *
 * A fresh random IV per call means the same author encrypts differently every
 * time, so ciphertexts cannot be correlated. That is why the separate HMAC tag
 * exists for querying.
 */
export const encryptAuthorId = (authorId) => {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(authorId.toString(), 'utf8'),
    cipher.final(),
  ]);

  return [
    iv.toString('base64'),
    cipher.getAuthTag().toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
};

/**
 * Decrypt an author id, or return null.
 *
 * Returns null rather than throwing so a single corrupt or legacy row cannot
 * break a listing endpoint. Tampering fails here because GCM verifies the auth
 * tag — it does not silently produce a different id.
 */
export const decryptAuthorId = (payload) => {
  if (typeof payload !== 'string') return null;

  const parts = payload.split('.');
  if (parts.length !== 3) return null; // legacy base64 row, or malformed

  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      getKey(),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

/**
 * Deterministic, one-way tag used to query an author's own slicks.
 *
 * Keyed HMAC rather than a bare hash: user ids are 24-character hex, a space
 * small enough to enumerate exhaustively, so an unkeyed digest would be
 * trivially reversible by brute force.
 */
export const authorTag = (authorId) =>
  crypto.createHmac('sha256', getKey())
    .update(authorId.toString())
    .digest('hex');

/** True for values written by the old base64 scheme. */
export const isLegacyEncoding = (payload) =>
  typeof payload === 'string' && payload.split('.').length !== 3;

export default { encryptAuthorId, decryptAuthorId, authorTag, isLegacyEncoding, resetKeyCache };
