import compression from 'compression';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import morgan from 'morgan';
import connectDB from './src/config/database.js';

// 🆕 MODELS FIRST - Register Mongoose schemas
import './src/models/debate.js';
import './src/models/DebateMemory.js';
import './src/models/debateTurn.js';
import './src/models/KnowledgeItem.js';
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

// Socket
import { initSocket } from './src/sockets/index.js';

dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.io
initSocket(server);

// Connect to MongoDB
connectDB();

// Initialize RAG System (after DB connection)
(async () => {
  try {
    console.log('\n📊 Initializing RAG System...');
    await debateAIService.initializeRAG();
    console.log('✅ RAG System ready\n');
  } catch (error) {
    console.error('⚠️  RAG initialization failed (non-blocking):', error.message);
  }
})();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(compression());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'VEIL Backend is running',
    timestamp: new Date().toISOString()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'VEIL API',
    version: '1.0.0',
    description: 'AI-Enhanced Social Discourse Platform',
    features: {
      oracle: '🔮 AI Assistant Ready',
      shadow: '🌑 Devil\'s Advocate Standby',
      reveal: '✨ Truth Unveiled',
      debates: '⚖️ Structured Debates'
    }
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/communities', communityRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/slicks', slickRoutes);
app.use('/api/debates', debateRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// Start server (use server, not app)
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
  ═══════════════════════════════════════
  `);
});

export default app;