import grokService from './grokService.js';
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
      const [claims, rebuttals, fallacies, toneScore, clarityScore, evidenceAnalysis] = await Promise.all([
        this.extractClaims(content, context, retrievedKnowledge, decisionTrace),
        this.extractRebuttals(content, context, retrievedKnowledge, decisionTrace),
        this.detectFallacies(content, retrievedKnowledge, decisionTrace),
        this.analyzeTone(content, decisionTrace),
        this.analyzeClarity(content, decisionTrace),
        this.analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace)
      ]);

      // Calculate overall quality
      const overallQuality = this.calculateOverallQuality({
        toneScore,
        clarityScore,
        evidenceScore: evidenceAnalysis.score,
        claimCount: claims.length,
        fallacyCount: fallacies.length
      }, decisionTrace);

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
        retrievedSources: retrievedKnowledge.sources
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
   * Calculate overall quality with JUSTIFICATION
   */
  calculateOverallQuality(components, decisionTrace) {
    const { toneScore, clarityScore, evidenceScore, claimCount, fallacyCount } = components;

    let score = 0;
    const weights = {
      tone: 0.2,
      clarity: 0.3,
      evidence: 0.3,
      claims: 0.2
    };

    const toneContribution = toneScore * weights.tone;
    score += toneContribution;
    decisionTrace.push(`Tone (${toneScore.toFixed(1)}) × ${weights.tone} = +${toneContribution.toFixed(1)}`);

    const clarityContribution = clarityScore * weights.clarity;
    score += clarityContribution;
    decisionTrace.push(`Clarity (${clarityScore.toFixed(1)}) × ${weights.clarity} = +${clarityContribution.toFixed(1)}`);

    const evidenceContribution = evidenceScore * weights.evidence;
    score += evidenceContribution;
    decisionTrace.push(`Evidence (${evidenceScore.toFixed(1)}) × ${weights.evidence} = +${evidenceContribution.toFixed(1)}`);

    const claimScore = Math.min(100, claimCount * 10);
    const claimContribution = claimScore * weights.claims;
    score += claimContribution;
    decisionTrace.push(`Claims (${claimCount} found, score ${claimScore}) × ${weights.claims} = +${claimContribution.toFixed(1)}`);

    if (fallacyCount > 0) {
      const penalty = fallacyCount * 5;
      score -= penalty;
      decisionTrace.push(`Fallacy penalty: ${fallacyCount} fallacies = -${penalty}`);
    }

    return Math.round(Math.max(0, Math.min(100, score)));
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

  async detectFallacies(content, retrievedKnowledge, decisionTrace) {
    try {
      const ragContext = retrievedKnowledge.context 
        ? `\n\nKnown fallacy patterns:\n${retrievedKnowledge.context.substring(0, 500)}`
        : '';

      const prompt = `Analyze for logical fallacies. Return ONLY valid JSON array.

Argument:
${content}${ragContext}

Return format (no markdown, no explanation):
[{"type":"ad hominem","explanation":"attacks person not argument","severity":7}]

Common fallacies: ad hominem, straw man, false dilemma, slippery slope, appeal to emotion, appeal to authority, hasty generalization, circular reasoning

Return empty array [] if no fallacies.`;

      const response = await grokService.generateFast(prompt, { temperature: 0.2 });

      let cleanResponse = response.trim();
      cleanResponse = cleanResponse.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      const firstBracket = cleanResponse.indexOf('[');
      const lastBracket = cleanResponse.lastIndexOf(']');
      
      if (firstBracket !== -1 && lastBracket !== -1) {
        cleanResponse = cleanResponse.substring(firstBracket, lastBracket + 1);
      }
      
      const fallacies = JSON.parse(cleanResponse);

      if (!Array.isArray(fallacies)) {
        decisionTrace.push('Fallacy detection returned invalid format');
        return [];
      }
      
      const validFallacies = fallacies.filter(f => 
        f && 
        typeof f === 'object' && 
        typeof f.type === 'string' &&
        typeof f.explanation === 'string' &&
        typeof f.severity === 'number'
      ).slice(0, 3);

      if (validFallacies.length > 0) {
        decisionTrace.push(`Detected ${validFallacies.length} fallacies: ${validFallacies.map(f => f.type).join(', ')}`);
      } else {
        decisionTrace.push('No fallacies detected');
      }
      
      return validFallacies;
    } catch (error) {
      console.error('Fallacy detection error:', error);
      decisionTrace.push('Fallacy detection failed');
      return [];
    }
  }

  async analyzeTone(content, decisionTrace) {
    try {
      const prompt = `Rate tone on professionalism and respectfulness.

Argument:
${content}

Return ONLY JSON:
{"score": 85, "reasoning": "Professional and respectful"}`;

      const response = await grokService.generateFast(prompt, { temperature: 0.2 });
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanResponse);

      const score = Math.max(0, Math.min(100, result.score || 50));
      decisionTrace.push(`Tone: ${score}/100 - ${result.reasoning || 'No justification'}`);
      
      return score;
    } catch (error) {
      console.error('Tone analysis error:', error);
      decisionTrace.push('Tone analysis failed - using default 50');
      return 50;
    }
  }

  async analyzeClarity(content, decisionTrace) {
    try {
      const prompt = `Rate clarity (structure, readability, coherence).

Argument:
${content}

Return ONLY JSON:
{"score": 75, "reasoning": "Clear but verbose"}`;

      const response = await grokService.generateFast(prompt, { temperature: 0.2 });
      const cleanResponse = response.replace(/```json|```/g, '').trim();
      const result = JSON.parse(cleanResponse);

      const score = Math.max(0, Math.min(100, result.score || 50));
      decisionTrace.push(`Clarity: ${score}/100 - ${result.reasoning || 'No justification'}`);
      
      return score;
    } catch (error) {
      console.error('Clarity analysis error:', error);
      decisionTrace.push('Clarity analysis failed - using default 50');
      return 50;
    }
  }

  async analyzeEvidenceWithRAG(content, retrievedKnowledge, decisionTrace) {
    try {
      const evidenceIndicators = [
        'study', 'research', 'data', 'statistics', 'source',
        'according to', 'shows that', 'evidence', 'proven',
        'report', 'analysis', 'survey', 'experiment'
      ];

      const lowerContent = content.toLowerCase();
      const indicatorCount = evidenceIndicators.filter(
        indicator => lowerContent.includes(indicator)
      ).length;

      const hasEvidence = indicatorCount > 0;
      let score = Math.min(100, 30 + (indicatorCount * 15));

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
        } else {
          decisionTrace.push(`⚠️ Evidence not strongly supported by knowledge base`);
        }
      }

      if (hasEvidence) {
        decisionTrace.push(`Found ${indicatorCount} evidence indicators`);
      } else {
        decisionTrace.push('No evidence indicators found');
        score -= 10;
      }

      return {
        hasEvidence,
        verified,
        score: Math.max(0, Math.min(100, score)),
        indicatorCount,
        sources: retrievedKnowledge.sources
      };

    } catch (error) {
      console.error('Evidence analysis error:', error);
      decisionTrace.push('Evidence analysis failed');
      return {
        hasEvidence: false,
        verified: false,
        score: 50,
        indicatorCount: 0,
        sources: []
      };
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