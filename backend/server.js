import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import morgan from 'morgan';
import connectDB from './src/config/database.js';
import './src/models/Huddle.js';
import './src/models/post.js';
import './src/models/UserPerformance.js';
import aiCoachRoutes from './src/routes/aiCoachRoutes.js';
import aiUsageRoutes from './src/routes/aiUsageRoutes.js';
import communityHealthRoutes from './src/routes/communityHealthRoutes.js';
import communityMemoryRoutes from './src/routes/communityMemoryRoutes.js';
import feedRoutes from './src/routes/feedRoutes.js';
import huddleRoutes from './src/routes/huddleRoutes.js';
import karmaRoutes from './src/routes/karmaRoutes.js';
import knowledgeGraphRoutes from './src/routes/knowledgeGraphRoutes.js';
import personaRoutes from './src/routes/personaRoutes.js';
import threadRoutes from './src/routes/threadRoutes.js';
dotenv.config();

// MODELS FIRST - Register Mongoose schemas
import './src/models/Debate.js';
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
import { personaScheduler } from './src/services/personaScheduler.js';

// Socket
import { initSocket } from './src/sockets/index.js';

const app = express();
const PORT = process.env.PORT || 5001;
const server = createServer(app);

initSocket(server);
connectDB();

(async () => {
  try {
    console.log('\n📊 Initializing RAG System...');
    await debateAIService.initializeRAG();
    console.log('✅ RAG System ready\n');
  } catch (error) {
    console.error('⚠️  RAG initialization failed (non-blocking):', error.message);
  }
})();

app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://veil-lvmb.vercel.app',
    'https://veil-lvmb-j1is6mtq4-rishis-projects-93e34b4b.vercel.app',
    process.env.FRONTEND_URL,
  ].filter(Boolean),
  credentials: true,
}));app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'VEIL Backend is running', timestamp: new Date().toISOString(), personaScheduler: personaScheduler.getStatus() });
});

app.get('/', (req, res) => {
  res.json({ name: 'VEIL API', version: '1.0.0', description: 'AI-Enhanced Social Discourse Platform' });
});

app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/slicks', slickRoutes);
app.use('/api/debates', debateRoutes);
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


app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

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
});

process.on('SIGTERM', () => {
  personaScheduler.stop();
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  personaScheduler.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;