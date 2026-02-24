import dotenv from 'dotenv';
import mongoose from 'mongoose';
import debateAIService from './src/services/debateAIService.js';

dotenv.config();

async function testRAG() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Initialize RAG
    await debateAIService.initializeRAG();
    console.log('\n📊 RAG Initialization Complete\n');

    // Test 1: Analyze a turn with fallacy
    console.log('═══════════════════════════════════════');
    console.log('TEST 1: Turn with Ad Hominem Fallacy');
    console.log('═══════════════════════════════════════\n');

    const fallacyTurn = "You're clearly an idiot if you believe that. Anyone with half a brain can see you're wrong.";
    
    const result1 = await debateAIService.analyzeTurn(
      fallacyTurn,
      'for',
      [],
      'test-user-id',
      'test-debate-id',
      'free'
    );

    console.log('\n📊 Analysis Results:');
    console.log(`   Overall Quality: ${result1.overallQuality}/100`);
    console.log(`   Tone Score: ${result1.toneScore}/100`);
    console.log(`   Fallacies Detected: ${result1.fallacies.length}`);
    console.log(`   RAG Sources: ${result1.retrievedSources.length}`);
    
    if (result1.fallacies.length > 0) {
      console.log('\n   ⚠️  Fallacies Found:');
      result1.fallacies.forEach(f => {
        console.log(`      - ${f.type}: ${f.explanation}`);
      });
    }

    console.log('\n   🔍 RAG Retrieval:');
    console.log(`      Sources Retrieved: ${result1.retrievedSources.join(', ') || 'None'}`);

    // Test 2: Turn with evidence
    console.log('\n\n═══════════════════════════════════════');
    console.log('TEST 2: Turn with Evidence');
    console.log('═══════════════════════════════════════\n');

    const evidenceTurn = "According to peer-reviewed research published in Nature (2023), renewable energy costs have decreased by 89% over the past decade. Statistical data from the International Energy Agency shows that solar power is now cheaper than fossil fuels in most countries.";
    
    const result2 = await debateAIService.analyzeTurn(
      evidenceTurn,
      'for',
      [],
      'test-user-id',
      'test-debate-id',
      'free'
    );

    console.log('\n📊 Analysis Results:');
    console.log(`   Overall Quality: ${result2.overallQuality}/100`);
    console.log(`   Evidence Score: ${result2.evidenceQuality}/100`);
    console.log(`   Has Evidence: ${result2.evidenceAnalysis.hasEvidence}`);
    console.log(`   Evidence Verified: ${result2.evidenceAnalysis.verified}`);
    console.log(`   RAG Sources: ${result2.retrievedSources.length}`);

    // Test 3: Check Decision Trace
    console.log('\n\n═══════════════════════════════════════');
    console.log('TEST 3: Decision Trace (RAG Debug)');
    console.log('═══════════════════════════════════════\n');

    console.log('📋 Decision Trace Steps:');
    result2.decisionTrace.forEach((step, idx) => {
      if (typeof step === 'string') {
        console.log(`   ${idx + 1}. ${step}`);
      } else if (step.step) {
        console.log(`   ${idx + 1}. [${step.step}] ${step.message}`);
      }
    });

    // Test 4: Vector Store Stats
    console.log('\n\n═══════════════════════════════════════');
    console.log('TEST 4: Vector Store Stats');
    console.log('═══════════════════════════════════════\n');

    const stats = await debateAIService.vectorStore.getStats();
    console.log('📊 Vector Store Status:');
    console.log(`   Initialized: ${stats.initialized}`);
    console.log(`   Has Knowledge Store: ${stats.hasKnowledgeStore}`);
    console.log(`   Knowledge Items: ${stats.knowledgeCount}`);
    console.log(`   Memory Items: ${stats.memoryCount}`);

    // Test 5: Direct RAG Retrieval
    console.log('\n\n═══════════════════════════════════════');
    console.log('TEST 5: Direct RAG Retrieval');
    console.log('═══════════════════════════════════════\n');

    const knowledgeDocs = await debateAIService.vectorStore.retrieveKnowledge(
      "logical fallacy ad hominem attack",
      3
    );

    console.log(`📚 Retrieved ${knowledgeDocs.length} knowledge documents:`);
    knowledgeDocs.forEach((doc, idx) => {
      console.log(`\n   ${idx + 1}. ${doc.metadata?.type || 'unknown'} (similarity: ${doc.similarity?.toFixed(4)})`);
      console.log(`      ${doc.content.substring(0, 100)}...`);
    });

    const memoryDocs = await debateAIService.vectorStore.retrieveDebateMemory(
      "college education career",
      3
    );

    console.log(`\n\n💾 Retrieved ${memoryDocs.length} memory documents:`);
    memoryDocs.forEach((doc, idx) => {
      console.log(`\n   ${idx + 1}. ${doc.metadata?.topic || 'unknown'} (similarity: ${doc.similarity?.toFixed(4)})`);
      console.log(`      ${doc.content.substring(0, 100)}...`);
    });

    console.log('\n\n═══════════════════════════════════════');
    console.log('✅ All RAG Tests Complete!');
    console.log('═══════════════════════════════════════\n');

    await mongoose.disconnect();
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Test Error:', error);
    process.exit(1);
  }
}

testRAG();
