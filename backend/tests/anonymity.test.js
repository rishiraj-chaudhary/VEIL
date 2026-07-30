/**
 * Anonymous feedback author protection.
 *
 * The previous implementation was named `encryptAuthorId` and was base64 of
 * `{"id":"...","timestamp":...}` — reversible by anyone, with no key involved —
 * and the value was returned to clients. Any recipient of anonymous criticism
 * could run `atob()` in devtools and identify the sender, which also bypassed
 * the paid identity reveal.
 *
 * These assert the properties that made that possible are gone.
 */

process.env.SLICK_ENCRYPTION_KEY ||= 'dGVzdC1rZXktZm9yLXVuaXQtdGVzdHMtMzJieXRlcyE=';

const {
  encryptAuthorId,
  decryptAuthorId,
  authorTag,
  isLegacyEncoding,
} = await import('../src/utils/anonymity.js');

const Slick = (await import('../src/models/slick.js')).default;

const AUTHOR = '6967322f93434df248c2150b';
const OTHER  = '696bb76b601cbebe874ff8b4';

describe('author id encryption', () => {
  test('round-trips through the key', () => {
    expect(decryptAuthorId(encryptAuthorId(AUTHOR))).toBe(AUTHOR);
  });

  test('the ciphertext is not base64-decodable to the author', () => {
    // The exact attack the old scheme allowed.
    const payload = encryptAuthorId(AUTHOR);
    const naive = Buffer.from(payload, 'base64').toString('utf8');

    expect(naive).not.toContain(AUTHOR);
    expect(naive).not.toMatch(/[a-f0-9]{24}/);
  });

  test('the same author encrypts differently every time', () => {
    // A fresh IV per call, so a recipient holding two ciphertexts cannot tell
    // they came from one person.
    expect(encryptAuthorId(AUTHOR)).not.toBe(encryptAuthorId(AUTHOR));
  });

  test('different authors never collide', () => {
    expect(decryptAuthorId(encryptAuthorId(OTHER))).not.toBe(AUTHOR);
  });

  test('a tampered payload returns null rather than a wrong author', () => {
    // GCM authenticates, so corruption is detected instead of decrypting to
    // arbitrary bytes that might parse as a different user's id.
    const [iv, tag] = encryptAuthorId(AUTHOR).split('.');
    const forged = [iv, tag, Buffer.from(OTHER).toString('base64')].join('.');

    expect(decryptAuthorId(forged)).toBeNull();
  });

  test('malformed input is rejected without throwing', () => {
    // A single bad row must not break a listing endpoint.
    expect(decryptAuthorId('not-a-payload')).toBeNull();
    expect(decryptAuthorId('')).toBeNull();
    expect(decryptAuthorId(null)).toBeNull();
    expect(decryptAuthorId(undefined)).toBeNull();
    expect(decryptAuthorId({})).toBeNull();
  });

  test('legacy base64 rows are recognised, not silently accepted', () => {
    const legacy = Buffer.from(JSON.stringify({ id: AUTHOR, timestamp: 1 })).toString('base64');

    expect(isLegacyEncoding(legacy)).toBe(true);
    expect(isLegacyEncoding(encryptAuthorId(AUTHOR))).toBe(false);
    // And it must not decrypt — otherwise the migration could be skipped.
    expect(decryptAuthorId(legacy)).toBeNull();
  });
});

describe('author tag', () => {
  test('is deterministic, so it can be queried', () => {
    expect(authorTag(AUTHOR)).toBe(authorTag(AUTHOR));
  });

  test('distinguishes authors', () => {
    expect(authorTag(AUTHOR)).not.toBe(authorTag(OTHER));
  });

  test('does not contain the author id', () => {
    // Keyed HMAC, not a bare hash: 24-char hex ids are a small enough space to
    // brute-force an unkeyed digest.
    expect(authorTag(AUTHOR)).not.toContain(AUTHOR);
    expect(authorTag(AUTHOR)).toMatch(/^[a-f0-9]{64}$/);
  });

  test('accepts ObjectId-like values, not just strings', () => {
    const objectIdLike = { toString: () => AUTHOR };
    expect(authorTag(objectIdLike)).toBe(authorTag(AUTHOR));
  });
});

describe('schema exposure', () => {
  // The leak was not only weak crypto: getReceivedSlicks spread the whole
  // document into its response, so the author value shipped to the browser.
  // select:false is what makes a default read safe by construction.
  test('the author cipher is excluded from reads by default', () => {
    expect(Slick.schema.path('encryptedAuthorId').options.select).toBe(false);
  });

  test('the author tag is excluded too', () => {
    // Deterministic per author, so a recipient holding two tags could tell two
    // anonymous notes came from the same person even without identifying them.
    expect(Slick.schema.path('authorTag').options.select).toBe(false);
  });

  test('the author tag is indexed, so sent-slicks is not a full scan', () => {
    expect(Slick.schema.path('authorTag').options.index).toBe(true);
  });

  test('the reactor list is excluded from reads', () => {
    // A second leak, found while verifying the first. The full reactor list was
    // being returned, which exposed who reacted to anonymous feedback about
    // someone — and when the author reacted to their own slick, put the author's
    // id in the payload. Nothing in the frontend reads it; it exists server-side
    // to prevent double-reacting.
    expect(Slick.schema.path('reactors').options.select).toBe(false);
  });

  test('the aggregate reaction counts stay public', () => {
    // Hiding the reactor identities must not hide the numbers the UI displays.
    expect(Slick.schema.path('reactions.agree').options.select).not.toBe(false);
  });

  test('the model no longer exposes a reversible encoder', () => {
    // Same method names, real implementations behind them.
    const encoded = Slick.encryptAuthorId(AUTHOR);
    expect(Buffer.from(encoded, 'base64').toString('utf8')).not.toContain(AUTHOR);
    expect(Slick.decryptAuthorId(encoded)).toBe(AUTHOR);
  });
});

describe('key handling', () => {
  test('refuses to operate without a key rather than degrading', async () => {
    // The old code's fallback path also just base64-encoded, so there was no
    // configuration in which authorship was actually protected. Failing loudly
    // is the point.
    const saved = process.env.SLICK_ENCRYPTION_KEY;
    const mod = await import('../src/utils/anonymity.js');

    delete process.env.SLICK_ENCRYPTION_KEY;
    mod.resetKeyCache();

    expect(() => mod.encryptAuthorId(AUTHOR)).toThrow(/SLICK_ENCRYPTION_KEY/);

    process.env.SLICK_ENCRYPTION_KEY = saved;
    mod.resetKeyCache();
  });
});
