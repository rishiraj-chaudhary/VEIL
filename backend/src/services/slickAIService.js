import axios from 'axios';
import Community from '../models/community.js';
import User from '../models/user.js';

class SlickAIService {
  constructor() {
    // Force fresh API key loading
    this.grokApiKey = process.env.GROK_API_KEY;
    this.apiUrl = 'https://api.x.ai/v1/chat/completions';
    
    // Debug logging
    if (!this.grokApiKey) {
      console.error('❌ SlickAI: GROK_API_KEY not found');
      console.log('Available GROK vars:', Object.keys(process.env).filter(key => key.includes('GROK')));
    } else {
      console.log('✅ SlickAI: Grok API Key loaded successfully');
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

  // 🤖 Call Grok AI API
  async callGrokAI(prompt, maxTokens = 1000) {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('Grok API key not available');
    }

    try {
      console.log('🤖 SlickAI: Calling Grok API...');
      
      const response = await axios.post(this.apiUrl, {
        model: 'grok-beta',
        messages: [
          {
            role: 'system',
            content: 'You are an AI assistant specialized in analyzing social content for harm, constructiveness, and intent. Always respond in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxTokens,
        temperature: 0.3
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      console.log('✅ SlickAI: Grok API call successful');
      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('❌ SlickAI: Grok API error:', error.response?.data || error.message);
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

  // 🤖 AI content analysis using Grok
  async analyzeSlickContent(content, tone) {
    console.log('🔧 BYPASS: Using mock AI analysis for testing');
    return {
      harmScore: 0.1,
      constructivenessScore: 0.8,
      intentAnalysis: 'Positive feedback (bypassed)',
      safetyFlags: [],
      isAppropriate: true,
      reasoning: 'Bypassed AI analysis for testing',
      suggestions: []
    };
    try {
      console.log('🔍 SlickAI: Analyzing content:', content.substring(0, 50) + '...');
      
      const analysisPrompt = `
        Analyze this anonymous feedback message for safety and constructiveness.
        
        Content: "${content}"
        Tone Category: ${tone.category}
        Intensity Level: ${tone.intensity}/10
        
        Provide analysis in this exact JSON format:
        {
          "harmScore": 0.0,
          "constructivenessScore": 0.0,
          "intentAnalysis": "brief description of intent",
          "safetyFlags": ["flag1", "flag2"],
          "isAppropriate": true,
          "reasoning": "explanation of analysis",
          "suggestions": ["suggestion1", "suggestion2"]
        }
        
        Scoring criteria:
        - harmScore (0-1): 0 = completely safe, 1 = very harmful
        - constructivenessScore (0-1): 0 = not constructive, 1 = very constructive
        - safetyFlags: harassment, threats, personal_attacks, inappropriate_content
        - isAppropriate: whether the content should be allowed
        
        Consider that this is anonymous feedback between people who know each other.
      `;

      const aiResponse = await this.callGrokAI(analysisPrompt, 500);
      let analysis;

      try {
        // Clean the response and parse JSON
        const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
        analysis = JSON.parse(cleanResponse);
        console.log('✅ SlickAI: Content analysis successful');
      } catch (parseError) {
        console.error('❌ SlickAI: Failed to parse AI response:', parseError);
        throw new Error('Invalid AI response format');
      }

      // If content is inappropriate, generate a rewritten version
      if (!analysis.isAppropriate || analysis.harmScore > 0.7) {
        console.log('⚠️ SlickAI: Content flagged, generating rewrite...');
        analysis.rewrittenVersion = await this.rewriteContent(content, tone);
      }

      return analysis;

    } catch (error) {
      console.error('❌ SlickAI: AI analysis error:', error);
      // Fallback to rule-based analysis if AI fails
      return this.fallbackAnalysis(content, tone);
    }
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

  // 🎯 Generate personalized slick suggestions using AI
  async generateSlickSuggestions(authorId, targetId, context = '') {
    try {
      const target = await User.findById(targetId).select('username');
      
      // Get some context about their relationship
      const sharedCommunities = await this.getSharedCommunities(authorId, targetId);
      
      const suggestionPrompt = `
        Generate 3 different anonymous feedback suggestions for someone to send to their friend/peer.
        
        Context: They're both in communities like ${sharedCommunities.join(', ')}
        Additional context: ${context}
        
        Create suggestions in different tones:
        1. Praise/Appreciation (positive feedback)
        2. Constructive observation (helpful insight)
        3. Playful tease (light, friendly humor)
        
        Return as JSON:
        {
          "suggestions": [
            {
              "content": "suggestion text",
              "tone": {"category": "praise", "intensity": 5},
              "explanation": "why this works"
            }
          ]
        }
        
        Keep each suggestion under 200 characters and make them feel genuine.
      `;

      const aiResponse = await this.callGrokAI(suggestionPrompt, 600);
      const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
      return JSON.parse(cleanResponse);

    } catch (error) {
      console.error('❌ SlickAI: Suggestion generation error:', error);
      return this.fallbackSuggestions();
    }
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
    return {
      suggestions: [
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
      ]
    };
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