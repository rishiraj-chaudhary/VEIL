/**
 * Manual PerformanceGraph trigger
 * Run: node trigger-performance-graph.js
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

// Register all models needed
await import('./src/models/User.js');
await import('./src/models/DebateTurn.js');
await import('./src/models/UserPerformance.js');
await import('./src/models/PersonaSnapshot.js');

await mongoose.connect(process.env.MONGODB_URI);
console.log('🔌 Connected\n');

const { default: performanceGraph } = await import('./src/services/graph/performanceGraph.js');

const users = [
  { id: '6967322f93434df248c2150b', name: 'Rishi' },
  { id: '6967da9fb99d7c7dc083f56c', name: 'demo' },
];

for (const user of users) {
  console.log(`\n🚀 Running PerformanceGraph for ${user.name} (${user.id})...`);
  try {
    const result = await performanceGraph.run(user.id, { persist: true });
    console.log(`✅ ${user.name} done:`);
    console.log(JSON.stringify({
      turnCount:       result.turnCount,
      skillProfile:    result.skillProfile,
      trend:           result.trend,
      skillDeltas:     result.skillDeltas,
      blindSpots:      result.blindSpots.length,
      coachingPlan:    result.coachingPlan ? { focusArea: result.coachingPlan.focusArea, drills: result.coachingPlan.drills.length } : null,
      newAchievements: result.newAchievements.map(a => a.name),
    }, null, 2));
  } catch (err) {
    console.error(`❌ ${user.name} failed:`, err.message);
  }
}

await mongoose.disconnect();
console.log('\n🔌 Done');