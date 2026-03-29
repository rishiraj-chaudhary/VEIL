/**
 * HUDDLE AI SERVICE — Phase 11
 * Post-huddle pipeline: transcript → extract claims → summarize → generate post
 * Place at: backend/src/services/huddleAIService.js
 */

import grokService from './grokService.js';

class HuddleAIService {

  /**
   * Full pipeline — runs after huddle ends
   * @param {Array}  transcript  — [{username, text, timestamp}]
   * @param {Object} context     — {topic?, hostUsername, guestUsername, duration}
   */
  async analyseHuddle(transcript, context = {}) {
    if (!transcript || transcript.length === 0) {
      return this._emptyAnalysis();
    }

    const transcriptText = this._formatTranscript(transcript);
    const { hostUsername = 'Host', guestUsername = 'Guest', topic = null, duration = 0 } = context;

    const [summary, claims, generatedPost] = await Promise.all([
      this._summarise(transcriptText, { hostUsername, guestUsername, topic, duration }),
      this._extractClaims(transcriptText, { hostUsername, guestUsername }),
      this._generatePost(transcriptText, { hostUsername, guestUsername, topic }),
    ]);

    return {
      summary,
      claims,
      keyMoments:    this._extractKeyMoments(transcript),
      generatedPost,
      analysedAt:    new Date(),
    };
  }

  // ── Summarise ─────────────────────────────────────────────────────────────────
  async _summarise(transcriptText, { hostUsername, guestUsername, topic, duration }) {
    const prompt = `Summarise this conversation between ${hostUsername} and ${guestUsername}.
${topic ? `Topic: ${topic}` : ''}
Duration: ${Math.round(duration / 60)} minutes

TRANSCRIPT:
${transcriptText.slice(0, 3000)}

Write 2–3 sentences capturing the main points discussed, any agreements reached, and key disagreements.
Plain text only, no bullet points.`;

    try {
      return await grokService.generateFast(prompt, {
        systemRole: 'You are a conversation summariser. Be concise and accurate.',
      });
    } catch {
      return 'Conversation summary unavailable.';
    }
  }

  // ── Extract claims ────────────────────────────────────────────────────────────
  async _extractClaims(transcriptText, { hostUsername, guestUsername }) {
    const prompt = `Extract the main claims or arguments made in this conversation.

TRANSCRIPT:
${transcriptText.slice(0, 3000)}

Return ONLY valid JSON, no preamble:
{
  "claims": [
    {
      "speaker": "${hostUsername} or ${guestUsername}",
      "claim": "the claim text",
      "type": "argument|evidence|opinion|question",
      "strength": "strong|moderate|weak"
    }
  ]
}
Maximum 5 claims. Only include substantive claims, not small talk.`;

    try {
      const raw    = await grokService.generateFast(prompt, {
        systemRole: 'You are a debate analyst. Return only valid JSON.',
      });
      const clean  = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(clean);
      return Array.isArray(parsed.claims) ? parsed.claims.slice(0, 5) : [];
    } catch {
      return [];
    }
  }

  // ── Generate post ─────────────────────────────────────────────────────────────
  async _generatePost(transcriptText, { hostUsername, guestUsername, topic }) {
    const prompt = `Based on this conversation between ${hostUsername} and ${guestUsername}, write a community post.
${topic ? `Topic discussed: ${topic}` : ''}

TRANSCRIPT:
${transcriptText.slice(0, 2000)}

Write a post title (max 100 chars) and content (2–3 paragraphs) that captures the key discussion points.
This will be posted to the community for others to engage with.

Return ONLY valid JSON:
{
  "title": "post title here",
  "content": "post content here"
}`;

    try {
      const raw    = await grokService.generateFast(prompt, {
        systemRole: 'You are a community post writer. Return only valid JSON.',
      });
      const clean  = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      return JSON.parse(clean);
    } catch {
      return { title: topic || 'Huddle Discussion', content: 'A discussion took place in a huddle.' };
    }
  }

  // ── Key moments ───────────────────────────────────────────────────────────────
  _extractKeyMoments(transcript) {
    // Longest utterances are likely the most substantive
    return transcript
      .filter(t => t.text && t.text.split(' ').length > 10)
      .sort((a, b) => b.text.length - a.text.length)
      .slice(0, 3)
      .map(t => `${t.username}: ${t.text.slice(0, 120)}${t.text.length > 120 ? '…' : ''}`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  _formatTranscript(transcript) {
    return transcript
      .map(t => `${t.username}: ${t.text}`)
      .join('\n');
  }

  _emptyAnalysis() {
    return {
      summary:       null,
      claims:        [],
      keyMoments:    [],
      generatedPost: null,
      analysedAt:    new Date(),
    };
  }
}

export default new HuddleAIService();