import debateTurnGraph from './graph/debateTurnGraph.js';
import fallacyGraph from './graph/fallacyGraph.js';
import grokService from './grokService.js';
import knowledgeGraphService from './knowledgeGraphService.js';
import structuredParserService from './structuredParserService.js';
import vectorStoreService from './vectorStoreService.js';
/**
 * 
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
 * - ✅ AI COST TRACKING (New!)
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

      // ← NEW: wire graph to the same vector store
      debateTurnGraph.setVectorStore(vectorStoreService, false);

      const stats = await vectorStoreService.getStats();
      this.useRAG = stats.initialized && stats.hasKnowledgeStore;

      // ← NEW: update graph with final useRAG value
      debateTurnGraph.setVectorStore(vectorStoreService, this.useRAG);

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
   * ✅ MAIN ANALYSIS METHOD with RAG + COST TRACKING
   */
  async analyzeTurn(content, side, previousTurns = [], userId = null, debateId = null, userTier = 'free') {
    console.log(`🤖 DebateTurnGraph: analyzing turn for side '${side}'`);

    return await debateTurnGraph.run(
      content,
      side,
      previousTurns,
      userId,
      debateId,
      userTier
    );
  }


/**
 * Process claims and add to knowledge graph
 */
async processClaimsForGraph_REPLACEMENT(claims, turn, debate, qualityScore, userId = null) {
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
          qualityScore,
          userId   // ← NEW: pass userId for persona metadata
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
  /**
 * Retrieve relevant knowledge using LangChain
 */
async retrieveRelevantKnowledge(content, context, decisionTrace) {
  if (!this.useRAG || !this.vectorStore) {
    return { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] };
  }

  try {
    // Use LangChain retriever.invoke() - NO MANUAL SIMILARITY
    const knowledgeDocs = await this.vectorStore.retrieveKnowledgeReranked(content, 3, context) || [];
    const memoryDocs = await this.vectorStore.retrieveDebateMemoryReranked(content, 2, {}, context) || [];
    const allDocs = [...knowledgeDocs, ...memoryDocs];
    
    if (allDocs.length > 0) {
      decisionTrace.push(`🧠 Full pipeline retrieved ${allDocs.length} docs (vector→BM25→LLM rerank, ${knowledgeDocs.length} knowledge, ${memoryDocs.length} memory)`);
    } else {
      decisionTrace.push('🔍 No relevant documents found');
    }

    const retrievedContext = allDocs
      .map(doc => doc?.content || doc?.text || '')
      .filter(Boolean)
      .join('\n\n');

    const sources = allDocs
      .map(doc => {
        if (doc?.metadata?.category && doc?.metadata?.type) {
          return `${doc.metadata.category}:${doc.metadata.type}`;
        }
        return 'memory';
      })
      .filter(Boolean);

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
   * ROBUST FALLACY DETECTION
   * ========================================
   */
  async detectFallacies(content, retrievedKnowledge, decisionTrace, options = {}) {
  try {
    console.log('🎯 Detecting fallacies (hybrid LLM graph)...');

    const fallacies = await fallacyGraph.detect(content, {
      context: options.context || '',
      side: options.side || 'for',
      round: options.round || 1,
      userTier: options.userTier || 'free',
      aiContext: options.aiContext || {},
      retrievedKnowledge: retrievedKnowledge.knowledgeDocs || [],
    });

    if (fallacies.length > 0) {
      decisionTrace.push(`⚠️ Detected ${fallacies.length} fallacies: ${fallacies.map(f => `${f.type} (${f.detectionMethod}, conf:${f.confidence.toFixed(2)})`).join(', ')}`);
    } else {
      decisionTrace.push('✓ No fallacies detected');
    }

    console.log(`✅ Fallacy graph complete: ${fallacies.length} found`);
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
   * IMPROVED SCORING LOGIC
   * ========================================
   */

  /**
   * Calculate tone score (0-100)
   */
  async analyzeTone(content, fallacies, decisionTrace) {
    let score = 100;
    
    const adHominem = fallacies.filter(f => f.type === 'ad hominem');
    const appealEmotion = fallacies.filter(f => f.type === 'appeal to emotion');
    
    score -= adHominem.length * 25;
    score -= appealEmotion.length * 15;
    score -= (fallacies.length - adHominem.length - appealEmotion.length) * 5;
    
    const aggressiveWords = [
      'stupid', 'idiot', 'dumb', 'fool', 'moron', 'ignorant',
      'ridiculous', 'absurd', 'nonsense', 'joke', 'pathetic'
    ];
    
    const contentLower = content.toLowerCase();
    const aggressiveCount = aggressiveWords.filter(word => 
      contentLower.includes(word)
    ).length;
    
    score -= aggressiveCount * 10;
    
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
   */
  async analyzeClarity(content, claims, decisionTrace) {
    let score = 50;
    
    const words = content.trim().split(/\s+/).length;
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
    
    const avgSentenceLength = words / Math.max(1, sentences);
    
    if (avgSentenceLength >= 15 && avgSentenceLength <= 25) {
      score += 15;
    } else if (avgSentenceLength > 40) {
      score -= 15;
    } else if (avgSentenceLength < 10) {
      score -= 10;
    }
    
    const hasStructure = content.includes('\n\n') || content.includes('\n');
    if (hasStructure && words > 100) {
      score += 10;
    }
    
    if (sentences >= 3) {
      score += 10;
    } else if (sentences === 1 && words > 50) {
      score -= 15;
    }
    
    if (claims && claims.length > 0) {
      score += Math.min(20, claims.length * 5);
    }
    
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
   */
  async analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace) {
    let score = 0;
    
    const strongIndicators = [
      'peer-reviewed', 'published study', 'research shows', 'data indicates',
      'according to', 'study found', 'statistics show', 'meta-analysis'
    ];
    
    const mediumIndicators = [
      'research', 'study', 'data', 'statistics', 'evidence',
      'report', 'survey', 'analysis', 'findings'
    ];
    
    const weakIndicators = [
      'i believe', 'in my opinion', 'it seems', 'probably',
      'might', 'could', 'perhaps', 'maybe'
    ];
    
    const contentLower = content.toLowerCase();
    
    const strongCount = strongIndicators.filter(ind => contentLower.includes(ind)).length;
    const mediumCount = mediumIndicators.filter(ind => contentLower.includes(ind)).length;
    const weakCount = weakIndicators.filter(ind => contentLower.includes(ind)).length;
    
    score += strongCount * 30;
    score += mediumCount * 15;
    score -= weakCount * 5;
    
    const hasNumbers = /\d+%|\d+\.\d+|\d+ (percent|people|cases|studies)/.test(content);
    if (hasNumbers) {
      score += 15;
    }
    
    const hasCitation = /\([A-Z][a-z]+ \d{4}\)|\[?\d+\]?|et al\./.test(content);
    if (hasCitation) {
      score += 20;
    }
    
    if (weakCount > strongCount + mediumCount && !hasNumbers) {
      score -= 20;
    }

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
   */
  calculateOverallQuality(toneScore, clarityScore, evidenceScore, fallacyCount, claimCount, decisionTrace) {
    const weighted = (
      toneScore * 0.25 +
      clarityScore * 0.25 +
      evidenceScore * 0.30 +
      (claimCount > 0 ? 100 : 50) * 0.10 +
      (fallacyCount === 0 ? 100 : Math.max(0, 100 - fallacyCount * 20)) * 0.10
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

  /**
   * ✅ Extract claims with COST TRACKING
   */
  async extractClaims(content, context, retrievedKnowledge, decisionTrace, aiContext = {}) {
  try {
    const ragContext = retrievedKnowledge.context
      ? `\n\nRelevant knowledge:\n${retrievedKnowledge.context.substring(0, 500)}`
      : '';

    const prompt = `Extract the main claims from this debate argument.
Return ONLY a JSON array of strings. Each string is one claim.

${context ? `Previous context:\n${context}\n\n` : ''}Current argument:
${content}${ragContext}

Return format: ["claim 1", "claim 2"]`;

    const response = await grokService.generateFast(prompt, {
      ...aiContext,
      operation: 'claim_extraction',
      temperature: 0.3,
    });

    // ✅ Use structured parser instead of raw JSON.parse
    const claims = await structuredParserService.parse('claims', response, prompt, aiContext);
    const result = (claims || []).slice(0, 5);

    decisionTrace.push(`Extracted ${result.length} claims`);
    return result;

  } catch (error) {
    console.error('Claim extraction error:', error);
    decisionTrace.push('Claim extraction failed');
    return [];
  }
}

  /**
   * ✅ Extract rebuttals with COST TRACKING
   */
  async extractRebuttals(content, context, retrievedKnowledge, decisionTrace, aiContext = {}) {
  try {
    if (!context) {
      decisionTrace.push('No previous turns - no rebuttals possible');
      return [];
    }

    const ragContext = retrievedKnowledge.context
      ? `\n\nRelevant knowledge:\n${retrievedKnowledge.context.substring(0, 500)}`
      : '';

    const prompt = `Identify which previous points this argument is rebutting.
Return ONLY a JSON array of strings.

Previous arguments:
${context}

Current rebuttal:
${content}${ragContext}

Return format: ["rebuttal to X", "counter to Y"]`;

    const response = await grokService.generateFast(prompt, {
      ...aiContext,
      operation: 'debate_analysis',
      temperature: 0.3,
    });

    // ✅ Use structured parser
    const rebuttals = await structuredParserService.parse('rebuttals', response, prompt, aiContext);
    const result = (rebuttals || []).slice(0, 5);

    decisionTrace.push(`Found ${result.length} rebuttals`);
    return result;

  } catch (error) {
    console.error('Rebuttal extraction error:', error);
    decisionTrace.push('Rebuttal extraction failed');
    return [];
  }
}

  /**
   * ✅ Generate summary with COST TRACKING
   */
  async generateDebateSummary(debateId, forTurns, againstTurns, userId = null, userTier = 'free') {
    try {
      const forContent = forTurns.map(t => t.content).join('\n\n');
      const againstContent = againstTurns.map(t => t.content).join('\n\n');

      const prompt = `Provide 3-paragraph summary analyzing both sides' performance.

FOR side:
${forContent.substring(0, 1500)}

AGAINST side:
${againstContent.substring(0, 1500)}

Include: 1) Main arguments, 2) Strongest points, 3) Weaknesses`;

      // ✅ Use budget-aware generation
      const summary = await grokService.generateWithBudget(prompt, {
        userId,
        debateId,
        userTier,
        operation: 'summary_generation',
        temperature: 0.5
      });
      
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