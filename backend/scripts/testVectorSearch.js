import dotenv from 'dotenv';
import vectorStoreService from '../src/services/vectorStoreService.js';

dotenv.config();

async function test() {
  console.log('🧪 Testing MongoDB Atlas Vector Search...\n');

  try {
    await vectorStoreService.initialize();
    
    const query = 'What is ad hominem fallacy?';
    const results = await vectorStoreService.retrieveKnowledge(query, 3);
    
    console.log(`\n✅ Retrieved ${results.length} documents:`);
    results.forEach((doc, i) => {
      console.log(`\n${i + 1}. [${doc.category}/${doc.type}]`);
      console.log(`   ${doc.text?.substring(0, 100)}...`);
    });

    const stats = await vectorStoreService.getStats();
    console.log('\n📊 Stats:', stats);

    console.log('\n🎉 Vector search working!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
  } finally {
    await vectorStoreService.close();
    process.exit(0);
  }
}

test();