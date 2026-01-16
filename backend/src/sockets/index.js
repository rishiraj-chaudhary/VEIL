import { Server } from 'socket.io';

let io;

export const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:5173'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Track active users per post
  const activeUsers = new Map(); // postId -> Set of socketIds

  io.on('connection', (socket) => {
    console.log('🔌 User connected:', socket.id);

    // Join a post room
    socket.on('join-post', (postId) => {
      socket.join(`post:${postId}`);
      
      // Track user
      if (!activeUsers.has(postId)) {
        activeUsers.set(postId, new Set());
      }
      activeUsers.get(postId).add(socket.id);

      // Broadcast updated viewer count
      const viewerCount = activeUsers.get(postId).size;
      io.to(`post:${postId}`).emit('viewer-count', viewerCount);

      console.log(`👁️  User joined post ${postId}, viewers: ${viewerCount}`);
    });

    // Leave a post room
    socket.on('leave-post', (postId) => {
      socket.leave(`post:${postId}`);
      
      // Remove from active users
      if (activeUsers.has(postId)) {
        activeUsers.get(postId).delete(socket.id);
        const viewerCount = activeUsers.get(postId).size;
        io.to(`post:${postId}`).emit('viewer-count', viewerCount);

        // Clean up empty sets
        if (viewerCount === 0) {
          activeUsers.delete(postId);
        }
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('❌ User disconnected:', socket.id);
      
      // Remove from all posts
      activeUsers.forEach((users, postId) => {
        if (users.has(socket.id)) {
          users.delete(socket.id);
          const viewerCount = users.size;
          io.to(`post:${postId}`).emit('viewer-count', viewerCount);

          if (viewerCount === 0) {
            activeUsers.delete(postId);
          }
        }
      });
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
};

export const emitVoteUpdate = (postId, data) => {
  if (io) {
    io.to(`post:${postId}`).emit('vote-update', data);
  }
};

export const emitNewComment = (postId, comment) => {
  if (io) {
    io.to(`post:${postId}`).emit('new-comment', comment);
  }
};