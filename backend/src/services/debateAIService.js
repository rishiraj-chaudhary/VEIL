import grokService from './grokService.js';

class DebateAIService {
  /**
   * Analyze a debate turn with AI
   */
  async analyzeTurn(content, side, previousTurns = []) {
    try {
      console.log(`🤖 Analyzing turn for side '${side}'`);

      // Build context from previous turns
      const context = this.buildTurnContext(previousTurns);

      // Run parallel analysis
      const [claims, rebuttals, fallacies, toneScore, clarityScore, evidenceScore] = await Promise.all([
        this.extractClaims(content, context),
        this.extractRebuttals(content, context),
        this.detectFallacies(content),
        this.analyzeTone(content),
        this.analyzeClarity(content),
        this.analyzeEvidence(content)
      ]);

      // Calculate overall quality
      const overallQuality = Math.round(
        (toneScore * 0.2) +
        (clarityScore * 0.3) +
        (evidenceScore * 0.3) +
        (Math.min(100, claims.length * 10) * 0.2)
      );

      return {
        claims,
        rebuttals,
        fallacies,
        toneScore,
        clarityScore,
        evidenceQuality: evidenceScore,
        overallQuality
      };
    } catch (error) {
      console.error('❌ Turn analysis error:', error);
      // Return neutral scores on error
      return {
        claims: [],
        rebuttals: [],
        fallacies: [],
        toneScore: 50,
        clarityScore: 50,
        evidenceQuality: 50,
        overallQuality: 50
      };
    }
  }

  /**
   * Build context from previous turns
   */
  buildTurnContext(previousTurns) {
    if (previousTurns.length === 0) return '';

    const contextText = previousTurns
      .map(turn => `[${turn.side.toUpperCase()}]: ${turn.content}`)
      .join('\n\n');

    return contextText;
  }

  /**
   * Extract claims from argument
   */
  async extractClaims(content, context) {
    try {
      const prompt = `Extract the main claims from this debate argument. Return ONLY a JSON array of strings.

${context ? `Previous context:\n${context}\n\n` : ''}Current argument:
${content}

Return format: ["claim 1", "claim 2", "claim 3"]`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.3
      });

      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const claims = JSON.parse(cleanResponse);

      return Array.isArray(claims) ? claims.slice(0, 5) : [];
    } catch (error) {
      console.error('Claim extraction error:', error);
      return [];
    }
  }

  /**
   * Extract rebuttals from argument
   */
  async extractRebuttals(content, context) {
    try {
      if (!context) return []; // No rebuttals in first turn

      const prompt = `Identify which previous points this argument is rebutting. Return ONLY a JSON array of strings.

Previous arguments:
${context}

Current rebuttal:
${content}

Return format: ["rebuttal to X", "counter to Y"]`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.3
      });

      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const rebuttals = JSON.parse(cleanResponse);

      return Array.isArray(rebuttals) ? rebuttals.slice(0, 5) : [];
    } catch (error) {
      console.error('Rebuttal extraction error:', error);
      return [];
    }
  }

  /**
   * Detect logical fallacies
   */
  async detectFallacies(content) {
    try {
      const prompt = `Analyze this debate argument for logical fallacies. Return ONLY a JSON array.

Argument:
${content}

Return format: [
  {"type": "ad hominem", "explanation": "attacks person not argument", "severity": 7}
]

Common fallacies: ad hominem, straw man, false dilemma, slippery slope, appeal to emotion, appeal to authority, hasty generalization, circular reasoning`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.2
      });

      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const fallacies = JSON.parse(cleanResponse);

      return Array.isArray(fallacies) ? fallacies.slice(0, 3) : [];
    } catch (error) {
      console.error('Fallacy detection error:', error);
      return [];
    }
  }

  /**
   * Analyze tone (professional, respectful)
   */
  async analyzeTone(content) {
    try {
      const prompt = `Rate the tone of this debate argument on professionalism and respectfulness.

Argument:
${content}

Return ONLY a JSON object with score 0-100:
{"score": 85, "reasoning": "Professional and respectful"}`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.2
      });

      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanResponse);

      return Math.max(0, Math.min(100, result.score || 50));
    } catch (error) {
      console.error('Tone analysis error:', error);
      return 50;
    }
  }

  /**
   * Analyze clarity (structure, readability)
   */
  async analyzeClarity(content) {
    try {
      const prompt = `Rate the clarity of this debate argument (structure, readability, coherence).

Argument:
${content}

Return ONLY a JSON object with score 0-100:
{"score": 75, "reasoning": "Clear structure but some verbose sections"}`;

      const response = await grokService.generateFast(prompt, {
        temperature: 0.2
      });

      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanResponse);

      return Math.max(0, Math.min(100, result.score || 50));
    } catch (error) {
      console.error('Clarity analysis error:', error);
      return 50;
    }
  }

  /**
   * Analyze evidence quality
   */
  async analyzeEvidence(content) {
    try {
      // Check for evidence indicators
      const evidenceIndicators = [
        'study', 'research', 'data', 'statistics', 'source',
        'according to', 'shows that', 'evidence', 'proven',
        'report', 'analysis', 'survey', 'experiment'
      ];

      const lowerContent = content.toLowerCase();
      const indicatorCount = evidenceIndicators.filter(
        indicator => lowerContent.includes(indicator)
      ).length;

      // Base score on indicator presence
      const baseScore = Math.min(100, 30 + (indicatorCount * 15));

      return baseScore;
    } catch (error) {
      console.error('Evidence analysis error:', error);
      return 50;
    }
  }

  /**
   * Generate debate summary
   */
  async generateDebateSummary(debateId, forTurns, againstTurns) {
    try {
      const forContent = forTurns.map(t => t.content).join('\n\n');
      const againstContent = againstTurns.map(t => t.content).join('\n\n');

      const prompt = `Provide a 3-paragraph summary of this debate analyzing both sides' performance.

FOR side arguments:
${forContent.substring(0, 1500)}

AGAINST side arguments:
${againstContent.substring(0, 1500)}

Include: 1) Main arguments, 2) Strongest points, 3) Weaknesses`;

      const summary = await grokService.generateSmart(prompt, {
        temperature: 0.5
      });

      return summary.trim();
    } catch (error) {
      console.error('Summary generation error:', error);
      return 'Summary generation failed';
    }
  }

  /**
   * Provide debate coaching suggestions
   */
  async getCoachingSuggestions(userId, recentDebates) {
    try {
      // Analyze user's performance patterns
      const strengths = [];
      const improvements = [];

      // This would analyze user's historical performance
      // For now, return generic suggestions

      return {
        strengths: ['Clear communication', 'Good evidence usage'],
        improvements: ['Work on rebuttals', 'Address opposing claims more directly'],
        overallRating: 75
      };
    } catch (error) {
      console.error('Coaching suggestions error:', error);
      return null;
    }
  }

  /**
   * Check if Grok AI is available
   */
  isReady() {
    return grokService.isReady();
  }
}

const debateAIService = new DebateAIService();
export default debateAIService;