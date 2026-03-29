/**
 * HUDDLE ROOM — Phase 11 (fixed)
 * Fixes:
 *   1. Double socket init from React StrictMode
 *   2. Double offer from both huddle:joined + huddle:peer-joined firing
 *   3. setRemoteDescription called in wrong state
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import Navbar from '../components/common/Navbar';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const SOCKET_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

const Timer = ({ startedAt }) => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  return <span className="font-mono text-sm text-gray-400">{m}:{s}</span>;
};

const VideoTile = ({ stream, label, muted = false, noVideo = false }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center">
      {stream && !noVideo ? (
        <video ref={ref} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      ) : (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-veil-purple/30 flex items-center justify-center text-2xl">👤</div>
          <span className="text-xs text-gray-500">Camera off</span>
        </div>
      )}
      <div className="absolute bottom-2 left-3 text-xs text-white bg-black/50 px-2 py-0.5 rounded">{label}</div>
    </div>
  );
};

const HuddleRoom = () => {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const token      = localStorage.getItem('veil_token');

  const [huddle, setHuddle]             = useState(null);
  const [loading, setLoading]           = useState(true);
  const [status, setStatus]             = useState('connecting');
  const [error, setError]               = useState(null);
  const [localStream, setLocalStream]   = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [audioOn, setAudioOn]           = useState(true);
  const [videoOn, setVideoOn]           = useState(true);
  const [captions, setCaptions]         = useState([]);
  const [peerConnected, setPeerConnected] = useState(false);
  const [summary, setSummary]           = useState(null);
  const [publishing, setPublishing]     = useState(false);
  const [communityName, setCommunityName] = useState('');
  const [published, setPublished]       = useState(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  const pcRef           = useRef(null);
  const socketRef       = useRef(null);
  const localStreamRef  = useRef(null);
  const isHostRef       = useRef(false);
  const recognitionRef  = useRef(null);
  const offerSentRef    = useRef(false);   // prevent duplicate offers
  const socketInitRef   = useRef(false);   // prevent StrictMode double-init

  useEffect(() => {
    loadHuddle();
    return () => cleanup();
  }, [id]); // eslint-disable-line

  const loadHuddle = async () => {
    try {
      const res = await api.get(`/huddles/${id}`);
      const h   = res.data.data.huddle;
      setHuddle(h);
      isHostRef.current = h.host._id === user?.id || h.host === user?.id;

      if (h.status === 'ended') {
        setStatus('ended');
        loadSummary();
        return;
      }

      const stream = await startMedia();
      if (stream) connectSocket(h);
      setStatus('ready');
    } catch (err) {
      setError('Could not load huddle.');
    } finally {
      setLoading(false);
    }
  };

  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      return stream;
    } catch {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(stream);
        localStreamRef.current = stream;
        setVideoOn(false);
        return stream;
      } catch {
        setError('Could not access camera/microphone.');
        return null;
      }
    }
  };

  const connectSocket = useCallback((h) => {
    // ── FIX 1: prevent StrictMode double-init ──────────────────────────────────
    if (socketInitRef.current) return;
    socketInitRef.current = true;

    const socket = io(`${SOCKET_URL}/huddle`, {
      auth: { token },
      transports: ['websocket'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('huddle:join', {
        huddleId: id,
        userId:   user?.id,
        username: user?.username,
      });
    });

    // ── FIX 2: only host initiates, only once ──────────────────────────────────
    socket.on('huddle:joined', ({ peerCount }) => {
      // Guest already in room when host joins — host initiates
      if (peerCount > 0 && isHostRef.current && !offerSentRef.current) {
        offerSentRef.current = true;
        initiateCall();
      }
    });

    socket.on('huddle:peer-joined', () => {
      setPeerConnected(true);
      // New peer joined — host initiates (only if not already sent)
      if (isHostRef.current && !offerSentRef.current) {
        offerSentRef.current = true;
        initiateCall();
      }
    });

    socket.on('huddle:offer', async ({ offer }) => {
      // Only guest handles incoming offers
      if (!isHostRef.current) await handleOffer(offer);
    });

    socket.on('huddle:answer', async ({ answer }) => {
      const pc = pcRef.current;
      if (!pc) return;
      // ── FIX 3: only set answer if we're in have-local-offer state ─────────────
      if (pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.warn('setRemoteDescription answer failed:', err.message);
        }
      }
    });

    socket.on('huddle:ice-candidate', async ({ candidate }) => {
      const pc = pcRef.current;
      if (pc && candidate && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch { /* ignore stale */ }
      }
    });

    socket.on('huddle:transcript-chunk', ({ username, text }) => addCaption(username, text));

    socket.on('huddle:peer-ended', () => {
      setPeerConnected(false);
      setStatus('ended');
      loadSummary();
    });

    socket.on('huddle:peer-left', () => {
      setPeerConnected(false);
      setRemoteStream(null);
    });

    socket.on('connect_error', () => setError('Socket connection failed.'));
  }, [id, user, token]); // eslint-disable-line

  const createPeerConnection = () => {
    // Clean up existing connection first
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
    }

    const remote = new MediaStream();

    pc.ontrack = (event) => {
      event.streams[0].getTracks().forEach(track => remote.addTrack(track));
      setRemoteStream(new MediaStream(remote.getTracks()));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit('huddle:ice-candidate', { huddleId: id, candidate: event.candidate });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setStatus('active');
        setPeerConnected(true);
        startSpeechRecognition();
      }
      if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
        setPeerConnected(false);
      }
    };

    return pc;
  };

  const initiateCall = async () => {
    const pc    = createPeerConnection();
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socketRef.current?.emit('huddle:offer', { huddleId: id, offer });
  };

  const handleOffer = async (offer) => {
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socketRef.current?.emit('huddle:answer', { huddleId: id, answer });
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.continuous     = true;
    recognition.interimResults = false;
    recognition.lang           = 'en-US';
    recognitionRef.current     = recognition;
    recognition.onresult = (event) => {
      const text = event.results[event.results.length - 1][0].transcript.trim();
      if (!text) return;
      addCaption(user?.username || 'You', text);
      socketRef.current?.emit('huddle:transcript-chunk', { huddleId: id, text });
      api.post(`/huddles/${id}/transcript`, { text }).catch(() => {});
    };
    recognition.onerror = () => {};
    recognition.start();
  };

  const addCaption = (username, text) => {
    setCaptions(prev => [...prev.slice(-4), { username, text, id: Date.now() }]);
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !audioOn; });
      setAudioOn(a => !a);
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !videoOn; });
      setVideoOn(v => !v);
    }
  };

  const handleEnd = async () => {
    try {
      socketRef.current?.emit('huddle:end', { huddleId: id });
      await api.post(`/huddles/${id}/end`);
      setStatus('ended');
      cleanup(false);
      await loadSummary();
    } catch (err) {
      console.error('End huddle error:', err);
    }
  };

  const loadSummary = async () => {
    try {
      for (let i = 0; i < 10; i++) {
        const res = await api.get(`/huddles/${id}/summary`);
        if (res.data.data.summary?.summary) { setSummary(res.data.data); return; }
        await new Promise(r => setTimeout(r, 2000));
      }
      const res = await api.get(`/huddles/${id}/summary`);
      setSummary(res.data.data);
    } catch { /* silent */ }
  };

  const handlePublish = async () => {
    if (!communityName.trim()) return;
    setPublishing(true);
    try {
      const res = await api.post(`/huddles/${id}/publish`, { communityName: communityName.trim() });
      setPublished(res.data.data.post);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to publish post');
    } finally { setPublishing(false); }
  };

  const cleanup = (stopMedia = true) => {
    if (stopMedia && localStreamRef.current) localStreamRef.current.getTracks().forEach(t => t.stop());
    pcRef.current?.close();
    socketRef.current?.disconnect();
    recognitionRef.current?.stop();
  };

  // ── Ended state ─────────────────────────────────────────────────────────────
  if (status === 'ended') {
    return (
      <div className="min-h-screen bg-veil-dark">
        <Navbar />
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎙️</div>
            <h1 className="text-2xl font-bold text-white mb-1">Huddle Ended</h1>
            <p className="text-gray-400 text-sm">
              {huddle?.duration ? `${Math.round(huddle.duration / 60)}m ${huddle.duration % 60}s` : 'Session complete'}
            </p>
          </div>
          {!summary ? (
            <div className="text-center py-12">
              <div className="animate-spin h-8 w-8 border-t-2 border-veil-purple rounded-full mx-auto mb-4" />
              <p className="text-gray-400 text-sm">AI is analysing your conversation…</p>
            </div>
          ) : (
            <div className="space-y-5">
              {summary.summary?.summary && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-veil-purple">✦</span>
                    <h2 className="text-sm font-semibold text-veil-purple uppercase tracking-wider">AI Summary</h2>
                  </div>
                  <p className="text-gray-200 text-sm leading-relaxed">{summary.summary.summary}</p>
                </div>
              )}
              {summary.summary?.keyMoments?.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">💬 Key Moments</h2>
                  <div className="space-y-2">
                    {summary.summary.keyMoments.map((m, i) => (
                      <p key={i} className="text-xs text-gray-300 border-l-2 border-veil-purple/40 pl-3">{m}</p>
                    ))}
                  </div>
                </div>
              )}
              {summary.summary?.claims?.length > 0 && (
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-3">🧩 Claims Extracted</h2>
                  <div className="space-y-2">
                    {summary.summary.claims.map((c, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-veil-purple shrink-0 mt-0.5">•</span>
                        <div>
                          <span className="text-gray-400 font-medium">{c.speaker}: </span>
                          <span className="text-gray-300">{c.claim}</span>
                          <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${c.strength === 'strong' ? 'bg-green-900/30 text-green-400' : c.strength === 'moderate' ? 'bg-yellow-900/30 text-yellow-400' : 'bg-slate-700 text-gray-400'}`}>{c.strength}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {summary.summary?.generatedPost && !published && (
                <div className="bg-slate-800 border border-veil-purple/30 rounded-xl p-5">
                  <h2 className="text-sm font-semibold text-white mb-1">📝 Generated Post</h2>
                  <p className="text-xs text-gray-400 mb-3">AI wrote a community post from your conversation.</p>
                  <div className="bg-slate-900 rounded-lg p-3 mb-4">
                    <p className="text-sm font-semibold text-white mb-1">{summary.summary.generatedPost.title}</p>
                    <p className="text-xs text-gray-400 line-clamp-3">{summary.summary.generatedPost.content}</p>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Community name (e.g. aitesting)" value={communityName} onChange={e => setCommunityName(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-600 text-white text-sm px-3 py-2 rounded-lg focus:outline-none focus:border-veil-purple" />
                    <button onClick={handlePublish} disabled={publishing || !communityName.trim()}
                      className="px-4 py-2 bg-veil-purple hover:bg-veil-indigo text-white text-sm rounded-lg disabled:opacity-50 transition-colors">
                      {publishing ? 'Publishing…' : 'Publish'}
                    </button>
                  </div>
                </div>
              )}
              {published && (
                <div className="bg-green-900/20 border border-green-700/40 rounded-xl p-4 text-center">
                  <p className="text-green-400 font-semibold text-sm">✓ Post published successfully</p>
                  <button onClick={() => navigate(`/post/${published._id}`)} className="text-xs text-gray-400 hover:text-white mt-1 underline">View post →</button>
                </div>
              )}
              <button onClick={() => navigate('/huddles')} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-gray-300 text-sm rounded-xl transition-colors">
                Back to Huddles
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-t-2 border-veil-purple rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Connecting to huddle…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-veil-dark flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-white font-semibold mb-2">Could not join huddle</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button onClick={() => navigate('/huddles')} className="px-6 py-2 bg-veil-purple text-white rounded-lg text-sm">Back to Huddles</button>
        </div>
      </div>
    );
  }

  // ── Active room ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-white text-sm font-medium">{huddle?.host?.username}'s Huddle</span>
          {huddle?.startedAt && <Timer startedAt={huddle.startedAt} />}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full ${peerConnected ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'}`}>
            {peerConnected ? '● Connected' : '◌ Waiting for peer…'}
          </span>
          <span className="text-xs text-gray-500 bg-slate-800 px-3 py-1 rounded-full font-mono">{huddle?.joinCode}</span>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="grid grid-cols-2 gap-4 max-w-4xl mx-auto">
          <VideoTile stream={localStream} label={`You (${user?.username})`} muted noVideo={!videoOn} />
          <VideoTile stream={remoteStream} label={peerConnected ? (isHostRef.current ? huddle?.guest?.username || 'Peer' : huddle?.host?.username || 'Peer') : 'Waiting…'} noVideo={!remoteStream} />
        </div>
        {captions.length > 0 && (
          <div className="max-w-4xl mx-auto mt-4 space-y-1">
            {captions.map(c => (
              <div key={c.id} className="flex items-start gap-2 text-xs">
                <span className="text-veil-purple font-medium shrink-0">{c.username}:</span>
                <span className="text-gray-300">{c.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-4 py-5 border-t border-slate-800">
        <button onClick={toggleAudio} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${audioOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`} title={audioOn ? 'Mute' : 'Unmute'}>
          {audioOn ? '🎤' : '🔇'}
        </button>
        <button onClick={toggleVideo} className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${videoOn ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}`} title={videoOn ? 'Turn off camera' : 'Turn on camera'}>
          {videoOn ? '📹' : '🚫'}
        </button>
        <button onClick={handleEnd} className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold transition-colors">
          End Huddle
        </button>
      </div>
    </div>
  );
};

export default HuddleRoom;