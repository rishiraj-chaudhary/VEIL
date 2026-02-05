import factCheckService from './factCheckService.js';
import grokService from './grokService.js';
import knowledgeGraphService from './knowledgeGraphService.js';
import vectorStoreService from './vectorStoreService.js';

/**
 * DEBATE AI SERVICE with RAG (Phase 2 - ChromaDB)
 * 
 * ENHANCED WITH:
 * - ChromaDB vector store integration
 * - Knowledge base retrieval (fallacies, techniques)
 * - Debate memory (learns from past debates)
 * - Evidence verification
 * - Explainable outputs with source attribution
 * - ROBUST FALLACY DETECTION (Pattern-based)
 * - IMPROVED SCORING ALGORITHMS
 * 
 * This is NOT a chatbot. This is an AI JUDGE with MEMORY.
 */
class DebateAIService {
  constructor() {
    this.vectorStore = null;
    this.useRAG = false;
  }

  /**
   * Initialize RAG system
   */
  async initializeRAG() {
    try {
      console.log('🤖 Initializing Debate AI with RAG...');
      
      await vectorStoreService.initialize();
      this.vectorStore = vectorStoreService;
      
      const stats = await vectorStoreService.getStats();
      this.useRAG = stats.initialized && stats.hasKnowledgeStore;
      
      if (this.useRAG) {
        console.log('✅ RAG enabled for debate analysis');
        console.log(`   Knowledge items: ${stats.knowledgeCount}`);
        console.log(`   Memory items: ${stats.memoryCount}`);
      } else {
        console.log('⚠️  RAG disabled - running without retrieval');
      }
    } catch (error) {
      console.error('❌ RAG initialization error:', error.message);
      this.useRAG = false;
    }
  }

  /**
   * MAIN ANALYSIS METHOD with RAG
   */
  async analyzeTurn(content, side, previousTurns = []) {
    try {
      console.log(`🤖 Analyzing turn for side '${side}' (RAG: ${this.useRAG})`);

      const context = this.buildTurnContext(previousTurns);
      const decisionTrace = [];

      // ✨ PHASE 2: Retrieve relevant knowledge
      const retrievedKnowledge = this.useRAG 
        ? await this.retrieveRelevantKnowledge(content, context, decisionTrace)
        : { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] };

      // Run parallel analysis with retrieved context
      const fallacies = await this.detectFallacies(content, retrievedKnowledge, decisionTrace);

      const [claims, rebuttals, toneScore, clarityScore, evidenceAnalysis] = await Promise.all([
        this.extractClaims(content, context, retrievedKnowledge, decisionTrace),
        this.extractRebuttals(content, context, retrievedKnowledge, decisionTrace),
        this.analyzeTone(content, fallacies, decisionTrace),  // ← Now fallacies exists!
        this.analyzeClarity(content, [], decisionTrace),  // ← Will get claims later
        this.analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace)
      ]);

      // Fact-check with RAG
      let factCheckResult = null;
      if (this.useRAG) {
        try {
          factCheckResult = await factCheckService.checkText(content, {
            sources: ['knowledge'],
            topK: 3
          });

          if (factCheckResult.flags.length > 0) {
            decisionTrace.push(`⚠️ ${factCheckResult.flags.length} claim(s) lack supporting patterns`);
          } else if (factCheckResult.checks.length > 0) {
            decisionTrace.push(`✓ Claims match knowledge patterns (${factCheckResult.overallConfidence}% confidence)`);
          }
        } catch (error) {
          console.error('Fact check error:', error.message);
        }
      }

      // Calculate overall quality
      const overallQuality = this.calculateOverallQuality(
        toneScore,
        clarityScore,
        evidenceAnalysis.score,
        fallacies.length,
        claims.length,
        decisionTrace
      );

      return {
        claims,
        rebuttals,
        fallacies,
        toneScore,
        clarityScore,
        evidenceQuality: evidenceAnalysis.score,
        evidenceAnalysis,
        overallQuality,
        decisionTrace,
        retrievedSources: retrievedKnowledge.sources,
        factCheck: factCheckResult
      };

    } catch (error) {
      console.error('❌ Turn analysis error:', error);
      return {
        claims: [],
        rebuttals: [],
        fallacies: [],
        toneScore: 50,
        clarityScore: 50,
        evidenceQuality: 50,
        evidenceAnalysis: { hasEvidence: false, verified: false, score: 50 },
        overallQuality: 50,
        decisionTrace: ['Error during analysis - using default scores'],
        retrievedSources: []
      };
    }
  }
  /**
 * Process claims and add to knowledge graph
 */
async processClaimsForGraph(claims, turn, debate, qualityScore) {
  if (!claims || claims.length === 0) return;

  try {
    console.log(`📊 Processing ${claims.length} claims for knowledge graph...`);

    for (const claimText of claims) {
      if (claimText && claimText.trim().length > 10) {
        await knowledgeGraphService.addClaim(
          claimText,
          debate._id || debate,
          turn._id || turn,
          turn.side,
          qualityScore
        );
      }
    }

    console.log(`✅ Claims added to knowledge graph`);
  } catch (error) {
    console.error('❌ Error processing claims for graph:', error);
  }
}

  /**
   * PHASE 2: Retrieve relevant knowledge from ChromaDB
   */
  async retrieveRelevantKnowledge(content, context, decisionTrace) {
    if (!this.useRAG || !this.vectorStore) {
      return { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] };
    }

    try {
      // Retrieve from knowledge base
      const knowledgeDocs = await this.vectorStore.retrieveKnowledge(content, 3);
      
      // Retrieve from debate memory
      const memoryDocs = await this.vectorStore.retrieveDebateMemory(content, 2);

      const allDocs = [...knowledgeDocs, ...memoryDocs];
      
      if (allDocs.length > 0) {
        decisionTrace.push(`🔍 Retrieved ${allDocs.length} documents (${knowledgeDocs.length} knowledge, ${memoryDocs.length} memory)`);
      } else {
        decisionTrace.push('🔍 No relevant documents found');
      }

      // Build context from retrieved docs
      const retrievedContext = allDocs
        .map(doc => doc.content)
        .join('\n\n');

      const sources = allDocs.map(doc => {
        if (doc.metadata?.category && doc.metadata?.type) {
          return `${doc.metadata.category}:${doc.metadata.type}`;
        }
        return 'memory';
      });

      return {
        sources,
        context: retrievedContext,
        knowledgeDocs,
        memoryDocs
      };

    } catch (error) {
      console.error('Knowledge retrieval error:', error);
      decisionTrace.push('⚠️ Knowledge retrieval failed');
      return { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] };
    }
  }

  /**
   * ========================================
   * FIX 1: ROBUST FALLACY DETECTION
   * ========================================
   */
  async detectFallacies(turnContent, retrievedKnowledge, decisionTrace) {
    try {
      console.log('🎯 Detecting fallacies...');
      
      // PATTERN-BASED DETECTION (Fast, reliable, no LLM needed)
      const fallacies = this.detectFallaciesPattern(turnContent);
      
      if (fallacies.length > 0) {
        decisionTrace.push(`⚠️ Detected ${fallacies.length} fallacies: ${fallacies.map(f => f.type).join(', ')}`);
      } else {
        decisionTrace.push('✓ No fallacies detected');
      }
      
      console.log(`✅ Detected ${fallacies.length} fallacies via pattern matching`);
      return fallacies;
      
    } catch (error) {
      console.error('❌ Fallacy detection error:', error.message);
      decisionTrace.push('⚠️ Fallacy detection failed');
      return [];
    }
  }

  /**
   * Pattern-based fallacy detection (no LLM, always works)
   */
  detectFallaciesPattern(text) {
    const fallacies = [];
    const textLower = text.toLowerCase();
    
    // Ad Hominem - Personal attacks
    const adHominemPatterns = [
      /\b(you are|you're) (stupid|dumb|idiot|ignorant|fool|moron)\b/i,
      /\byou (clearly )?don't (understand|know)\b/i,
      /\byou (have no|lack) (idea|knowledge|understanding)\b/i,
      /\bonly an? (idiot|fool|moron) would\b/i
    ];
    
    if (adHominemPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'ad hominem',
        explanation: 'Attacks the person rather than addressing their argument',
        severity: 8
      });
    }
    
    // Straw Man - Misrepresenting opponent's position
    const strawManPatterns = [
      /\bso you're saying\b/i,
      /\bwhat you really mean is\b/i,
      /\bin other words, you believe\b/i
    ];
    
    if (strawManPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'straw man',
        explanation: 'Potentially misrepresenting the opponent\'s position',
        severity: 6
      });
    }
    
    // Appeal to Emotion
    const emotionPatterns = [
      /\bthink (of|about) the children\b/i,
      /\bwon't someone\b/i,
      /\bhow can you\b.*\b(sleep|live)\b/i,
      /\bshame on you\b/i
    ];
    
    if (emotionPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'appeal to emotion',
        explanation: 'Uses emotional manipulation rather than logical reasoning',
        severity: 5
      });
    }
    
    // Hasty Generalization - Absolute language
    const absoluteCount = (text.match(/\b(all|every|everyone|nobody|no one|none|always|never)\b/gi) || []).length;
    
    if (absoluteCount >= 3) {
      fallacies.push({
        type: 'hasty generalization',
        explanation: 'Uses absolute language without sufficient evidence',
        severity: 4
      });
    }
    
    // False Dilemma - Either/or thinking
    const dilemmaPatterns = [
      /\beither .+ or .+\b/i,
      /\byou('re| are) (either )?with (us|me) or against (us|me)\b/i,
      /\bonly two (options|choices|possibilities)\b/i
    ];
    
    if (dilemmaPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'false dilemma',
        explanation: 'Presents limited options when more alternatives exist',
        severity: 5
      });
    }
    
    // Appeal to Authority - Inappropriate authority
    const authorityPatterns = [
      /\bexperts? (say|agree|believe|think)\b/i,
      /\bstudies show\b/i,
      /\beveryone knows\b/i,
      /\bit('s| is) common knowledge\b/i
    ];
    
    // Only flag if no actual evidence provided
    if (authorityPatterns.some(pattern => pattern.test(text)) && 
        !this.detectEvidenceIndicators(text)) {
      fallacies.push({
        type: 'appeal to authority',
        explanation: 'Claims authority without providing specific sources',
        severity: 4
      });
    }
    
    // Slippery Slope
    const slopePatterns = [
      /\bif .+ then .+ then .+ then\b/i,
      /\bthis will lead to\b/i,
      /\bnext thing you know\b/i,
      /\bwhere (does|will) it (end|stop)\b/i
    ];
    
    if (slopePatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'slippery slope',
        explanation: 'Assumes a chain of events without demonstrating causation',
        severity: 5
      });
    }
    
    // Red Herring - Off-topic distraction
    const herringPatterns = [
      /\bbut what about\b/i,
      /\bthe real issue is\b/i,
      /\blet's talk about\b/i
    ];
    
    if (herringPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'red herring',
        explanation: 'May be diverting from the main topic',
        severity: 4
      });
    }
    
    // Circular Reasoning
    const circularPatterns = [
      /\bbecause (it is|that's how)\b/i,
      /\bit('s| is) true because (it('s| is) true|I (say|said) so)\b/i
    ];
    
    if (circularPatterns.some(pattern => pattern.test(text))) {
      fallacies.push({
        type: 'circular reasoning',
        explanation: 'Uses the conclusion as a premise',
        severity: 6
      });
    }
    
    // Limit to top 3 by severity
    return fallacies
      .sort((a, b) => b.severity - a.severity)
      .slice(0, 3);
  }

  /**
   * ========================================
   * FIX 3: IMPROVED SCORING LOGIC
   * ========================================
   */

  /**
   * Calculate tone score (0-100)
   * Based on: professionalism, respect, absence of attacks
   */
  async analyzeTone(content, fallacies, decisionTrace) {
    let score = 100;
    
    // Deduct for fallacies
    const adHominem = fallacies.filter(f => f.type === 'ad hominem');
    const appealEmotion = fallacies.filter(f => f.type === 'appeal to emotion');
    
    score -= adHominem.length * 25; // Heavy penalty for personal attacks
    score -= appealEmotion.length * 15; // Medium penalty for emotional manipulation
    score -= (fallacies.length - adHominem.length - appealEmotion.length) * 5; // Light penalty for other fallacies
    
    // Deduct for aggressive language
    const aggressiveWords = [
      'stupid', 'idiot', 'dumb', 'fool', 'moron', 'ignorant',
      'ridiculous', 'absurd', 'nonsense', 'joke', 'pathetic'
    ];
    
    const contentLower = content.toLowerCase();
    const aggressiveCount = aggressiveWords.filter(word => 
      contentLower.includes(word)
    ).length;
    
    score -= aggressiveCount * 10;
    
    // Bonus for respectful language
    const respectfulPhrases = [
      'i understand', 'you make a good point', 'while i disagree',
      'i respect', 'let me clarify', 'to be fair', 'you\'re right that'
    ];
    
    const respectfulCount = respectfulPhrases.filter(phrase =>
      contentLower.includes(phrase)
    ).length;
    
    score += respectfulCount * 5;
    
    score = Math.max(0, Math.min(100, score));
    
    decisionTrace.push(`Tone: ${score}/100 (${adHominem.length} attacks, ${aggressiveCount} aggressive words, ${respectfulCount} respectful phrases)`);
    
    return score;
  }

  /**
   * Calculate clarity score (0-100)
   * Based on: structure, readability, coherence
   */
  async analyzeClarity(content, claims, decisionTrace) {
    let score = 50; // Start at median
    
    const words = content.trim().split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    
    // Average sentence length (ideal: 15-25 words)
    const avgSentenceLength = words / Math.max(1, sentences);
    
    if (avgSentenceLength >= 15 && avgSentenceLength <= 25) {
      score += 15; // Good sentence length
    } else if (avgSentenceLength > 40) {
      score -= 15; // Too long
    } else if (avgSentenceLength < 10) {
      score -= 10; // Too short
    }
    
    // Paragraph structure
    const hasStructure = content.includes('\n\n') || content.includes('\n');
    if (hasStructure && words > 100) {
      score += 10;
    }
    
    // Multiple sentences
    if (sentences >= 3) {
      score += 10;
    } else if (sentences === 1 && words > 50) {
      score -= 15;
    }
    
    // Claims identified
    if (claims && claims.length > 0) {
      score += Math.min(20, claims.length * 5);
    }
    
    // Transition words
    const transitions = [
      'however', 'therefore', 'furthermore', 'moreover', 'additionally',
      'consequently', 'nevertheless', 'thus', 'hence', 'indeed'
    ];
    
    const transitionCount = transitions.filter(word =>
      content.toLowerCase().includes(word)
    ).length;
    
    score += Math.min(15, transitionCount * 5);
    
    score = Math.max(0, Math.min(100, score));
    
    decisionTrace.push(`Clarity: ${score}/100 (${sentences} sentences, avg ${avgSentenceLength.toFixed(1)} words, ${transitionCount} transitions)`);
    
    return score;
  }

  /**
   * Calculate evidence quality score (0-100)
   * Based on: presence, strength, and specificity of evidence
   */
  async analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace) {
    let score = 0;
    
    // Strong evidence indicators
    const strongIndicators = [
      'peer-reviewed', 'published study', 'research shows', 'data indicates',
      'according to', 'study found', 'statistics show', 'meta-analysis'
    ];
    
    // Medium evidence indicators
    const mediumIndicators = [
      'research', 'study', 'data', 'statistics', 'evidence',
      'report', 'survey', 'analysis', 'findings'
    ];
    
    // Weak evidence indicators
    const weakIndicators = [
      'i believe', 'in my opinion', 'it seems', 'probably',
      'might', 'could', 'perhaps', 'maybe'
    ];
    
    const contentLower = content.toLowerCase();
    
    // Count indicators
    const strongCount = strongIndicators.filter(ind => contentLower.includes(ind)).length;
    const mediumCount = mediumIndicators.filter(ind => contentLower.includes(ind)).length;
    const weakCount = weakIndicators.filter(ind => contentLower.includes(ind)).length;
    
    // Calculate score
    score += strongCount * 30;
    score += mediumCount * 15;
    score -= weakCount * 5;
    
    // Bonus for numbers/data
    const hasNumbers = /\d+%|\d+\.\d+|\d+ (percent|people|cases|studies)/.test(content);
    if (hasNumbers) {
      score += 15;
    }
    
    // Bonus for citations
    const hasCitation = /\([A-Z][a-z]+ \d{4}\)|\[?\d+\]?|et al\./.test(content);
    if (hasCitation) {
      score += 20;
    }
    
    // Penalty for pure opinion
    if (weakCount > strongCount + mediumCount && !hasNumbers) {
      score -= 20;
    }

    // PHASE 2: Verify against retrieved knowledge
    let verified = false;
    if (this.useRAG && retrievedKnowledge.knowledgeDocs.length > 0) {
      const hasStrongEvidence = retrievedKnowledge.knowledgeDocs.some(
        doc => doc.metadata?.type === 'strong_evidence'
      );
      
      if (hasStrongEvidence) {
        verified = true;
        score += 10;
        decisionTrace.push(`✓ Evidence patterns match knowledge base`);
      } else if (strongCount + mediumCount > 0) {
        decisionTrace.push(`⚠️ Evidence claims not strongly supported by knowledge base`);
      }
    }

    const hasEvidence = strongCount + mediumCount > 0;
    
    score = Math.max(0, Math.min(100, score));
    
    decisionTrace.push(`Evidence: ${score}/100 (${strongCount} strong, ${mediumCount} medium, ${hasNumbers ? 'has data' : 'no data'}, ${hasCitation ? 'cited' : 'uncited'})`);

    return {
      hasEvidence,
      verified,
      score,
      indicatorCount: strongCount + mediumCount,
      sources: retrievedKnowledge.sources
    };
  }

  /**
   * Calculate overall quality (0-100)
   * Weighted combination of all factors
   */
  calculateOverallQuality(toneScore, clarityScore, evidenceScore, fallacyCount, claimCount, decisionTrace) {
    // Weighted average
    const weighted = (
      toneScore * 0.25 +           // 25% tone
      clarityScore * 0.25 +         // 25% clarity
      evidenceScore * 0.30 +        // 30% evidence (most important)
      (claimCount > 0 ? 100 : 50) * 0.10 +  // 10% has claims
      (fallacyCount === 0 ? 100 : Math.max(0, 100 - fallacyCount * 20)) * 0.10  // 10% no fallacies
    );
    
    const score = Math.round(weighted);
    
    decisionTrace.push(`Overall Quality: ${score}/100 (weighted: 30% evidence, 25% clarity, 25% tone, 10% claims, 10% fallacies)`);
    
    return score;
  }

  /**
   * ========================================
   * HELPER METHODS
   * ========================================
   */

  /**
   * Detect evidence indicators (used by fallacy detection)
   */
  detectEvidenceIndicators(text) {
    const indicators = [
      'study', 'research', 'data', 'statistics', 'source',
      'according to', 'shows that', 'evidence', 'proven',
      'report', 'analysis', 'survey', 'experiment', 'found that',
      'peer-reviewed', 'journal', 'published'
    ];

    const textLower = text.toLowerCase();
    return indicators.some(indicator => textLower.includes(indicator));
  }

  buildTurnContext(previousTurns) {
    if (previousTurns.length === 0) return '';
    return previousTurns
      .map(turn => `[${turn.side.toUpperCase()}]: ${turn.content}`)
      .join('\n\n');
  }

  async extractClaims(content, context, retrievedKnowledge, decisionTrace) {
    try {
      const ragContext = retrievedKnowledge.context 
        ? `\n\nRelevant knowledge:\n${retrievedKnowledge.context.substring(0, 500)}`
        : '';

      const prompt = `Extract main claims from this debate argument. Return ONLY a JSON array of strings.

${context ? `Previous context:\n${context}\n\n` : ''}Current argument:
${content}${ragContext}

Return format: ["claim 1", "claim 2"]`;

      const response = await grokService.generateFast(prompt, { temperature: 0.3 });
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const claims = JSON.parse(cleanResponse);

      const claimArray = Array.isArray(claims) ? claims.slice(0, 5) : [];
      decisionTrace.push(`Extracted ${claimArray.length} claims`);
      
      return claimArray;
    } catch (error) {
      console.error('Claim extraction error:', error);
      decisionTrace.push('Claim extraction failed');
      return [];
    }
  }

  async extractRebuttals(content, context, retrievedKnowledge, decisionTrace) {
    try {
      if (!context) {
        decisionTrace.push('No previous turns - no rebuttals possible');
        return [];
      }

      const ragContext = retrievedKnowledge.context 
        ? `\n\nRelevant knowledge:\n${retrievedKnowledge.context.substring(0, 500)}`
        : '';

      const prompt = `Identify which previous points this argument is rebutting. Return ONLY a JSON array.

Previous arguments:
${context}

Current rebuttal:
${content}${ragContext}

Return format: ["rebuttal to X", "counter to Y"]`;

      const response = await grokService.generateFast(prompt, { temperature: 0.3 });
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const rebuttals = JSON.parse(cleanResponse);

      const rebuttalArray = Array.isArray(rebuttals) ? rebuttals.slice(0, 5) : [];
      decisionTrace.push(`Found ${rebuttalArray.length} rebuttals`);
      
      return rebuttalArray;
    } catch (error) {
      console.error('Rebuttal extraction error:', error);
      decisionTrace.push('Rebuttal extraction failed');
      return [];
    }
  }

  async generateDebateSummary(debateId, forTurns, againstTurns) {
    try {
      const forContent = forTurns.map(t => t.content).join('\n\n');
      const againstContent = againstTurns.map(t => t.content).join('\n\n');

      const prompt = `Provide 3-paragraph summary analyzing both sides' performance.

FOR side:
${forContent.substring(0, 1500)}

AGAINST side:
${againstContent.substring(0, 1500)}

Include: 1) Main arguments, 2) Strongest points, 3) Weaknesses`;

      const summary = await grokService.generateSmart(prompt, { temperature: 0.5 });
      return summary.trim();
      
    } catch (error) {
      console.error('Summary generation error:', error);
      return 'Summary generation failed';
    }
  }

  /**
   * Store turn in debate memory (ChromaDB)
   */
  async storeInMemory(turn, debate) {
    if (this.useRAG && this.vectorStore) {
      try {
        await this.vectorStore.addToMemory(turn, debate);
      } catch (error) {
        console.error('Store in memory error:', error.message);
      }
    }
  }

  isReady() {
    return grokService.isReady();
  }
}

const debateAIService = new DebateAIService();
export default debateAIService;