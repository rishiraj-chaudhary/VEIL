import api from './api';

const commentService = {
  // Get comments for a post
  getPostComments: async (postId) => {
    const response = await api.get(`/comments/post/${postId}`);
    return response.data;
  },

  // Create comment
  createComment: async (data) => {
    const response = await api.post('/comments', data);
    return response.data;
  },

  // Vote on comment
  voteComment: async (commentId, vote) => {
    const response = await api.post(`/comments/${commentId}/vote`, { vote });
    return response.data;
  },

  // Delete comment
  deleteComment: async (commentId) => {
    const response = await api.delete(`/comments/${commentId}`);
    return response.data;
  },
};

export default commentService;