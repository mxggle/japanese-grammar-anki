// Test script to verify all statistical metrics are properly recorded
// This can be run in the browser console to test the storage system

export const testStatisticalMetrics = async () => {
  console.log('🧪 Testing Statistical Metrics Recording...');

  // Import the unified storage
  const { unifiedStorage } = await import('./unifiedStorage');

  // Set a test user ID
  const testUserId = 'test-user-' + Date.now();
  unifiedStorage.setUserId(testUserId);

  console.log('📊 Testing with user ID:', testUserId);

  // Test 1: Record some card progress
  console.log('\n1️⃣ Testing card progress recording...');

  const testCards = [
    { id: 'card-1', grade: 3, studyTime: 10 }, // Correct answer
    { id: 'card-2', grade: 1, studyTime: 15 }, // Incorrect answer
    { id: 'card-3', grade: 2, studyTime: 8 },  // Correct answer
    { id: 'card-4', grade: 0, studyTime: 20 }, // Incorrect answer
    { id: 'card-5', grade: 3, studyTime: 12 }, // Correct answer
  ];

  for (const card of testCards) {
    await unifiedStorage.saveCardProgress(
      card.id,
      card.grade,
      card.studyTime
    );
    console.log(`   ✅ Recorded card ${card.id}: grade=${card.grade}, time=${card.studyTime}s`);
  }

  // Test 2: Verify user stats
  console.log('\n2️⃣ Testing user stats retrieval...');

  const userStats = await unifiedStorage.getUserStats();
  if (userStats) {
    console.log('   📈 Total Cards Studied:', userStats.totalCardsStudied);
    console.log('   ✅ Correct Answers:', userStats.totalCorrectAnswers);
    console.log('   ❌ Incorrect Answers:', userStats.totalIncorrectAnswers);
    console.log('   ⏱️ Total Study Time:', userStats.totalStudyTime, 'seconds');
    console.log('   🔥 Current Streak:', userStats.currentStreak);
    console.log('   🏆 Longest Streak:', userStats.longestStreak);
    console.log('   📅 Last Study Date:', userStats.lastStudyDate);
    console.log('   🎯 First Study Date:', userStats.firstStudyDate);
  } else {
    console.error('   ❌ Failed to retrieve user stats');
  }

  // Test 3: Verify calculated metrics
  console.log('\n3️⃣ Testing calculated metrics...');

  const accuracy = unifiedStorage.getAccuracy();
  const cardsPerDay = unifiedStorage.getCardsPerDay();
  const studyTimePerDay = unifiedStorage.getStudyTimePerDay();
  const todayCount = unifiedStorage.getTodayStudiedCount();

  console.log('   🎯 Accuracy Rate:', accuracy.toFixed(1) + '%');
  console.log('   📊 Cards Per Day:', cardsPerDay.toFixed(1));
  console.log('   ⏰ Study Time Per Day:', studyTimePerDay.toFixed(1), 'seconds');
  console.log('   📝 Today\'s Study Count:', todayCount);

  // Test 4: Verify daily stats
  console.log('\n4️⃣ Testing daily stats...');

  const dailyStats = await unifiedStorage.getDailyStats(7);
  console.log('   📅 Daily Stats for last 7 days:', dailyStats.length, 'entries');

  if (dailyStats.length > 0) {
    const today = dailyStats[0];
    console.log('   Today\'s stats:');
    console.log('     - Cards Studied:', today.cardsStudied);
    console.log('     - Correct Answers:', today.correctAnswers);
    console.log('     - Incorrect Answers:', today.incorrectAnswers);
    console.log('     - Study Time:', today.studyTime, 'seconds');
    console.log('     - Sessions Count:', today.sessionsCount);
  }

  // Test 5: Verify sync status
  console.log('\n5️⃣ Testing sync status...');

  const syncStatus = unifiedStorage.getSyncStatus();
  console.log('   🌐 Online:', syncStatus.isOnline);
  console.log('   📤 Has Unsynced Data:', syncStatus.hasUnsyncedData);
  console.log('   🔄 Sync In Progress:', syncStatus.syncInProgress);

  // Test 6: Verify expected calculations
  console.log('\n6️⃣ Verifying calculations...');

  const expectedCorrect = testCards.filter(c => c.grade >= 2).length;
  const expectedIncorrect = testCards.filter(c => c.grade < 2).length;
  const expectedTotal = testCards.length;
  const expectedStudyTime = testCards.reduce((sum, c) => sum + c.studyTime, 0);
  const expectedAccuracy = (expectedCorrect / expectedTotal) * 100;

  console.log('   Expected vs Actual:');
  console.log('   📊 Total Cards:', expectedTotal, 'vs', userStats?.totalCardsStudied);
  console.log('   ✅ Correct:', expectedCorrect, 'vs', userStats?.totalCorrectAnswers);
  console.log('   ❌ Incorrect:', expectedIncorrect, 'vs', userStats?.totalIncorrectAnswers);
  console.log('   ⏱️ Study Time:', expectedStudyTime, 'vs', userStats?.totalStudyTime);
  console.log('   🎯 Accuracy:', expectedAccuracy.toFixed(1) + '%', 'vs', accuracy.toFixed(1) + '%');

  // Verification
  const isCorrect =
    userStats?.totalCardsStudied === expectedTotal &&
    userStats?.totalCorrectAnswers === expectedCorrect &&
    userStats?.totalIncorrectAnswers === expectedIncorrect &&
    userStats?.totalStudyTime === expectedStudyTime &&
    Math.abs(accuracy - expectedAccuracy) < 0.1;

  console.log('\n🎉 Test Result:', isCorrect ? '✅ ALL METRICS CORRECT' : '❌ SOME METRICS INCORRECT');

  return {
    passed: isCorrect,
    userStats,
    dailyStats,
    syncStatus,
    calculated: {
      accuracy,
      cardsPerDay,
      studyTimePerDay,
      todayCount
    }
  };
};

// Export for browser console testing
if (typeof window !== 'undefined') {
  const globalWindow = window as typeof window & {
    testStatisticalMetrics?: typeof testStatisticalMetrics;
  };
  globalWindow.testStatisticalMetrics = testStatisticalMetrics;
  console.log('🧪 Test function available as window.testStatisticalMetrics()');
}
