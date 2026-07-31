/**
 * ONBOARDING
 * Route: /welcome
 *
 * A new account previously landed on an empty feed: no explanation, nothing to
 * do, and no way to reach the part of the product that works. This walks
 * someone into their first scored argument in under a minute, then hands them
 * the daily loop.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import useAuthStore from '../store/authStore';

const TOPICS = [
  'Social media does more harm than good for teenagers',
  'Remote work should be a legal right',
  'AI-generated art is real art',
  'University education should be free',
  'Nuclear power is essential to decarbonisation',
];

const Step = ({ index, current, children }) => (
  <div className={index === current ? 'block' : 'hidden'}>{children}</div>
);

const Welcome = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [topic, setTopic] = useState(TOPICS[0]);
  const [side, setSide] = useState('for');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await api.post('/debates/ai', { topic, side, difficulty: 'balanced' });
      localStorage.setItem('veil_onboarded', '1');
      navigate(`/debates/${res.data.data._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start your first debate.');
      setStarting(false);
    }
  };

  const skip = () => {
    localStorage.setItem('veil_onboarded', '1');
    navigate('/debates');
  };

  return (
    <div className="min-h-screen bg-veil-dark flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-veil-purple' : 'bg-slate-800'}`}
            />
          ))}
        </div>

        <Step index={0} current={step}>
          <h1 className="text-3xl font-bold text-white mb-3">
            Welcome{user?.username ? `, ${user.username}` : ''}.
          </h1>
          <p className="text-slate-400 mb-2">
            VEIL scores how well you argue — not whether people agree with you.
          </p>
          <p className="text-slate-400 mb-8">
            Every claim you make is stored. When someone challenges it later, how it holds up
            becomes part of your record. That record is the point.
          </p>
          <button
            onClick={() => setStep(1)}
            className="w-full py-3 bg-veil-purple hover:bg-veil-indigo text-veil-on-accent rounded-lg font-semibold"
          >
            Make your first argument
          </button>
          <button onClick={skip} className="w-full py-3 text-slate-500 hover:text-slate-300 text-sm mt-2">
            Skip for now
          </button>
        </Step>

        <Step index={1} current={step}>
          <h2 className="text-2xl font-bold text-white mb-2">Pick something to argue</h2>
          <p className="text-slate-400 text-sm mb-5">
            You'll debate the AI, so there's no waiting for an opponent.
          </p>

          <div className="space-y-2 mb-6">
            {TOPICS.map(t => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors ${
                  topic === t
                    ? 'border-veil-purple bg-veil-purple/10 text-white'
                    : 'border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep(0)} className="px-5 py-3 text-slate-400 hover:text-white text-sm">
              Back
            </button>
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 bg-veil-purple hover:bg-veil-indigo text-veil-on-accent rounded-lg font-semibold"
            >
              Continue
            </button>
          </div>
        </Step>

        <Step index={2} current={step}>
          <h2 className="text-2xl font-bold text-white mb-2">Which side?</h2>
          <p className="text-slate-400 text-sm mb-1">"{topic}"</p>
          <p className="text-slate-500 text-xs mb-5">
            Arguing the side you disagree with is the better workout.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {['for', 'against'].map(s => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`py-4 rounded-lg border capitalize font-medium transition-colors ${
                  side === s
                    ? 'border-veil-purple bg-veil-purple/10 text-white'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {error && <p className="text-rose-400 text-sm mb-3">{error}</p>}

          <div className="flex gap-2">
            <button onClick={() => setStep(1)} className="px-5 py-3 text-slate-400 hover:text-white text-sm">
              Back
            </button>
            <button
              onClick={start}
              disabled={starting}
              className="flex-1 py-3 bg-veil-purple hover:bg-veil-indigo disabled:opacity-50 text-veil-on-accent rounded-lg font-semibold"
            >
              {starting ? 'Setting up…' : 'Start debating'}
            </button>
          </div>
        </Step>
      </div>
    </div>
  );
};

export default Welcome;
