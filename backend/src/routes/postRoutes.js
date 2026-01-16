import express from 'express';
import {
    createPost,
    deletePost,
    getPost,
    getPosts,
    votePost,
} from '../controllers/postController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/', getPosts);
router.get('/:id', getPost);

// Protected routes
router.post('/', authenticate, createPost);
router.post('/:id/vote', authenticate, votePost);
router.delete('/:id', authenticate, deletePost);

export default router;