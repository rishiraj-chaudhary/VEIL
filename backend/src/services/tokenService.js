import crypto from 'crypto';
import RefreshToken from '../models/RefreshToken.js';
import logger from '../utils/logger.js';
import { generateToken } from '../utils/jwt.js';

/**
 * TOKEN SERVICE
 *
 * Splits authentication into a short-lived access token and a long-lived,
 * rotating refresh token.
 *
 * Previously a single token lived for days in localStorage with no way to
 * revoke it, so any XSS produced a credential valid until natural expiry. A
 * short access token limits that window, and refresh tokens are revocable
 * server-side because they exist as rows rather than as self-contained claims.
 */

const ACCESS_TOKEN_TTL  = process.env.JWT_EXPIRE || '15m';
const REFRESH_TTL_DAYS  = parseInt(process.env.REFRESH_TOKEN_DAYS, 10) || 30;

const newOpaqueToken = () => crypto.randomBytes(48).toString('base64url');

class TokenService {
  get refreshTtlMs() {
    return REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
  }

  /** Issues a fresh pair, starting a new token family. */
  async issuePair(userId, context = {}) {
    const family = crypto.randomUUID();
    const refreshToken = await this._persist(userId, family, context);

    return {
      accessToken: generateToken(userId),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
    };
  }

  async _persist(userId, family, { userAgent = null, ip = null, replacing = null } = {}) {
    const token = newOpaqueToken();

    await RefreshToken.create({
      user: userId,
      tokenHash: RefreshToken.hash(token),
      family,
      expiresAt: new Date(Date.now() + this.refreshTtlMs),
      userAgent,
      ip,
    });

    if (replacing) {
      await RefreshToken.updateOne(
        { tokenHash: replacing },
        { $set: { replacedBy: RefreshToken.hash(token) } },
      );
    }

    return token;
  }

  /**
   * Exchanges a refresh token for a new pair.
   *
   * A token that has already been rotated is presented only by a client holding
   * a stale copy — which in practice means it was captured. The entire family is
   * revoked rather than issuing to whoever asked.
   */
  async rotate(presentedToken, context = {}) {
    const tokenHash = RefreshToken.hash(presentedToken);
    const stored = await RefreshToken.findOne({ tokenHash });

    if (!stored) return { ok: false, reason: 'invalid' };

    if (stored.revokedAt || stored.replacedBy) {
      await this.revokeFamily(stored.family);
      logger.warn('refresh token reuse detected — family revoked', {
        userId: stored.user.toString(),
        family: stored.family,
      });
      return { ok: false, reason: 'reused' };
    }

    if (stored.expiresAt < new Date()) return { ok: false, reason: 'expired' };

    const refreshToken = await this._persist(stored.user, stored.family, {
      ...context,
      replacing: tokenHash,
    });

    await RefreshToken.updateOne({ _id: stored._id }, { $set: { revokedAt: new Date() } });

    return {
      ok: true,
      userId: stored.user,
      accessToken: generateToken(stored.user),
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
    };
  }

  async revoke(presentedToken) {
    await RefreshToken.updateOne(
      { tokenHash: RefreshToken.hash(presentedToken) },
      { $set: { revokedAt: new Date() } },
    );
  }

  async revokeFamily(family) {
    await RefreshToken.updateMany(
      { family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }

  /** Used on password change and account compromise. */
  async revokeAllForUser(userId) {
    await RefreshToken.updateMany(
      { user: userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
}

export default new TokenService();
