import express from 'express';
import {
    createPost,
    deletePost,
    getPost,
    getPosts,
    votePost,
} from '../controllers/postController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { postValidators } from '../validators/index.js';

const router = express.Router();

// Public routes
router.get('/', validate(postValidators.list), getPosts);
router.get('/:id', validate(postValidators.byId), getPost);

// Protected routes
router.post('/', authenticate, validate(postValidators.create), createPost);
router.post('/:id/vote', authenticate, validate(postValidators.vote), votePost);
router.delete('/:id', authenticate, validate(postValidators.byId), deletePost);

export default router;