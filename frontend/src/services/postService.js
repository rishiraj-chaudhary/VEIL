import api from './api';

const postService = {
  // Get all posts
  getPosts: async (params = {}) => {
    const response = await api.get('/posts', { params });
    return response.data;
  },

  // Get single post
  getPost: async (id) => {
    const response = await api.get(`/posts/${id}`);
    return response.data;
  },

  // Create post
  createPost: async (data) => {
    const response = await api.post('/posts', data);
    return response.data;
  },

  // Vote on post
  votePost: async (id, vote) => {
    const response = await api.post(`/posts/${id}/vote`, { vote });
    return response.data;
  },

  // Delete post
  deletePost: async (id) => {
    const response = await api.delete(`/posts/${id}`);
    return response.data;
  },
};

export default postService;