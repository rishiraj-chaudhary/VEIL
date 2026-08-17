import debateAssistantService from '../services/debateAssistantService.js';
import logger from '../utils/logger.js';
import { authenticateSocket, socketRateLimiter } from './socketAuth.js';

/**
 * Live Debate Assistant Socket Handler
 *
 * Provides real-time suggestions while users type.
 *
 * Every `analyze-draft` runs fallacy detection, rebuttal matching and strength
 * scoring — several model calls. The namespace previously took no token, so
 * those calls were reachable by anyone who could open a socket, and the `userId`
 * used for throttling came from the message body, meaning a caller could vary it
 * to defeat the service's own per-user throttle. Both now come from the verified
 * handshake, with a connection-level ceiling on top.
 */

// The service already throttles to one analysis every 2s per user; this is the
// backstop against a client that reconnects or spins to get around it.
const withinRateLimit = socketRateLimiter({ max: 40, windowMs: 60_000 });

export const initLiveAssistant = (io) => {
  const assistantNamespace = io.of('/assistant');

  assistantNamespace.use(authenticateSocket);

  assistantNamespace.on('connection', (socket) => {
    logger.debug('assistant socket connected', { socketId: socket.id, userId: socket.userId });

    // Join debate assistant room
    socket.on('join-debate-assistant', ({ debateId } = {}) => {
      if (!debateId) return;
      socket.join(`debate-assistant-${debateId}`);
    });

    // Leave debate assistant room
    socket.on('leave-debate-assistant', ({ debateId } = {}) => {
      if (!debateId) return;
      socket.leave(`debate-assistant-${debateId}`);
    });

    // Analyze draft in real-time
    socket.on('analyze-draft', async (data = {}) => {
      try {
        const { debateId, currentDraft, side } = data;

        if (!currentDraft || currentDraft.length < 20) return;

        if (!withinRateLimit(socket)) {
          socket.emit('draft-insights-error', {
            message: 'Slow down a moment — too many analyses in a short window.',
          });
          return;
        }

        const insights = await debateAssistantService.getLiveDebateInsights({
          debateId,
          // Identity comes from the handshake, never from the payload.
          userId: socket.userId,
          currentDraft,
          side,
        });

        socket.emit('draft-insights', insights);

      } catch (error) {
        // The draft content itself is never logged — it is a user's unsent
        // argument, and this used to print the whole insight payload per call.
        logger.error('live assistant failed', {
          userId: socket.userId,
          error: error.message,
        });

        socket.emit('draft-insights', {
          warnings: [],
          opportunities: [],
          suggestions: [],
          stats: { wordCount: 0, evidenceCount: 0 },
        });
      }
    });

    socket.on('disconnect', () => {
      logger.debug('assistant socket disconnected', { socketId: socket.id });
    });
  });

  return assistantNamespace;
};

export default initLiveAssistant;
