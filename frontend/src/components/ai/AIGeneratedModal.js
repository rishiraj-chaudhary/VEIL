import { useEffect, useState } from 'react';

const AIGeneratedModal = ({ generatedText, onAccept, onRegenerate, onCancel, loading }) => {
  const [editedText, setEditedText] = useState('');

  // Debug log
  useEffect(() => {
    console.log('🎭 Modal render:', { 
      generatedText: generatedText?.substring(0, 50) + '...', 
      loading, 
      editedTextLength: editedText?.length 
    });
  }, [generatedText, loading, editedText]);

  // Update edited text when generatedText changes
  useEffect(() => {
    if (generatedText) {
      console.log('📝 Updating textarea with text length:', generatedText.length);
      setEditedText(generatedText);
    }
  }, [generatedText]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-lg max-w-2xl w-full border border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🔮</span>
            <h3 className="text-lg font-semibold text-white">
              Oracle Generated Reply
              {loading && <span className="text-sm text-gray-400 ml-2">(Generating...)</span>}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-white transition-colors text-xl"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-veil-purple mb-4"></div>
              <p className="text-gray-400 text-lg">🔮 Oracle is thinking...</p>
              <p className="text-xs text-gray-500 mt-2">This may take a few seconds</p>
            </div>
          ) : (
            <>
              <div className="bg-slate-900 rounded-lg p-4 mb-4">
                <label className="block text-sm text-gray-400 mb-2">
                  ✏️ Edit the response if needed:
                </label>
                <textarea
                  key={generatedText}  // Force re-render when text changes
                  value={editedText || ''}
                  onChange={(e) => setEditedText(e.target.value)}
                  className="w-full bg-slate-800 text-white rounded p-3 min-h-[200px] focus:outline-none focus:ring-2 focus:ring-veil-purple border border-slate-700"
                  placeholder="AI-generated text will appear here..."
                  autoFocus
                />
                <div className="flex justify-between items-center mt-2">
                  <div className="text-xs text-gray-500">
                    {editedText?.length || 0} characters
                  </div>
                  {editedText && (
                    <button
                      onClick={() => setEditedText('')}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Debug info */}
              {!editedText && generatedText && (
                <div className="bg-yellow-900 bg-opacity-20 border border-yellow-700 rounded-lg p-3 mb-4">
                  <p className="text-sm text-yellow-300">
                    ⚠️ Debug: Text received but not showing. 
                    Length: {generatedText.length}
                  </p>
                </div>
              )}

              {/* Tips */}
              <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-300">
                  💡 <strong>Tip:</strong> You can edit the AI-generated text before posting. 
                  Make it your own!
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-700">
          <button
            onClick={onRegenerate}
            disabled={loading}
            className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <span>🔄</span>
            <span>Regenerate</span>
          </button>

          <div className="flex space-x-3">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onAccept(editedText)}
              disabled={loading || !editedText?.trim()}
              className="px-4 py-2 text-sm bg-veil-purple hover:bg-veil-indigo text-white rounded transition-colors disabled:opacity-50"
            >
              Use This Reply ({editedText?.length || 0} chars)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIGeneratedModal;