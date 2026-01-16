import express from 'express';
import {
    createComment,
    deleteComment,
    getPostComments,
    voteComment,
} from '../controllers/commentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/post/:postId', getPostComments);

// Protected routes
router.post('/', authenticate, createComment);
router.post('/:id/vote', authenticate, voteComment);
router.delete('/:id', authenticate, deleteComment);

export default router;