import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import morgan from 'morgan';
import connectDB from './src/config/database.js';
import { corsOptions } from './src/config/cors.js';
import { errorHandler, notFoundHandler } from './src/middleware/errorHandler.js';
import { requestLogger } from './src/utils/logger.js';
import { enforceAIBudget } from './src/middleware/aiBudget.js';
import { aiLimiter, authLimiter, globalLimiter } from './src/middleware/rateLimit.js';
import './src/models/Huddle.js';
import './src/models/post.js';
import './src/models/UserPerformance.js';
import aiCoachRoutes from './src/routes/aiCoachRoutes.js';
import aiUsageRoutes from './src/routes/aiUsageRoutes.js';
import communityHealthRoutes from './src/routes/communityHealthRoutes.js';
import communityMemoryRoutes from './src/routes/communityMemoryRoutes.js';
import drillRoutes from './src/routes/drillRoutes.js';
import feedRoutes from './src/routes/feedRoutes.js';
import huddleRoutes from './src/routes/huddleRoutes.js';
import karmaRoutes from './src/routes/karmaRoutes.js';
import knowledgeGraphRoutes from './src/routes/knowledgeGraphRoutes.js';
import personaRoutes from './src/routes/personaRoutes.js';
import reputationRoutes from './src/routes/reputationRoutes.js';
import sparringRoutes from './src/routes/sparringRoutes.js';
import threadRoutes from './src/routes/threadRoutes.js';
dotenv.config();

// MODELS FIRST - Register Mongoose schemas
import './src/models/debate.js';
import './src/models/DebateMemory.js';
import './src/models/debateTurn.js';
import './src/models/KnowledgeItem.js';
import './src/models/PersonaSnapshot.js';
import './src/models/user.js';

// Routes
import aiRoutes from './src/routes/aiRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import commentRoutes from './src/routes/commentRoutes.js';
import communityRoutes from './src/routes/communityRoutes.js';
import debateRoutes from './src/routes/debateRoutes.js';
import postRoutes from './src/routes/postRoutes.js';
import slickRoutes from './src/routes/slickRoutes.js';

// Services
import debateAIService from './src/services/debateAIService.js';
import feedScheduler from './src/services/feedScheduler.js';
import { registerJobHandlers } from './src/services/jobHandlers.js';
import jobQueue from './src/services/jobQueue.js';
import { personaScheduler } from './src/services/personaScheduler.js';

// Socket
import { initSocket } from './src/sockets/index.js';

const app = express();
const PORT = process.env.PORT || 5001;
const server = createServer(app);

initSocket(server);

// RAG shares the Mongoose connection pool, so it must wait for the connection
// rather than racing it — otherwise the vector store initialises against null.
(async () => {
  try {
    await connectDB();
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return;
  }

  try {
    console.log('\n📊 Initializing RAG System...');
    await debateAIService.initializeRAG();
    console.log('✅ RAG System ready\n');
  } catch (error) {
    console.error('⚠️  RAG initialization failed (non-blocking):', error.message);
  }
})();

app.use(helmet());
app.use(cors(corsOptions));
app.use(compression());
// morgan stays for local readability; requestLogger adds the request id and the
// structured line that production tooling actually queries.
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(requestLogger);
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Behind Vercel/Render/nginx the client IP arrives in X-Forwarded-For; without
// this every request would share the proxy's IP and rate limits would be global.
app.set('trust proxy', 1);

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'VEIL Backend is running',
    timestamp: new Date().toISOString(),
    personaScheduler: personaScheduler.getStatus(),
    feedScheduler: feedScheduler.getStatus(),
    jobWorker: jobQueue.getStatus(),
  });
});

app.get('/', (req, res) => {
  res.json({ name: 'VEIL API', version: '1.0.0', description: 'AI-Enhanced Social Discourse Platform' });
});

app.use('/api', globalLimiter);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ai', aiLimiter, enforceAIBudget, aiRoutes);
app.use('/api/slicks', slickRoutes);
app.use('/api/debates', enforceAIBudget, debateRoutes);
app.use('/api/knowledge-graph', knowledgeGraphRoutes);
app.use('/api/coach', aiCoachRoutes);
app.use('/api/persona', personaRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/feed', feedRoutes);
app.use('/api/thread', threadRoutes);
app.use('/api/communities', communityMemoryRoutes);
app.use('/api/communities', communityHealthRoutes);
app.use('/api/huddles', huddleRoutes);
app.use('/api/karma', karmaRoutes);
app.use('/api/reputation', reputationRoutes);
app.use('/api/sparring', aiLimiter, enforceAIBudget, sparringRoutes);
app.use('/api/drills', enforceAIBudget, drillRoutes);


app.use(notFoundHandler);
app.use(errorHandler);

server.listen(PORT, () => {
  console.log(`
  ═══════════════════════════════════════
          VEIL Backend Started
  ═══════════════════════════════════════
  🚀 Server running on port ${PORT}
  🔮 ORACLE AI Assistant: Ready
  🌑 SHADOW Bot: Standby
  ✨ Unveiling Truth: Active
  ⚡ Socket.io: Connected
  ⚖️ Debates: Active
  📸 Persona Drift: Enabled
  ═══════════════════════════════════════
  `);
  try {
    personaScheduler.start();
  } catch (error) {
    console.error('⚠️ Failed to start persona scheduler:', error);
  }

  try {
    feedScheduler.start();
  } catch (error) {
    console.error('⚠️ Failed to start feed scheduler:', error);
  }

  try {
    registerJobHandlers();
    jobQueue.start();
  } catch (error) {
    console.error('⚠️ Failed to start job worker:', error);
  }
});

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  personaScheduler.stop();
  feedScheduler.stop();
  jobQueue.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export default app;