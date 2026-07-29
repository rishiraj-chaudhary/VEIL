import express from 'express';
import {
    createComment,
    deleteComment,
    getPostComments,
    voteComment,
} from '../controllers/commentController.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { commentValidators } from '../validators/index.js';

const router = express.Router();

// Public routes
router.get('/post/:postId', validate(commentValidators.byPost), getPostComments);

// Protected routes
router.post('/', authenticate, validate(commentValidators.create), createComment);
router.post('/:id/vote', authenticate, validate(commentValidators.vote), voteComment);
router.delete('/:id', authenticate, validate(commentValidators.byId), deleteComment);

export default router;