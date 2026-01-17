import dotenv from 'dotenv';
dotenv.config();

// Debug environment loading
console.log('🔍 GROK_API_KEY loaded:', process.env.GROK_API_KEY ? 'YES ✅' : 'NO ❌');
console.log('🔍 First 10 chars:', process.env.GROK_API_KEY?.substring(0, 10));

// Now import everything else (AFTER dotenv is configured)
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createServer } from 'http';
import morgan from 'morgan';
import connectDB from './src/config/database.js';
import aiRoutes from './src/routes/aiRoutes.js';
import authRoutes from './src/routes/authRoutes.js';
import commentRoutes from './src/routes/commentRoutes.js';
import communityRoutes from './src/routes/communityRoutes.js';
import postRoutes from './src/routes/postRoutes.js';
import slickRoutes from './src/routes/slickRoutes.js';
import { initSocket } from './src/sockets/index.js';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 5001;

// Create HTTP server
const server = createServer(app);

// Initialize Socket.io
initSocket(server);

// Connect to MongoDB
connectDB();

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
      reveal: '✨ Truth Unveiled'
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
  ═══════════════════════════════════════
  `);
});

export default app;