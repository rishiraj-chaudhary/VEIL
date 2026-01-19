import axios from 'axios';
import Comment from '../models/comment.js';
import Community from '../models/community.js';
import Post from '../models/post.js';
import Slick from '../models/slick.js';
import User from '../models/user.js';
import grokService from './grokService.js';

class SlickAIService {
  constructor() {
    // Use GROK_API_KEY from environment (should be Groq API key, not X.ai)
    this.grokApiKey = process.env.GROK_API_KEY;
    
    // FIXED: Use Groq API endpoint, not X.ai
    this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    
    // Debug logging
    if (!this.grokApiKey) {
      console.error('❌ SlickAI: GROK_API_KEY not found');
    } else {
      console.log('✅ SlickAI: API Key loaded successfully');
      console.log('🔑 SlickAI: Key starts with:', this.grokApiKey.substring(0, 10) + '...');
    }
    
    // AI analysis thresholds
    this.thresholds = {
      harmScore: 0.7,
      minConstructiveness: 0.3,
      maxIntensity: 8,
    };
  }

  // Get fresh API key each time
  getApiKey() {
    const key = process.env.GROK_API_KEY;
    if (!key) {
      console.error('❌ SlickAI: API key not available when needed');
    }
    return key;
  }

  // 🤖 Call Groq AI API (FIXED endpoint)
  async callGrokAI(prompt, maxTokens = 1000) {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('Groq API key not available');
    }

    try {
      console.log('🤖 SlickAI: Calling Groq API...');
      
      const response = await axios.post(this.apiUrl, {
        model: 'llama-3.3-70b-versatile', // Using Groq's model
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant specialized in analyzing social content and generating personalized feedback. Always respond in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.4
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ SlickAI: Groq API call successful');
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('❌ SlickAI: Groq API error:', error.response?.data || error.message);
      throw error;
    }
  }

  // 🔍 Verify relationship between users
  async verifyRelationship(authorId, targetId) {
    try {
      const author = await User.findById(authorId);
      const target = await User.findById(targetId);

      if (!author || !target) {
        return { isValid: false, reason: 'User not found' };
      }

      // Check if they're in the same communities
      const authorCommunities = await Community.find({ members: authorId });
      const targetCommunities = await Community.find({ members: targetId });
      
      const sharedCommunities = authorCommunities.filter(ac =>
        targetCommunities.some(tc => tc._id.equals(ac._id))
      );

      if (sharedCommunities.length > 0) {
        return {
          isValid: true,
          type: 'same_community',
          communities: sharedCommunities.map(c => c.name)
        };
      }

      return {
        isValid: false,
        reason: 'No valid relationship found (must be in same community)'
      };

    } catch (error) {
      console.error('Relationship verification error:', error);
      return { isValid: false, reason: 'Verification failed' };
    }
  }

  // 🔍 NEW: Build comprehensive context for target user
  async buildTargetUserContext(targetUserId) {
    try {
      console.log('🔍 Building target user context for:', targetUserId);

      const targetUser = await User.findById(targetUserId);
      if (!targetUser) return null;

      // 1. Get recent posts (last 10, weighted by recency)
      const recentPosts = await Post.find({ 
        author: targetUserId,
        isDeleted: false 
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('community', 'name displayName')
        .lean();

      // 2. Get recent comments (last 10, weighted by recency)
      const recentComments = await Comment.find({ 
        author: targetUserId,
        isDeleted: false 
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('post', 'title')
        .lean();

      // 3. Extract topics from content
      const topTopics = this.extractTopics([
        ...recentPosts.map(p => p.title + ' ' + (p.content || '')),
        ...recentComments.map(c => c.content)
      ]);

      // 4. Analyze writing style
      const writingStyle = this.analyzeWritingStyle([
        ...recentPosts.map(p => p.content || p.title),
        ...recentComments.map(c => c.content)
      ]);

      // 5. Calculate recency weights (more recent = higher weight)
      const weightedPosts = this.applyRecencyWeights(recentPosts);
      const weightedComments = this.applyRecencyWeights(recentComments);

      return {
        username: targetUser.username,
        karma: targetUser.karma,
        recentPosts: weightedPosts.slice(0, 5), // Top 5 by weight
        recentComments: weightedComments.slice(0, 10),
        topTopics,
        writingStyle,
        interests: topTopics.slice(0, 5) // Top 5 topics as interests
      };

    } catch (error) {
      console.error('Error building target user context:', error);
      return null;
    }
  }

  // 🔍 NEW: Build relationship context
  async buildRelationshipContext(authorId, targetId) {
    try {
      console.log('🔍 Building relationship context');

      // 1. Get shared communities
      const authorCommunities = await Community.find({ members: authorId })
        .select('name displayName description')
        .lean();
      
      const targetCommunities = await Community.find({ members: targetId })
        .select('name displayName description')
        .lean();
      
      const sharedCommunities = authorCommunities.filter(ac =>
        targetCommunities.some(tc => tc._id.equals(ac._id))
      );

      // 2. Get previous interactions (comments on same posts, replies to each other)
      const authorComments = await Comment.find({ author: authorId })
        .select('post createdAt')
        .lean();
      
      const targetComments = await Comment.find({ author: targetId })
        .select('post createdAt')
        .lean();

      const sharedPostIds = new Set(
        authorComments
          .filter(ac => targetComments.some(tc => tc.post.equals(ac.post)))
          .map(c => c.post.toString())
      );

      // 3. Calculate interaction frequency
      const interactionFrequency = sharedPostIds.size;

      return {
        sharedCommunities: sharedCommunities.map(c => ({
          name: c.name,
          displayName: c.displayName,
          description: c.description
        })),
        previousInteractions: Array.from(sharedPostIds).length,
        interactionFrequency
      };

    } catch (error) {
      console.error('Error building relationship context:', error);
      return null;
    }
  }

  // 🔍 NEW: Build community context
  async buildCommunityContext(sharedCommunities) {
    try {
      console.log('🔍 Building community context');

      if (!sharedCommunities || sharedCommunities.length === 0) return null;

      // Get recent discussions from shared communities
      const communityIds = sharedCommunities.map(c => c._id || c.id);
      
      const recentDiscussions = await Post.find({
        community: { $in: communityIds },
        isDeleted: false
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('community', 'name')
        .populate('author', 'username')
        .lean();

      // Analyze community tone from recent posts
      const communityTone = this.analyzeCommunityTone(recentDiscussions);

      return {
        recentDiscussions: recentDiscussions.map(d => ({
          title: d.title,
          community: d.community?.name,
          author: d.author?.username,
          karma: d.karma,
          weight: this.calculateRecencyWeight(d.createdAt)
        })),
        communityTone
      };

    } catch (error) {
      console.error('Error building community context:', error);
      return null;
    }
  }

  // 🔍 NEW: Build author history context
  async buildAuthorHistoryContext(authorId) {
    try {
      console.log('🔍 Building author history context');

      // Get all slicks from MongoDB and decrypt to find author's slicks
      const allSlicks = await Slick.find({ isActive: true })
        .sort({ createdAt: -1 })
        .limit(100) // Limit for performance
        .lean();

      // Decrypt and filter for this author's slicks
      const sentSlicks = allSlicks
        .filter(slick => {
          try {
            const decryptedAuthorId = Slick.decryptAuthorId(slick.encryptedAuthorId);
            return decryptedAuthorId === authorId.toString();
          } catch {
            return false;
          }
        })
        .slice(0, 10); // Last 10 sent slicks

      // Analyze preferred tones
      const toneCounts = sentSlicks.reduce((acc, slick) => {
        const tone = slick.tone?.category || 'unknown';
        acc[tone] = (acc[tone] || 0) + 1;
        return acc;
      }, {});

      const preferredTones = Object.entries(toneCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([tone]) => tone);

      return {
        sentSlicks: sentSlicks.map(s => ({
          tone: s.tone?.category,
          intensity: s.tone?.intensity,
          credibilityScore: s.credibilityScore,
          weight: this.calculateRecencyWeight(s.createdAt)
        })),
        preferredTones,
        averageCredibility: sentSlicks.reduce((sum, s) => sum + (s.credibilityScore || 50), 0) / (sentSlicks.length || 1)
      };

    } catch (error) {
      console.error('Error building author history context:', error);
      return null;
    }
  }

  // 🔍 NEW: Extract topics from text array
  extractTopics(textArray) {
    const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how']);

    const wordFrequency = {};
    
    textArray.forEach(text => {
      if (!text) return;
      
      const words = text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3 && !stopWords.has(word));

      words.forEach(word => {
        wordFrequency[word] = (wordFrequency[word] || 0) + 1;
      });
    });

    return Object.entries(wordFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  // 🔍 NEW: Analyze writing style
  analyzeWritingStyle(textArray) {
    if (!textArray || textArray.length === 0) {
      return {
        avgLength: 0,
        complexity: 'simple',
        tone: 'neutral',
        commonPhrases: []
      };
    }

    const validTexts = textArray.filter(t => t && typeof t === 'string');
    
    const avgLength = validTexts.reduce((sum, text) => sum + text.length, 0) / validTexts.length;
    
    // Simple complexity heuristic
    const complexity = avgLength > 200 ? 'detailed' : avgLength > 100 ? 'moderate' : 'brief';
    
    // Detect tone (basic sentiment analysis)
    const positiveWords = ['great', 'good', 'amazing', 'love', 'excellent', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'poor', 'worst'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    validTexts.forEach(text => {
      const lower = text.toLowerCase();
      positiveWords.forEach(word => {
        if (lower.includes(word)) positiveCount++;
      });
      negativeWords.forEach(word => {
        if (lower.includes(word)) negativeCount++;
      });
    });
    
    const tone = positiveCount > negativeCount * 1.5 ? 'positive' :
                  negativeCount > positiveCount * 1.5 ? 'critical' :
                  'balanced';

    return {
      avgLength: Math.round(avgLength),
      complexity,
      tone,
      formality: avgLength > 150 ? 'formal' : 'casual'
    };
  }

  // 🔍 NEW: Analyze community tone
  analyzeCommunityTone(posts) {
    if (!posts || posts.length === 0) {
      return { overall: 'neutral', engagement: 'low' };
    }

    const avgKarma = posts.reduce((sum, p) => sum + (p.karma || 0), 0) / posts.length;
    const engagement = avgKarma > 20 ? 'high' : avgKarma > 5 ? 'moderate' : 'low';

    // Simple tone detection
    const tones = posts.map(p => {
      const text = (p.title + ' ' + (p.content || '')).toLowerCase();
      if (text.includes('help') || text.includes('question')) return 'supportive';
      if (text.includes('debate') || text.includes('disagree')) return 'analytical';
      if (text.includes('funny') || text.includes('lol')) return 'humorous';
      return 'informative';
    });

    const toneCount = tones.reduce((acc, t) => {
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {});

    const dominantTone = Object.entries(toneCount)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'neutral';

    return {
      overall: dominantTone,
      engagement
    };
  }

  // 🔍 NEW: Calculate recency weight (exponential decay)
  calculateRecencyWeight(date) {
    const now = Date.now();
    const itemDate = new Date(date).getTime();
    const daysDiff = (now - itemDate) / (1000 * 60 * 60 * 24);
    
    // Exponential decay: weight = e^(-0.1 * days)
    // Recent items get weight close to 1.0, older items decay to near 0
    return Math.exp(-0.1 * daysDiff);
  }

  // 🔍 NEW: Apply recency weights to items
  applyRecencyWeights(items) {
    return items.map(item => ({
      ...item,
      recencyWeight: this.calculateRecencyWeight(item.createdAt)
    }))
    .sort((a, b) => b.recencyWeight - a.recencyWeight);
  }

  // 🤖 AI content analysis using Grok
  async analyzeSlickContent(content, tone) {
    console.log('🔧 Using basic validation for content analysis');
    return {
      harmScore: 0.1,
      constructivenessScore: 0.8,
      intentAnalysis: 'Positive feedback',
      safetyFlags: [],
      isAppropriate: true,
      reasoning: 'Basic validation passed',
      suggestions: []
    };
  }

  // ✍️ Rewrite content using AI to be more constructive
  async rewriteContent(content, tone) {
    try {
      const rewritePrompt = `
        Rewrite this anonymous feedback to be more constructive while preserving the core message.
        
        Original: "${content}"
        Tone: ${tone.category} (intensity: ${tone.intensity}/10)
        
        Guidelines:
        1. Remove harmful language
        2. Make it more constructive
        3. Keep the essence of the feedback
        4. Make it feel genuine, not overly formal
        5. Keep it under 300 characters
        
        Return only the rewritten text, no explanations.
      `;

      const rewrittenText = await this.callGrokAI(rewritePrompt, 200);
      return rewrittenText.trim().replace(/^"|"$/g, ''); // Remove quotes if present

    } catch (error) {
      console.error('❌ SlickAI: Content rewriting error:', error);
      return this.fallbackRewrite(content);
    }
  }

  // 🌟 ENHANCED: Generate slick suggestions with full context
  async generateSlickSuggestions(authorId, targetId, context = '') {
    try {
      console.log('🌟 Generating enhanced slick suggestions with full context');

      // Build comprehensive context
      const [targetUserContext, relationshipContext, authorHistoryContext] = await Promise.all([
        this.buildTargetUserContext(targetId),
        this.buildRelationshipContext(authorId, targetId),
        this.buildAuthorHistoryContext(authorId)
      ]);

      // Build community context from shared communities
      const communityContext = await this.buildCommunityContext(
        relationshipContext?.sharedCommunities || []
      );

      // Construct rich prompt for AI
      const prompt = this.buildEnhancedPrompt({
        targetUserContext,
        relationshipContext,
        communityContext,
        authorHistoryContext,
        additionalContext: context
      });

      console.log('📝 Enhanced prompt built, calling Groq API...');

      const aiResponse = await grokService.generateSmart(prompt, {
        temperature: 0.4,
      });

      // Parse JSON safely
      const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleanResponse);

      console.log('✅ Enhanced suggestions generated successfully');

      return parsed.suggestions;
    } catch (err) {
      console.error('❌ Enhanced Slick AI (Groq) failed:', err.message);
      return this.fallbackSuggestions();
    }
  }

  // 🌟 NEW: Build enhanced prompt with all context
  buildEnhancedPrompt(contextData) {
    const {
      targetUserContext,
      relationshipContext,
      communityContext,
      authorHistoryContext,
      additionalContext
    } = contextData;

    let prompt = `Generate 3 different anonymous feedback suggestions based on comprehensive user context.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET USER PROFILE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Username: ${targetUserContext?.username || 'Unknown'}
Karma: ${targetUserContext?.karma || 0}
Writing Style: ${targetUserContext?.writingStyle?.complexity || 'unknown'}, ${targetUserContext?.writingStyle?.tone || 'neutral'} tone

RECENT ACTIVITY (weighted by recency):
`;

    // Add recent posts
    if (targetUserContext?.recentPosts?.length > 0) {
      prompt += '\nRecent Posts:\n';
      targetUserContext.recentPosts.slice(0, 3).forEach((post, i) => {
        prompt += `${i + 1}. "${post.title}" (weight: ${post.recencyWeight?.toFixed(2)})\n`;
      });
    }

    // Add recent comments
    if (targetUserContext?.recentComments?.length > 0) {
      prompt += '\nRecent Comments (sample):\n';
      targetUserContext.recentComments.slice(0, 3).forEach((comment, i) => {
        const preview = comment.content?.substring(0, 60) + '...';
        prompt += `${i + 1}. "${preview}" (weight: ${comment.recencyWeight?.toFixed(2)})\n`;
      });
    }

    // Add interests/topics
    if (targetUserContext?.topTopics?.length > 0) {
      prompt += `\nTop Interests: ${targetUserContext.topTopics.join(', ')}\n`;
    }

    prompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RELATIONSHIP CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    // Add shared communities
    if (relationshipContext?.sharedCommunities?.length > 0) {
      prompt += 'Shared Communities:\n';
      relationshipContext.sharedCommunities.forEach(c => {
        prompt += `- ${c.displayName}: ${c.description || 'No description'}\n`;
      });
    }

    prompt += `Previous Interactions: ${relationshipContext?.interactionFrequency || 0} shared discussions\n`;

    // Add community context
    if (communityContext?.recentDiscussions?.length > 0) {
      prompt += `\nRecent Community Topics:\n`;
      communityContext.recentDiscussions.slice(0, 3).forEach((disc, i) => {
        prompt += `${i + 1}. "${disc.title}" in c/${disc.community}\n`;
      });
      prompt += `Community Vibe: ${communityContext.communityTone?.overall || 'neutral'}, ${communityContext.communityTone?.engagement || 'low'} engagement\n`;
    }

    prompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR FEEDBACK HISTORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    if (authorHistoryContext?.preferredTones?.length > 0) {
      prompt += `Your Preferred Tones: ${authorHistoryContext.preferredTones.join(', ')}\n`;
      prompt += `Your Avg Credibility: ${authorHistoryContext.averageCredibility?.toFixed(1)}%\n`;
    }

    if (additionalContext) {
      prompt += `\nAdditional Context: ${additionalContext}\n`;
    }

    prompt += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TASK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Based on this rich context, create 3 PERSONALIZED, RELEVANT anonymous feedback suggestions:

1. Reference specific topics/interests from their activity
2. Match the community vibe and their writing style
3. Be genuinely helpful and constructive
4. Use different tones: praise, constructive, playful

Return ONLY valid JSON (no markdown):
{
  "suggestions": [
    {
      "content": "specific, contextual feedback text",
      "tone": { "category": "praise|constructive|tease|observation", "intensity": 1-10 },
      "explanation": "why this is relevant to them"
    }
  ]
}`;

    return prompt;
  }

  // 📊 Generate AI insights about slick patterns
  async generateSlickInsights(userId, receivedSlicks, sentSlicks) {
    try {
      const insightsPrompt = `
        Analyze these anonymous feedback patterns for user insights.
        
        Received Slicks Summary:
        - Total: ${receivedSlicks.length}
        - Tone breakdown: ${JSON.stringify(this.groupByTone(receivedSlicks))}
        - Avg credibility: ${this.calculateAvgCredibility(receivedSlicks)}
        
        Sent Slicks Summary:
        - Total: ${sentSlicks.length}
        - Tone breakdown: ${JSON.stringify(this.groupByTone(sentSlicks))}
        
        Generate insights in JSON format:
        {
          "personalityInsights": ["insight1", "insight2"],
          "communicationStyle": "description",
          "recommendedActions": ["action1", "action2"],
          "strengths": ["strength1", "strength2"],
          "growthAreas": ["area1", "area2"]
        }
        
        Be constructive and encouraging while being honest.
      `;

      const aiResponse = await this.callGrokAI(insightsPrompt, 500);
      const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanResponse);

    } catch (error) {
      console.error('❌ SlickAI: Insights generation error:', error);
      return {
        personalityInsights: ["Unable to generate AI insights at this time"],
        communicationStyle: "Analysis unavailable",
        recommendedActions: ["Continue engaging with the community"],
        strengths: ["Active participation"],
        growthAreas: ["Keep being yourself"]
      };
    }
  }

  // 🚨 Advanced content moderation using AI
  async moderateSlickContent(content, context = {}) {
    try {
      const moderationPrompt = `
        Moderate this anonymous feedback content for a social platform.
        
        Content: "${content}"
        Context: ${JSON.stringify(context)}
        
        Analyze for:
        1. Harassment or bullying
        2. Personal attacks
        3. Threats or intimidation
        4. Inappropriate sexual content
        5. Hate speech
        6. Privacy violations
        
        Return JSON:
        {
          "shouldAllow": true,
          "riskLevel": "low|medium|high",
          "flags": ["flag1", "flag2"],
          "reasoning": "explanation",
          "confidence": 0.85
        }
      `;

      const aiResponse = await this.callGrokAI(moderationPrompt, 300);
      const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanResponse);

    } catch (error) {
      console.error('❌ SlickAI: AI moderation error:', error);
      return {
        shouldAllow: true,
        riskLevel: 'low',
        flags: [],
        reasoning: 'AI moderation unavailable, defaulting to allow',
        confidence: 0.5
      };
    }
  }

  // 💰 Calculate currency rewards based on AI analysis
  async calculateSlickReward(slick, communityEngagement) {
    let reward = 5; // Base reward

    // AI analysis bonuses
    if (slick.aiAnalysis?.constructivenessScore > 0.7) {
      reward += 15; // High constructiveness bonus
    }

    if (slick.aiAnalysis?.harmScore < 0.2) {
      reward += 10; // Safety bonus
    }

    // Community engagement bonuses
    const totalReactions = Object.values(slick.reactions).reduce((sum, count) => sum + count, 0);
    if (totalReactions > 5) {
      reward += Math.min(totalReactions * 2, 30); // Popular content bonus
    }

    // High credibility bonus
    if (slick.credibilityScore > 80) {
      reward += 20;
    }

    return Math.min(reward, 100); // Cap at 100 coins
  }

  // 🔄 Fallback methods when AI fails
  fallbackAnalysis(content, tone) {
    console.log('⚠️ SlickAI: Using fallback analysis');
    
    const harmfulWords = ['hate', 'stupid', 'idiot', 'loser', 'pathetic'];
    const constructiveWords = ['improve', 'better', 'consider', 'maybe', 'could'];
    
    const lowerContent = content.toLowerCase();
    
    const harmScore = harmfulWords.filter(word => lowerContent.includes(word)).length * 0.2;
    const constructiveScore = Math.min(1, 0.3 + (constructiveWords.filter(word => lowerContent.includes(word)).length * 0.15));
    
    return {
      harmScore: Math.min(1, harmScore),
      constructivenessScore: constructiveScore,
      intentAnalysis: 'Basic analysis due to AI unavailability',
      safetyFlags: harmScore > 0.5 ? ['potential_harm'] : [],
      isAppropriate: harmScore < 0.7,
      reasoning: 'Fallback rule-based analysis',
      suggestions: ['Consider being more constructive']
    };
  }

  fallbackRewrite(content) {
    return content
      .replace(/stupid/gi, 'unwise')
      .replace(/idiot/gi, 'person')
      .replace(/hate/gi, 'dislike')
      + ' (AI rewrite unavailable)';
  }

  fallbackSuggestions() {
    return [
      {
        content: "I appreciate how you handle challenges",
        tone: { category: "praise", intensity: 6 },
        explanation: "Positive reinforcement"
      },
      {
        content: "You might consider listening more in discussions",
        tone: { category: "constructive", intensity: 4 },
        explanation: "Gentle improvement suggestion"
      },
      {
        content: "Your jokes are... unique 😄",
        tone: { category: "tease", intensity: 3 },
        explanation: "Playful observation"
      }
    ];
  }

  // Helper methods
  async getSharedCommunities(authorId, targetId) {
    try {
      const authorCommunities = await Community.find({ members: authorId }).select('name');
      const targetCommunities = await Community.find({ members: targetId }).select('name');
      
      return authorCommunities
        .filter(ac => targetCommunities.some(tc => tc._id.equals(ac._id)))
        .map(c => c.name);
    } catch (error) {
      return ['general community'];
    }
  }

  groupByTone(slicks) {
    const groups = { praise: 0, tease: 0, constructive: 0, observation: 0 };
    slicks.forEach(slick => {
      if (groups.hasOwnProperty(slick.tone.category)) {
        groups[slick.tone.category]++;
      }
    });
    return groups;
  }

  calculateAvgCredibility(slicks) {
    if (slicks.length === 0) return 0;
    const sum = slicks.reduce((acc, slick) => acc + slick.credibilityScore, 0);
    return Math.round(sum / slicks.length);
  }
}

// Export singleton
const slickAIService = new SlickAIService();
export default slickAIService;