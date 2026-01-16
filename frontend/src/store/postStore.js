import { create } from 'zustand';
import postService from '../services/postService';

const usePostStore = create((set, get) => ({
  posts: [],
  currentPost: null,
  loading: false,
  error: null,

  // Fetch posts
  fetchPosts: async (params = {}) => {
    set({ loading: true, error: null });
    try {
      const data = await postService.getPosts(params);
      set({ posts: data.data.posts, loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch posts',
        loading: false 
      });
    }
  },

  // Fetch single post
  fetchPost: async (id) => {
    set({ loading: true, error: null });
    try {
      const data = await postService.getPost(id);
      set({ currentPost: data.data.post, loading: false });
    } catch (error) {
      set({ 
        error: error.response?.data?.message || 'Failed to fetch post',
        loading: false 
      });
    }
  },

  // Create post
  createPost: async (postData) => {
    set({ loading: true, error: null });
    try {
      const data = await postService.createPost(postData);
      set((state) => ({
        posts: [data.data.post, ...state.posts],
        loading: false,
      }));
      return { success: true, post: data.data.post };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create post';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Vote on post
  votePost: async (postId, vote) => {
    try {
      const data = await postService.votePost(postId, vote);
      
      // Update post in list
      set((state) => ({
        posts: state.posts.map((post) =>
          post._id === postId
            ? { 
                ...post, 
                upvotes: data.data.upvotes,
                downvotes: data.data.downvotes,
                karma: data.data.karma,
              }
            : post
        ),
      }));
      
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to vote' 
      };
    }
  },

  clearError: () => set({ error: null }),
}));

export default usePostStore;