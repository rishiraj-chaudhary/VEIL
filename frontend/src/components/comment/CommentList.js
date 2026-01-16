import { useEffect } from 'react';
import useCommentStore from '../../store/commentStore';
import CommentItem from './CommentItem';

const CommentList = ({ postId, onReply }) => {
  const { comments, replies, fetchComments, loading } = useCommentStore();

  useEffect(() => {
    fetchComments(postId);
  }, [postId, fetchComments]);

  // Build comment tree
  const buildCommentTree = () => {
    const commentMap = {};
    const tree = [];

    // Add all comments to map
    [...comments, ...replies].forEach((comment) => {
      commentMap[comment._id] = { ...comment, children: [] };
    });

    // Build tree structure
    Object.values(commentMap).forEach((comment) => {
      if (comment.parent) {
        const parent = commentMap[comment.parent];
        if (parent) {
          parent.children.push(comment);
        }
      } else {
        tree.push(comment);
      }
    });

    return tree;
  };

  const renderCommentTree = (comment, depth = 0) => {
    return (
      <div key={comment._id} className="mb-4">
        <CommentItem comment={comment} onReply={onReply} depth={depth} />
        {comment.children && comment.children.length > 0 && (
          <div className="mt-4">
            {comment.children.map((child) => renderCommentTree(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-veil-purple"></div>
      </div>
    );
  }

  const commentTree = buildCommentTree();

  if (commentTree.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No comments yet. Be the first to comment!
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {commentTree.map((comment) => renderCommentTree(comment))}
    </div>
  );
};

export default CommentList;