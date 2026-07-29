import { asyncHandler } from '../middleware/errorHandler.js';
import User from '../models/user.js';
import tokenService from '../services/tokenService.js';
import { badRequest, conflict, unauthorized } from '../utils/AppError.js';

// Field presence and format are enforced by authValidators before these run.

const requestContext = req => ({
  userAgent: req.headers['user-agent']?.slice(0, 300) || null,
  ip: req.ip || null,
});

/**
 * The refresh token goes in an httpOnly cookie so script running on the page
 * cannot read it. The access token is returned in the body for the client to
 * hold in memory — that one is short-lived by design.
 */
const setRefreshCookie = (res, refreshToken) => {
  res.cookie('veil_refresh', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: tokenService.refreshTtlMs,
    path: '/api/auth',
  });
};

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
export const register = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  const existingUser = await User.findOne({ $or: [{ email }, { username }] });

  if (existingUser) {
    throw conflict(
      existingUser.email === email ? 'Email already registered' : 'Username already taken',
    );
  }

  const user = await User.create({ username, email, password });
  const { accessToken, refreshToken, expiresIn } = await tokenService.issuePair(user._id, requestContext(req));

  setRefreshCookie(res, refreshToken);

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    // `token` is retained alongside `accessToken` so existing clients keep working.
    data: { user: user.getPublicProfile(), token: accessToken, accessToken, expiresIn },
  });
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');

  // Deliberately identical for an unknown email and a wrong password —
  // distinguishing them tells an attacker which accounts exist.
  const isPasswordValid = user ? await user.comparePassword(password) : false;
  if (!user || !isPasswordValid) throw unauthorized('Invalid credentials');

  user.lastLogin = new Date();
  await user.save();

  const { accessToken, refreshToken, expiresIn } = await tokenService.issuePair(user._id, requestContext(req));
  setRefreshCookie(res, refreshToken);

  res.status(200).json({
    success: true,
    message: 'Login successful',
    data: { user: user.getPublicProfile(), token: accessToken, accessToken, expiresIn },
  });
});

// @route   POST /api/auth/refresh
// @desc    Exchange a refresh token for a new pair
// @access  Public (authenticated by the refresh token itself)
export const refresh = asyncHandler(async (req, res) => {
  const presented = req.cookies?.veil_refresh || req.body?.refreshToken;
  if (!presented) throw unauthorized('No refresh token provided');

  const result = await tokenService.rotate(presented, requestContext(req));

  if (!result.ok) {
    res.clearCookie('veil_refresh', { path: '/api/auth' });

    // Reuse means the token was captured; the client is told to log in again
    // rather than being given a hint about what was detected.
    throw unauthorized(
      result.reason === 'expired' ? 'Session expired. Please log in again.' : 'Invalid session. Please log in again.',
    );
  }

  const user = await User.findById(result.userId);
  if (!user || !user.isActive) throw unauthorized('Account is no longer active');

  setRefreshCookie(res, result.refreshToken);

  res.status(200).json({
    success: true,
    data: {
      user: user.getPublicProfile(),
      token: result.accessToken,
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
    },
  });
});

// @route   POST /api/auth/logout
// @desc    Revoke the current refresh token
// @access  Public
export const logout = asyncHandler(async (req, res) => {
  const presented = req.cookies?.veil_refresh || req.body?.refreshToken;
  if (presented) await tokenService.revoke(presented);

  res.clearCookie('veil_refresh', { path: '/api/auth' });
  res.status(200).json({ success: true, message: 'Logged out' });
});

// @route   POST /api/auth/logout-all
// @desc    Revoke every session for the current user
// @access  Private
export const logoutAll = asyncHandler(async (req, res) => {
  if (!req.user?._id) throw badRequest('Not authenticated');

  await tokenService.revokeAllForUser(req.user._id);
  res.clearCookie('veil_refresh', { path: '/api/auth' });

  res.status(200).json({ success: true, message: 'All sessions revoked' });
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
export const getCurrentUser = asyncHandler(async (req, res) => {
  res.status(200).json({
    success: true,
    data: { user: req.user.getPublicProfile() },
  });
});
