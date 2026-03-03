import dotenv from 'dotenv';
import mongoose from 'mongoose';
import DebateMemory from '../src/models/DebateMemory.js';
import KnowledgeItem from '../src/models/KnowledgeItem.js';
import embeddingService from '../src/services/embeddingService.js';

dotenv.config();

async function migrate() {
  try {
    console.log('🚀 Migrating to LangChain semantic embeddings...\n');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Initialize embedding service
    console.log('⚙️ Initializing OpenAI embeddings...');
    embeddingService.initialize();
    console.log('✅ Embeddings ready\n');
    
    // Option 1: Clear and reseed knowledge (recommended)
    console.log('🧹 Clearing old knowledge items...');
    const deletedKnowledge = await KnowledgeItem.deleteMany({});
    console.log(`✅ Deleted ${deletedKnowledge.deletedCount} old items\n`);
    
    console.log('📚 Knowledge will be reseeded with chunking on next server start\n');
    
    // Option 2: Migrate existing memory items
    console.log('🧠 Migrating debate memory...');
    const memoryItems = await DebateMemory.find();
    console.log(`   Found ${memoryItems.length} memory items\n`);
    
    if (memoryItems.length === 0) {
      console.log('⚠️ No memory items to migrate\n');
    } else {
      let updated = 0;
      let failed = 0;
      
      for (const item of memoryItems) {
        try {
          const content = item.content || item.text || '';
          
          if (!content || content.length === 0) {
            console.log(`   ⏭️ Skipping empty item: ${item._id}`);
            continue;
          }
          
          console.log(`   📝 "${content.substring(0, 50)}..."`);
          
          // Generate new embedding
          const embedding = await embeddingService.embedQuery(content);
          
          // Update item
          item.embedding = embedding;
          await item.save();
          
          updated++;
          console.log(`   ✅ Updated (${embedding.length}-d embedding)\n`);
          
        } catch (error) {
          failed++;
          console.error(`   ❌ Failed: ${error.message}\n`);
        }
      }
      
      console.log(`📊 Memory migration complete: ${updated} updated, ${failed} failed\n`);
    }
    
    // Summary
    console.log('═══════════════════════════════════════');
    console.log('🎉 Migration Complete!');
    console.log('═══════════════════════════════════════');
    console.log('✅ Old knowledge items cleared');
    console.log('✅ Knowledge will reseed with chunking');
    console.log(`✅ Memory items: ${memoryItems.length > 0 ? 'migrated' : 'none found'}`);
    console.log('═══════════════════════════════════════');
    console.log('\n🚀 Next step: Start your server with `npm run dev`\n');
    
    await mongoose.disconnect();
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error.stack);
    
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run migration
migrate();