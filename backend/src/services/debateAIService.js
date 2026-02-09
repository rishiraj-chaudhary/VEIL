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
   * ✅ MAIN ANALYSIS METHOD with RAG + COST TRACKING
   */
  async analyzeTurn(content, side, previousTurns = [], userId = null, debateId = null, userTier = 'free') {
    try {
      console.log(`🤖 Analyzing turn for side '${side}' (RAG: ${this.useRAG})`);

      const context = this.buildTurnContext(previousTurns);
      const decisionTrace = [];

      // ✅ STEP 1: INITIALIZATION
      decisionTrace.push({
        step: 'initialization',
        message: 'Starting AI analysis of debate turn',
        timestamp: new Date().toISOString(),
        impact: 'neutral',
        data: {
          side,
          wordCount: content.split(/\s+/).length,
          roundContext: `Round ${previousTurns.length + 1}`,
          useRAG: this.useRAG
        }
      });

      // ✨ STEP 2: RETRIEVE KNOWLEDGE
      const retrievedKnowledge = this.useRAG 
        ? await this.retrieveRelevantKnowledge(content, context, decisionTrace)
        : { sources: [], context: '', knowledgeDocs: [], memoryDocs: [] };

      if (this.useRAG) {
        decisionTrace.push({
          step: 'knowledge_retrieval',
          message: `Retrieved ${retrievedKnowledge.knowledgeDocs.length + retrievedKnowledge.memoryDocs.length} relevant documents`,
          impact: 'neutral',
          data: {
            knowledgeCount: retrievedKnowledge.knowledgeDocs.length,
            memoryCount: retrievedKnowledge.memoryDocs.length,
            sources: retrievedKnowledge.sources
          }
        });
      }

      // ✅ STEP 3: FALLACY DETECTION
      const fallacies = await this.detectFallacies(content, retrievedKnowledge, decisionTrace);
      
      decisionTrace.push({
        step: 'fallacy_detection',
        message: fallacies.length > 0 
          ? `Detected ${fallacies.length} logical fallacy(ies)`
          : 'No fallacies detected',
        impact: fallacies.length > 0 ? 'negative' : 'positive',
        score: -5 * fallacies.length,
        data: {
          fallacies: fallacies.map(f => ({
            type: f.type,
            severity: f.severity,
            explanation: f.explanation
          })),
          deduction: -5 * fallacies.length,
          tips: fallacies.length > 0 ? [
            'Review common logical fallacies',
            'Focus on addressing arguments directly',
            'Avoid personal attacks and emotional manipulation'
          ] : []
        }
      });

      // ✅ Run parallel analysis with retrieved context + COST TRACKING
      const aiContext = {
        userId,
        debateId,
        userTier,
        temperature: 0.3
      };

      const [claims, rebuttals, toneScore, clarityScore, evidenceAnalysis] = await Promise.all([
        this.extractClaims(content, context, retrievedKnowledge, decisionTrace, aiContext),
        this.extractRebuttals(content, context, retrievedKnowledge, decisionTrace, aiContext),
        this.analyzeTone(content, fallacies, decisionTrace),
        this.analyzeClarity(content, [], decisionTrace),
        this.analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace)
      ]);

      // ✅ STEP 4: TONE ANALYSIS
      decisionTrace.push({
        step: 'tone_analysis',
        message: `Tone scored ${toneScore}/100`,
        impact: toneScore >= 70 ? 'positive' : toneScore >= 50 ? 'neutral' : 'negative',
        score: toneScore,
        data: {
          toneScore,
          category: toneScore >= 80 ? 'Excellent' : toneScore >= 60 ? 'Good' : toneScore >= 40 ? 'Fair' : 'Poor',
          reasoning: 'Based on respectfulness, civility, and absence of aggressive language',
          tips: toneScore < 70 ? [
            'Avoid aggressive or dismissive language',
            'Focus on arguments, not the person',
            'Use respectful phrases like "I understand your point, but..."',
            'Acknowledge valid points made by opponents'
          ] : [
            'Great tone! Keep maintaining respect and professionalism'
          ]
        }
      });

      // ✅ STEP 5: CLARITY ANALYSIS
      decisionTrace.push({
        step: 'clarity_analysis',
        message: `Clarity scored ${clarityScore}/100`,
        impact: clarityScore >= 70 ? 'positive' : clarityScore >= 50 ? 'neutral' : 'negative',
        score: clarityScore,
        data: {
          clarityScore,
          claimCount: claims.length,
          category: clarityScore >= 80 ? 'Very Clear' : clarityScore >= 60 ? 'Clear' : clarityScore >= 40 ? 'Somewhat Clear' : 'Unclear',
          reasoning: 'Based on argument structure, coherence, and readability',
          tips: clarityScore < 70 ? [
            'Organize arguments with clear topic sentences',
            'Use transition words (however, therefore, moreover)',
            'Break complex ideas into smaller, digestible points',
            'Aim for 15-25 words per sentence on average'
          ] : [
            'Well-structured argument! Good use of organization'
          ]
        }
      });

      // ✅ STEP 6: EVIDENCE ANALYSIS
      decisionTrace.push({
        step: 'evidence_analysis',
        message: `Evidence scored ${evidenceAnalysis.score}/100`,
        impact: evidenceAnalysis.score >= 70 ? 'positive' : evidenceAnalysis.score >= 50 ? 'neutral' : 'negative',
        score: evidenceAnalysis.score,
        data: {
          evidenceScore: evidenceAnalysis.score,
          hasEvidence: evidenceAnalysis.hasEvidence,
          verified: evidenceAnalysis.verified,
          indicatorCount: evidenceAnalysis.indicatorCount,
          category: evidenceAnalysis.score >= 80 ? 'Strong Evidence' : evidenceAnalysis.score >= 60 ? 'Moderate Evidence' : evidenceAnalysis.score >= 40 ? 'Weak Evidence' : 'No Evidence',
          reasoning: 'Evaluated based on citations, data, and supporting facts',
          tips: evidenceAnalysis.score < 70 ? [
            'Include specific citations or sources (e.g., "According to Smith 2023...")',
            'Use data and statistics to support claims',
            'Provide concrete examples and case studies',
            'Reference peer-reviewed research when possible'
          ] : [
            'Strong evidence usage! Keep citing reliable sources'
          ]
        }
      });

      // ✅ STEP 7: CLAIMS EXTRACTION
      decisionTrace.push({
        step: 'claims_extraction',
        message: `Extracted ${claims.length} main claim(s)`,
        impact: claims.length > 0 ? 'positive' : 'neutral',
        data: {
          claims: claims.slice(0, 5),
          claimCount: claims.length,
          tips: claims.length === 0 ? [
            'Make clear, specific claims',
            'State your main arguments explicitly'
          ] : []
        }
      });

      // ✅ STEP 8: REBUTTAL ANALYSIS
      if (previousTurns.length > 0) {
        decisionTrace.push({
          step: 'rebuttal_analysis',
          message: `Found ${rebuttals.length} rebuttal(s)`,
          impact: rebuttals.length > 0 ? 'positive' : 'neutral',
          data: {
            rebuttals: rebuttals.slice(0, 5),
            rebuttalCount: rebuttals.length,
            tips: rebuttals.length === 0 ? [
              'Directly address opponent\'s arguments',
              'Explain why their reasoning is flawed',
              'Provide counter-evidence'
            ] : []
          }
        });
      }

      // Fact-check with RAG
      let factCheckResult = null;
      if (this.useRAG) {
        try {
          factCheckResult = await factCheckService.checkText(content, {
            sources: ['knowledge'],
            topK: 3
          });

          if (factCheckResult.flags.length > 0) {
            decisionTrace.push({
              step: 'fact_check',
              message: `${factCheckResult.flags.length} claim(s) lack supporting patterns`,
              impact: 'negative',
              data: {
                flags: factCheckResult.flags,
                confidence: factCheckResult.overallConfidence
              }
            });
          } else if (factCheckResult.checks.length > 0) {
            decisionTrace.push({
              step: 'fact_check',
              message: `Claims match knowledge patterns (${factCheckResult.overallConfidence}% confidence)`,
              impact: 'positive',
              data: {
                checks: factCheckResult.checks,
                confidence: factCheckResult.overallConfidence
              }
            });
          }
        } catch (error) {
          console.error('Fact check error:', error.message);
        }
      }

      // ✅ STEP 9: OVERALL QUALITY CALCULATION
      const overallQuality = this.calculateOverallQuality(
        toneScore,
        clarityScore,
        evidenceAnalysis.score,
        fallacies.length,
        claims.length,
        decisionTrace
      );

      decisionTrace.push({
        step: 'overall_quality',
        message: `Final quality score: ${overallQuality}/100`,
        impact: overallQuality >= 70 ? 'positive' : overallQuality >= 50 ? 'neutral' : 'negative',
        score: overallQuality,
        data: {
          overallQuality,
          breakdown: {
            tone: { score: toneScore, weight: '25%' },
            clarity: { score: clarityScore, weight: '25%' },
            evidence: { score: evidenceAnalysis.score, weight: '30%' },
            claims: { present: claims.length > 0, weight: '10%' },
            fallacies: { count: fallacies.length, penalty: fallacies.length * 5, weight: '10%' }
          },
          formula: '(tone × 0.25) + (clarity × 0.25) + (evidence × 0.30) + (hasClaims × 0.10) + (noFallacies × 0.10)',
          category: overallQuality >= 80 ? 'Excellent' : overallQuality >= 60 ? 'Good' : overallQuality >= 40 ? 'Fair' : 'Poor',
          tips: overallQuality < 70 ? [
            'Focus on areas with lowest scores',
            'Balance emotion with logic',
            'Support claims with evidence',
            'Maintain respectful discourse'
          ] : [
            'Outstanding argument quality!',
            'Keep up the excellent work'
          ]
        }
      });

      // ✅ FINAL SUMMARY
      decisionTrace.push({
        step: 'summary',
        message: 'Analysis complete',
        impact: 'neutral',
        data: {
          totalSteps: decisionTrace.length,
          analysisTime: 'Real-time',
          strengths: [
            ...(toneScore >= 70 ? ['Respectful tone'] : []),
            ...(clarityScore >= 70 ? ['Clear structure'] : []),
            ...(evidenceAnalysis.score >= 70 ? ['Strong evidence'] : []),
            ...(fallacies.length === 0 ? ['No fallacies'] : [])
          ],
          weaknesses: [
            ...(toneScore < 70 ? ['Tone could be more respectful'] : []),
            ...(clarityScore < 70 ? ['Structure could be clearer'] : []),
            ...(evidenceAnalysis.score < 70 ? ['Needs more evidence'] : []),
            ...(fallacies.length > 0 ? [`${fallacies.length} fallacy(ies) detected`] : [])
          ]
        }
      });

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
        decisionTrace: [{
          step: 'error',
          message: 'Error during analysis - using default scores',
          impact: 'negative',
          data: { error: error.message }
        }],
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
   * ROBUST FALLACY DETECTION
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

      const prompt = `Extract main claims from this debate argument. Return ONLY a JSON array of strings.

${context ? `Previous context:\n${context}\n\n` : ''}Current argument:
${content}${ragContext}

Return format: ["claim 1", "claim 2"]`;

      // ✅ Pass AI context for tracking
      const response = await grokService.generateFast(prompt, {
        ...aiContext,
        operation: 'claim_extraction',
        temperature: 0.3
      });
      
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

      const prompt = `Identify which previous points this argument is rebutting. Return ONLY a JSON array.

Previous arguments:
${context}

Current rebuttal:
${content}${ragContext}

Return format: ["rebuttal to X", "counter to Y"]`;

      // ✅ Pass AI context for tracking
      const response = await grokService.generateFast(prompt, {
        ...aiContext,
        operation: 'debate_analysis',
        temperature: 0.3
      });
      
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