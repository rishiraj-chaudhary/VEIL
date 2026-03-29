import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import postService from '../../services/postService';
import useAuthStore from '../../store/authStore';
import usePostStore from '../../store/postStore';

// ── Intent pill ───────────────────────────────────────────────────────────────
const INTENT_COLORS = {
  argument:       'bg-red-900/30 text-red-400 border-red-800/50',
  question:       'bg-blue-900/30 text-blue-400 border-blue-800/50',
  discussion:     'bg-green-900/30 text-green-400 border-green-800/50',
  evidence:       'bg-cyan-900/30 text-cyan-400 border-cyan-800/50',
  opinion:        'bg-orange-900/30 text-orange-400 border-orange-800/50',
  humor:          'bg-yellow-900/30 text-yellow-400 border-yellow-800/50',
  news:           'bg-purple-900/30 text-purple-400 border-purple-800/50',
  rant:           'bg-pink-900/30 text-pink-400 border-pink-800/50',
  call_to_action: 'bg-teal-900/30 text-teal-400 border-teal-800/50',
};

const IntentPill = ({ intentType }) => {
  if (!intentType || intentType === 'unknown') return null;
  const label = intentType.replace(/_/g, ' ');
  const cls   = INTENT_COLORS[intentType] || 'bg-slate-700 text-gray-400 border-slate-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
};

// ── Why tooltip ───────────────────────────────────────────────────────────────
const WhyTooltip = ({ postId, why: initialWhy }) => {
  const [open, setOpen]       = useState(false);
  const [why, setWhy]         = useState(initialWhy || null);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = async () => {
    setOpen(o => !o);
    if (!why && !loading) {
      setLoading(true);
      try {
        const res = await postService.getWhyExplanation(postId);
        setWhy(res.data?.why || 'Shown based on your activity.');
      } catch {
        setWhy('Shown based on your activity.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={handleOpen}
        title="Why am I seeing this?"
        className="flex items-center gap-1 text-xs text-gray-500 hover:text-veil-purple transition-colors px-2 py-1 rounded-md hover:bg-slate-700/50"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Why?
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl z-50">
          <div className="flex items-start gap-2">
            <span className="text-veil-purple mt-0.5 shrink-0">✦</span>
            <p className="text-xs text-gray-300 leading-relaxed">
              {loading ? 'Loading...' : (why || 'Shown based on your activity.')}
            </p>
          </div>
          <div className="absolute -bottom-1.5 left-4 w-3 h-3 bg-slate-800 border-r border-b border-slate-600 rotate-45" />
        </div>
      )}
    </div>
  );
};

// ── PostCard ──────────────────────────────────────────────────────────────────

/**
 * @param {Object}   post
 * @param {boolean}  ranked          — true when in AI "For You" feed
 * @param {Function} onCommunityClick — if provided, clicking c/ label calls this
 *                                      instead of navigating. Used by Feed to
 *                                      activate community filter inline.
 */
const PostCard = ({ post, ranked = false, onCommunityClick }) => {
  const navigate        = useNavigate();
  const { votePost }    = usePostStore();
  const { refreshUser } = useAuthStore();
  const [userVote, setUserVote]   = useState(0);
  const [upvotes, setUpvotes]     = useState(post.upvotes);
  const [downvotes, setDownvotes] = useState(post.downvotes);

  const karma = upvotes - downvotes;

  const handleVote = async (vote) => {
    const newVote = userVote === vote ? 0 : vote;
    let upvoteChange = 0, downvoteChange = 0;
    if (userVote === 1)  upvoteChange   -= 1;
    if (userVote === -1) downvoteChange -= 1;
    if (newVote === 1)   upvoteChange   += 1;
    if (newVote === -1)  downvoteChange += 1;
    setUpvotes(upvotes + upvoteChange);
    setDownvotes(downvotes + downvoteChange);
    setUserVote(newVote);
    const result = await votePost(post._id, newVote);
    if (!result.success) {
      setUpvotes(upvotes);
      setDownvotes(downvotes);
      setUserVote(userVote);
    } else {
      await refreshUser();
    }
  };

  const formatTime = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${d}d ago`;
  };

  const handleCommunityClick = (e) => {
    e.preventDefault();
    if (onCommunityClick && post.community?.name) {
      // In feed: activate filter, don't navigate
      onCommunityClick(post.community.name);
    } else {
      // On community page or post detail: navigate normally
      navigate(`/c/${post.community?.name}`);
    }
  };

  const scores      = post._rankScores;
  const hasRankData = ranked && (scores || post._why);

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
      <div className="flex">

        {/* Vote section */}
        <div className="bg-slate-900 p-2 flex flex-col items-center justify-start space-y-1 rounded-l-lg">
          <button
            onClick={() => handleVote(1)}
            className={`p-1 rounded hover:bg-slate-800 transition-colors ${userVote === 1 ? 'text-orange-500' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 10l5-5 5 5H5z" />
            </svg>
          </button>
          <span className={`text-sm font-bold ${karma > 0 ? 'text-orange-500' : karma < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
            {karma}
          </span>
          <button
            onClick={() => handleVote(-1)}
            className={`p-1 rounded hover:bg-slate-800 transition-colors ${userVote === -1 ? 'text-blue-500' : 'text-gray-400'}`}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M15 10l-5 5-5-5h10z" />
            </svg>
          </button>
        </div>

        {/* Content section */}
        <div className="flex-1 p-4">

          {/* Meta row */}
          <div className="flex items-center space-x-2 text-xs text-gray-400 mb-2">
            <button
              onClick={handleCommunityClick}
              className="font-semibold hover:text-veil-purple transition-colors"
            >
              c/{post.community?.name}
            </button>
            <span>•</span>
            <span>Posted by u/{post.author?.username}</span>
            <span>•</span>
            <span>{formatTime(post.createdAt)}</span>
          </div>

          <Link to={`/post/${post._id}`}>
            <h3 className="text-lg font-semibold text-white mb-2 hover:text-veil-purple transition-colors">
              {post.title}
            </h3>
          </Link>

          {post.content && (
            <p className="text-gray-300 text-sm mb-3 line-clamp-3">{post.content}</p>
          )}

          <div className="flex items-center space-x-4 text-sm text-gray-400">
            <Link to={`/post/${post._id}`} className="hover:text-white transition-colors">
              💬 {post.commentCount} comments
            </Link>
            <button className="hover:text-white transition-colors">Share</button>
            <button className="hover:text-white transition-colors">Save</button>
          </div>

          {/* AI rank metadata — only in For You tab */}
          {hasRankData && (
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700">
              <IntentPill intentType={post.intentType} />
              {scores && (
                <div className="flex items-center gap-2 ml-auto">
                  <div className="flex items-center gap-1">
                    <div className="w-14 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-veil-purple rounded-full"
                        style={{ width: `${scores.final}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{scores.final}%</span>
                  </div>
                  <WhyTooltip postId={post._id} why={post._why} />
                </div>
              )}
              {!scores && post._why && (
                <div className="ml-auto">
                  <WhyTooltip postId={post._id} why={post._why} />
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default PostCard;