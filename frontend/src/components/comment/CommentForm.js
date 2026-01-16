import { useEffect, useState } from 'react';
import useAIStore from '../../store/aiStore';
import useCommentStore from '../../store/commentStore';
import AIGeneratedModal from '../ai/AIGeneratedModal';
import OracleButton from '../ai/OracleButton';

const CommentForm = ({
  postId,
  parentId = null,
  replyingToUsername = null,
  onCancel,
  onSuccess
}) => {
  const [content, setContent] = useState('');
  const [showAIModal, setShowAIModal] = useState(false);
  const [lastPrompt, setLastPrompt] = useState('');

  const { createComment } = useCommentStore();
  const {
    enabled: aiEnabled,
    loading: aiLoading,
    generatedText,
    generateReply,
    clearGenerated,
    checkStatus
  } = useAIStore();

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    const result = await createComment({
      content,
      postId,
      parentId
    });

    if (result?.success) {
      setContent('');
      onSuccess?.();
      onCancel?.();
    }
  };

  const handleOracleGenerate = async (options = {}) => {
    let prompt = content.trim();

    if (!prompt) {
      if (replyingToUsername) {
        prompt = `Help me write a thoughtful reply to @${replyingToUsername}`;
      } else if (parentId) {
        prompt = 'Help me write a thoughtful reply to the comment above';
      } else {
        prompt = 'Help me write a thoughtful comment on this post';
      }
    } else if (replyingToUsername) {
      prompt = `Improve this reply to @${replyingToUsername}: "${prompt}"`;
    }

    setLastPrompt(prompt);
    setShowAIModal(true);

    await generateReply(prompt, {
      postId,
      parentId,
      replyingTo: replyingToUsername,
      ...options
    });
  };

  const handleAcceptAI = (text) => {
    setContent(text);
    setShowAIModal(false);
    clearGenerated();
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={parentId ? 'Write a reply...' : 'What are your thoughts?'}
          className="w-full bg-slate-900 text-white rounded-lg p-3 min-h-[100px]"
          required
        />

        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <OracleButton onGenerate={handleOracleGenerate} />
            )}
            <span className="text-xs text-gray-500">
              {content.length} characters
            </span>
          </div>

          <div className="flex gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="text-gray-400 hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={!content.trim()}
              className="bg-veil-purple text-white px-4 py-2 rounded"
            >
              {parentId ? 'Reply' : 'Comment'}
            </button>
          </div>
        </div>
      </form>

      {showAIModal && (
        <AIGeneratedModal
          generatedText={generatedText}
          loading={aiLoading}
          onAccept={handleAcceptAI}
          onCancel={() => {
            setShowAIModal(false);
            clearGenerated();
          }}
        />
      )}
    </>
  );
};

export default CommentForm;