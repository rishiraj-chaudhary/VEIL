import io from 'socket.io-client';

let debateSocket = null;

export const initDebateSocket = () => {
  if (debateSocket?.connected) {
    return debateSocket;
  }

  debateSocket = io('http://localhost:5001', {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
  });

  debateSocket.on('connect', () => {
    console.log('✅ Debate socket connected:', debateSocket.id);
  });

  debateSocket.on('disconnect', (reason) => {
    console.log('❌ Debate socket disconnected:', reason);
  });

  debateSocket.on('error', (error) => {
    console.error('Debate socket error:', error);
  });

  return debateSocket;
};

export const getDebateSocket = () => {
  return debateSocket;
};

export const disconnectDebateSocket = () => {
  if (debateSocket) {
    debateSocket.disconnect();
    debateSocket = null;
  }
};

export const joinDebateRoom = (debateId) => {
  if (debateSocket) {
    debateSocket.emit('join-debate', debateId);
    console.log('📍 Joined debate room:', debateId);
  }
};

export const leaveDebateRoom = (debateId) => {
  if (debateSocket) {
    debateSocket.emit('leave-debate', debateId);
    console.log('👋 Left debate room:', debateId);
  }
};

// ✅ FIX: Return unsubscribe functions
export const onTurnSubmitted = (callback) => {
  if (!debateSocket) {
    console.warn('⚠️ Socket not initialized for onTurnSubmitted');
    return () => {}; // Return empty function
  }
  
  debateSocket.on('turn-submitted', callback);
  
  // Return unsubscribe function
  return () => {
    if (debateSocket) {
      debateSocket.off('turn-submitted', callback);
    }
  };
};

export const onDebateCompleted = (callback) => {
  if (!debateSocket) {
    console.warn('⚠️ Socket not initialized for onDebateCompleted');
    return () => {}; // Return empty function
  }
  
  debateSocket.on('debate-completed', callback);
  
  // Return unsubscribe function
  return () => {
    if (debateSocket) {
      debateSocket.off('debate-completed', callback);
    }
  };
};

export const onDebateStarted = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('debate-started', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('debate-started', callback);
    }
  };
};

export const onAnalysisComplete = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('analysis-complete', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('analysis-complete', callback);
    }
  };
};

export const onParticipantJoined = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('participant-joined', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('participant-joined', callback);
    }
  };
};

export const onParticipantReady = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('participant-ready', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('participant-ready', callback);
    }
  };
};

export const onRoundAdvanced = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('round-advanced', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('round-advanced', callback);
    }
  };
};

export const onVoteCast = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('vote-cast', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('vote-cast', callback);
    }
  };
};

export const onReactionAdded = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('reaction-added', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('reaction-added', callback);
    }
  };
};

export const onDebateCancelled = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('debate-cancelled', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('debate-cancelled', callback);
    }
  };
};

export const onViewerCount = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('viewer-count', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('viewer-count', callback);
    }
  };
};

export const onDebateState = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('debate-state', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('debate-state', callback);
    }
  };
};

export const onUserTyping = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('user-typing', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('user-typing', callback);
    }
  };
};

export const onUserStoppedTyping = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('user-stopped-typing', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('user-stopped-typing', callback);
    }
  };
};

export const onDebateError = (callback) => {
  if (!debateSocket) return () => {};
  
  debateSocket.on('debate-error', callback);
  
  return () => {
    if (debateSocket) {
      debateSocket.off('debate-error', callback);
    }
  };
};

export const emitTyping = (debateId, username) => {
  if (debateSocket) {
    debateSocket.emit('typing', { debateId, username });
  }
};

export const emitStopTyping = (debateId) => {
  if (debateSocket) {
    debateSocket.emit('stop-typing', { debateId });
  }
};

export const removeAllListeners = () => {
  if (debateSocket) {
    debateSocket.removeAllListeners();
  }
};