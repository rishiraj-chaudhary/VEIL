export const initDebateSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('✅ Socket connected:', socket.id);

    // Join debate room
    socket.on('join-debate', (debateId) => {
      socket.join(`debate-${debateId}`);
      console.log(`📍 Socket ${socket.id} joined debate-${debateId}`);
      
      // Emit viewer count
      const room = io.sockets.adapter.rooms.get(`debate-${debateId}`);
      const viewerCount = room ? room.size : 0;
      io.to(`debate-${debateId}`).emit('viewer-count', viewerCount);
    });

    // Leave debate room
    socket.on('leave-debate', (debateId) => {
      socket.leave(`debate-${debateId}`);
      console.log(`👋 Socket ${socket.id} left debate-${debateId}`);
      
      // Emit updated viewer count
      const room = io.sockets.adapter.rooms.get(`debate-${debateId}`);
      const viewerCount = room ? room.size : 0;
      io.to(`debate-${debateId}`).emit('viewer-count', viewerCount);
    });

    // Typing indicators
    socket.on('typing', ({ debateId, username }) => {
      socket.to(`debate-${debateId}`).emit('user-typing', { username });
    });

    socket.on('stop-typing', ({ debateId }) => {
      socket.to(`debate-${debateId}`).emit('user-stopped-typing');
    });

    socket.on('disconnect', () => {
      console.log('❌ Socket disconnected:', socket.id);
    });
  });

  console.log('✅ Debate socket initialized');
};

// Emit debate started
export const emitDebateStarted = (io, debateId, debate) => {
  io.to(`debate-${debateId}`).emit('debate-started', {
    debateId,
    debate
  });
  console.log(`🎉 Debate started event emitted for debate-${debateId}`);
};

// Emit analysis complete
export const emitAnalysisComplete = (io, debateId, turnId) => {
  io.to(`debate-${debateId}`).emit('analysis-complete', {
    turnId
  });
  console.log(`✅ Analysis complete event emitted for turn ${turnId}`);
};

// Emit turn submitted
export const emitTurnSubmitted = (io, debateId, turnData) => {
  io.to(`debate-${debateId}`).emit('turn-submitted', turnData);
  console.log(`📝 Turn submitted event emitted for debate-${debateId}`);
};

// Emit round advanced
export const emitRoundAdvanced = (io, debateId, roundData) => {
  io.to(`debate-${debateId}`).emit('round-advanced', roundData);
  console.log(`🔄 Round advanced event emitted for debate-${debateId}`);
};

// Emit debate completed
export const emitDebateCompleted = (io, debateId, results) => {
  io.to(`debate-${debateId}`).emit('debate-completed', results);
  console.log(`🏁 Debate completed event emitted for debate-${debateId}`);
};

// Emit participant joined
export const emitParticipantJoined = (io, debateId, participant) => {
  io.to(`debate-${debateId}`).emit('participant-joined', participant);
  console.log(`👤 Participant joined event emitted for debate-${debateId}`);
};

// Emit participant ready
export const emitParticipantReady = (io, debateId, userId, username) => {
  io.to(`debate-${debateId}`).emit('participant-ready', {
    userId,
    username
  });
  console.log(`✓ Participant ready event emitted for ${username} in debate-${debateId}`);
};

// Emit vote cast
export const emitVoteCast = (io, debateId, voteData) => {
  io.to(`debate-${debateId}`).emit('vote-cast', voteData);
  console.log(`🗳️ Vote cast event emitted for debate-${debateId}`);
};

// Emit reaction added
export const emitReactionAdded = (io, debateId, turnId, reactionData) => {
  io.to(`debate-${debateId}`).emit('reaction-added', {
    turnId,
    ...reactionData
  });
  console.log(`❤️ Reaction added event emitted for turn ${turnId}`);
};

// Emit debate cancelled
export const emitDebateCancelled = (io, debateId) => {
  io.to(`debate-${debateId}`).emit('debate-cancelled', {
    debateId
  });
  console.log(`❌ Debate cancelled event emitted for debate-${debateId}`);
};

// Get viewer count (utility function)
export const getViewerCount = (io, debateId) => {
  const room = io.sockets.adapter.rooms.get(`debate-${debateId}`);
  return room ? room.size : 0;
};

// Get active debates (utility function)
export const getActiveDebates = (io) => {
  const rooms = io.sockets.adapter.rooms;
  const activeDebates = [];
  
  rooms.forEach((sockets, roomName) => {
    if (roomName.startsWith('debate-')) {
      activeDebates.push({
        debateId: roomName.replace('debate-', ''),
        viewers: sockets.size
      });
    }
  });
  
  return activeDebates;
};