import express from 'express';
import { getCurrentUser, login, logout, logoutAll, refresh, register } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { authValidators } from '../validators/index.js';

const router = express.Router();

// Public routes
router.post('/register', validate(authValidators.register), register);
router.post('/login', validate(authValidators.login), login);

// Session lifecycle — the refresh token authenticates these itself.
router.post('/refresh', refresh);
router.post('/logout', logout);

// Protected routes
router.get('/me', authenticate, getCurrentUser);
router.post('/logout-all', authenticate, logoutAll);

export default router;