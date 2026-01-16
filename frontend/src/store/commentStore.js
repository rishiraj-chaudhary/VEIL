import { create } from 'zustand';
import commentService from '../services/commentService';

const useCommentStore = create((set, get) => ({
  comments: [],
  replies: [],
  loading: false,
  error: null,

  // Fetch comments for a post
  fetchComments: async (postId) => {
    set({ loading: true, error: null });
    try {
      const data = await commentService.getPostComments(postId);
      set({
        comments: data.data.comments,
        replies: data.data.replies,
        loading: false,
      });
    } catch (error) {
      set({
        error: error.response?.data?.message || 'Failed to fetch comments',
        loading: false,
      });
    }
  },

  // Create comment
  createComment: async (commentData) => {
    set({ loading: true, error: null });
    try {
      const data = await commentService.createComment(commentData);
      
      // Add to appropriate list
      if (commentData.parentId) {
        set((state) => ({
          replies: [...state.replies, data.data.comment],
          loading: false,
        }));
      } else {
        set((state) => ({
          comments: [data.data.comment, ...state.comments],
          loading: false,
        }));
      }
      
      return { success: true, comment: data.data.comment };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create comment';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Vote on comment
  voteComment: async (commentId, vote) => {
    try {
      const data = await commentService.voteComment(commentId, vote);
      
      // Update comment in list
      set((state) => ({
        comments: state.comments.map((comment) =>
          comment._id === commentId
            ? {
                ...comment,
                upvotes: data.data.upvotes,
                downvotes: data.data.downvotes,
                karma: data.data.karma,
              }
            : comment
        ),
        replies: state.replies.map((comment) =>
          comment._id === commentId
            ? {
                ...comment,
                upvotes: data.data.upvotes,
                downvotes: data.data.downvotes,
                karma: data.data.karma,
              }
            : comment
        ),
      }));
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || 'Failed to vote',
      };
    }
  },

  clearError: () => set({ error: null }),
}));

export default useCommentStore;