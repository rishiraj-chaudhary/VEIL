import { create } from 'zustand';
import commentService from '../services/commentService';
import useAuthStore from './authStore';

const useCommentStore = create((set, get) => ({
  comments: [],
  replies:  [],
  loading:  false,
  error:    null,

  fetchComments: async (postId) => {
    set({ loading: true, error: null });
    try {
      const data = await commentService.getPostComments(postId);
      set({ comments: data.data.comments, replies: data.data.replies, loading: false });
    } catch (error) {
      set({ error: error.response?.data?.message || 'Failed to fetch comments', loading: false });
    }
  },

  createComment: async (commentData) => {
    set({ loading: true, error: null });
    try {
      const data = await commentService.createComment(commentData);
      if (commentData.parentId) {
        set((state) => ({ replies: [...state.replies, data.data.comment], loading: false }));
      } else {
        set((state) => ({ comments: [data.data.comment, ...state.comments], loading: false }));
      }
      return { success: true, comment: data.data.comment };
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Failed to create comment';
      set({ error: errorMessage, loading: false });
      return { success: false, error: errorMessage };
    }
  },

  voteComment: async (commentId, vote) => {
    try {
      const data = await commentService.voteComment(commentId, vote);

      const update = (comment) =>
        comment._id === commentId
          ? { ...comment, upvotes: data.data.upvotes, downvotes: data.data.downvotes, karma: data.data.karma }
          : comment;

      set((state) => ({
        comments: state.comments.map(update),
        replies:  state.replies.map(update),
      }));

      // ── Refresh logged-in user's karma in Navbar ───────────────────────────
      useAuthStore.getState().refreshUser();

      return { success: true };
    } catch (error) {
      return { success: false, error: error.response?.data?.message || 'Failed to vote' };
    }
  },

  clearError: () => set({ error: null }),
}));

export default useCommentStore;