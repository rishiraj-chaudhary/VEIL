import crypto from 'crypto';
import mongoose from 'mongoose';

/**
 * A refresh token, stored as a hash.
 *
 * Only the hash is persisted: a database leak should not hand an attacker
 * working credentials, which is exactly what storing the raw token would do.
 *
 * Tokens rotate on every use. Reuse of an already-rotated token is the signature
 * of a stolen one, and revokes the whole family rather than trusting whichever
 * client presented it.
 */
const refreshTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },

  tokenHash: { type: String, required: true, unique: true },

  // Every token descended from one login shares a family id, so detecting theft
  // can revoke the lineage without logging out the user's other devices.
  family: { type: String, required: true, index: true },

  expiresAt: { type: Date, required: true },

  revokedAt:   { type: Date, default: null },
  replacedBy:  { type: String, default: null },

  userAgent: { type: String, default: null },
  ip:        { type: String, default: null },
}, { timestamps: true });

// Mongo removes the document once it expires; no cleanup job required.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.statics.hash = function (token) {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema);

export default RefreshToken;
