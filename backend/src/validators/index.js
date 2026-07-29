import { body, param, query } from 'express-validator';

/**
 * Request validation chains, grouped by resource.
 *
 * These enforce shape and bounds only. Anything requiring a database lookup
 * (does this community exist, is this user a member) stays in the controller
 * or service, where the result is needed anyway.
 */

const objectId = field => field.isMongoId().withMessage('must be a valid id');

export const authValidators = {
  register: [
    body('username')
      .trim()
      .isLength({ min: 3, max: 20 }).withMessage('must be 3-20 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('may contain only letters, numbers and underscores'),
    body('email')
      .trim()
      .isEmail().withMessage('must be a valid email address')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8, max: 128 }).withMessage('must be at least 8 characters'),
  ],

  login: [
    body('email').trim().isEmail().withMessage('must be a valid email address').normalizeEmail(),
    body('password').notEmpty().withMessage('is required'),
  ],
};

export const postValidators = {
  create: [
    body('title')
      .trim()
      .isLength({ min: 3, max: 300 }).withMessage('must be 3-300 characters'),
    body('content')
      .optional({ values: 'falsy' })
      .isLength({ max: 40000 }).withMessage('is too long'),
    body('communityName')
      .trim()
      .notEmpty().withMessage('is required'),
    objectId(body('personaId').optional({ values: 'null' })),
  ],

  list: [
    query('sort').optional().isIn(['hot', 'new', 'top']).withMessage("must be 'hot', 'new' or 'top'"),
    query('page').optional().isInt({ min: 1 }).withMessage('must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('must be between 1 and 100'),
  ],

  byId: [objectId(param('id'))],

  vote: [
    objectId(param('id')),
    body('vote').isIn([1, -1, 0]).withMessage('must be 1, -1 or 0'),
  ],
};

export const commentValidators = {
  create: [
    body('content').trim().isLength({ min: 1, max: 10000 }).withMessage('must be 1-10000 characters'),
    objectId(body('postId')),
    objectId(body('parentId').optional({ values: 'null' })),
    objectId(body('personaId').optional({ values: 'null' })),
  ],

  byPost: [objectId(param('postId'))],

  vote: [
    objectId(param('id')),
    body('vote').isIn([1, -1, 0]).withMessage('must be 1, -1 or 0'),
  ],

  byId: [objectId(param('id'))],
};

export const communityValidators = {
  create: [
    body('name')
      .trim()
      .isLength({ min: 3, max: 30 }).withMessage('must be 3-30 characters')
      .matches(/^[a-zA-Z0-9_]+$/).withMessage('may contain only letters, numbers and underscores'),
    body('displayName').optional({ values: 'falsy' }).trim().isLength({ max: 60 }).withMessage('is too long'),
    body('description').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('is too long'),
  ],

  byName: [
    param('name').trim().notEmpty().withMessage('is required'),
  ],
};

export const sparringValidators = {
  run: [
    body('topic').trim().isLength({ min: 3, max: 300 }).withMessage('must be 3-300 characters'),
    body('side').isIn(['for', 'against']).withMessage("must be 'for' or 'against'"),
    // The agent truncates the draft to 2000 characters when extracting claims;
    // rejecting beyond that is clearer than silently analysing only the opening.
    body('draft').trim().isLength({ min: 40, max: 2000 }).withMessage('must be 40-2000 characters'),
  ],
};

export const reputationValidators = {
  byUser: [objectId(param('userId'))],
};

export const drillValidators = {
  submit: [
    body('response').trim().isLength({ min: 1, max: 10000 }).withMessage('must be 1-10000 characters'),
  ],
  history: [
    query('limit').optional().isInt({ min: 1, max: 90 }).withMessage('must be between 1 and 90'),
  ],
};

export const aiValidators = {
  oracle: [
    body('prompt').optional({ values: 'falsy' }).trim().isLength({ max: 4000 }).withMessage('is too long'),
    body('message').optional({ values: 'falsy' }).trim().isLength({ max: 4000 }).withMessage('is too long'),
    objectId(body('postId').optional({ values: 'null' })),
  ],
};

export const coachValidators = {
  dismissTip: [param('tipId').trim().notEmpty().withMessage('is required')],
  leaderboard: [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('must be between 1 and 100'),
    query('category').optional().trim().isLength({ max: 60 }).withMessage('is too long'),
  ],
  progress: [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('must be between 1 and 365'),
  ],
};

export const usageValidators = {
  range: [
    query('days').optional().isInt({ min: 1, max: 365 }).withMessage('must be between 1 and 365'),
  ],
};

export const personaValidators = {
  byId: [objectId(param('id'))],
  compare: [objectId(param('id1')), objectId(param('id2'))],
  list: [
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('must be between 1 and 100'),
  ],
};

export const huddleValidators = {
  create: [
    body('contextType').optional().isIn(['standalone', 'post', 'debate', 'community'])
      .withMessage('is not a recognised context type'),
    objectId(body('contextId').optional({ values: 'null' })),
    body('topic').optional({ values: 'falsy' }).trim().isLength({ max: 300 }).withMessage('is too long'),
  ],

  byId: [objectId(param('id'))],

  join: [
    param('joinCode').trim().isLength({ min: 4, max: 12 }).withMessage('is not a valid join code'),
  ],

  transcript: [
    objectId(param('id')),
    body('text').trim().isLength({ min: 1, max: 5000 }).withMessage('must be 1-5000 characters'),
  ],

  publish: [
    objectId(param('id')),
    body('communityName').trim().notEmpty().withMessage('is required'),
  ],
};

export const slickValidators = {
  create: [
    body('content').trim().isLength({ min: 10, max: 500 }).withMessage('must be 10-500 characters'),
    objectId(body('targetUserId')),
    body('tone').notEmpty().withMessage('is required'),
    body('visibility').optional().isIn(['public', 'private', 'anonymous'])
      .withMessage('is not a recognised visibility'),
  ],

  byId: [objectId(param('id'))],
  byTargetUser: [objectId(param('targetUserId'))],
  byUser: [objectId(param('userId'))],
};

export const threadValidators = {
  byPost: [objectId(param('postId'))],
};

export const communityAnalysisValidators = {
  byName: [param('name').trim().notEmpty().withMessage('is required')],
};

export const knowledgeGraphValidators = {
  byClaim: [objectId(param('claimId'))],
  byTopic: [param('topic').trim().notEmpty().withMessage('is required')],
  search: [
    query('q').optional().trim().isLength({ max: 300 }).withMessage('is too long'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('must be between 1 and 100'),
  ],
  claimStats: [
    body('claimText').trim().isLength({ min: 3, max: 2000 }).withMessage('must be 3-2000 characters'),
  ],
};

export const debateValidators = {
  createVsAI: [
    body('topic').trim().isLength({ min: 3, max: 300 }).withMessage('must be 3-300 characters'),
    body('side').optional().isIn(['for', 'against']).withMessage("must be 'for' or 'against'"),
    body('difficulty').optional().isIn(['easy', 'balanced', 'hard', 'brutal'])
      .withMessage("must be 'easy', 'balanced', 'hard' or 'brutal'"),
    body('style').optional().isIn(['socratic', 'evidence', 'aggressive', 'empathetic'])
      .withMessage('is not a recognised opponent style'),
  ],
};

export const feedValidators = {
  list: [
    query('page').optional().isInt({ min: 1 }).withMessage('must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('must be between 1 and 50'),
  ],
};
