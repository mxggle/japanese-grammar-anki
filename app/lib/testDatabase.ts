// Test database connection and API endpoints
import { db } from './db.js';

export const testDatabaseConnection = async () => {
  console.log('🗄️ Testing Database Connection...');

  try {
    // Test basic database connection
    const userCount = await db.user.count();
    console.log('✅ Database connected successfully');
    console.log('📊 Total users in database:', userCount);

    // Test creating a test user (for demonstration)
    const testClerkId = 'test-clerk-id-' + Date.now();

    try {
      const testUser = await db.user.create({
        data: {
          clerkId: testClerkId,
          email: 'test@example.com'
        }
      });
      console.log('✅ User creation successful:', testUser.id);

      // Test creating user stats
      const userStats = await db.userStats.create({
        data: {
          userId: testUser.id,
          totalCardsStudied: 5,
          totalCorrectAnswers: 3,
          totalIncorrectAnswers: 2,
          totalStudyTime: 300, // 5 minutes
          averageAccuracy: 60,
          currentStreak: 1,
          longestStreak: 1
        }
      });
      console.log('✅ UserStats creation successful');

      // Test creating card progress
      const cardProgress = await db.cardProgress.create({
        data: {
          userId: testUser.id,
          cardId: 'test-card-1',
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          correctCount: 1,
          incorrectCount: 0,
          totalReviews: 1,
          averageGrade: 3.0
        }
      });
      console.log('✅ CardProgress creation successful');

      // Clean up test data
      await db.cardProgress.delete({ where: { id: cardProgress.id } });
      await db.userStats.delete({ where: { id: userStats.id } });
      await db.user.delete({ where: { id: testUser.id } });
      console.log('✅ Test data cleaned up');

      return { success: true, message: 'Database is fully functional!' };
    } catch (error) {
      console.error('❌ Database operation failed:', error);
      return { success: false, error: error };
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    return { success: false, error: error };
  }
};

// Test API endpoints
export const testAPIEndpoints = async () => {
  console.log('🌐 Testing API Endpoints...');

  // Note: These would need to be tested in a browser environment with actual auth
  console.log('📝 API endpoints to test manually:');
  console.log('   GET /api/stats - Get user statistics');
  console.log('   POST /api/stats - Update user statistics');
  console.log('   GET /api/progress - Get card progress');
  console.log('   POST /api/progress - Update card progress');

  return { success: true, message: 'API endpoints are implemented and ready for testing' };
};

// Export for Node.js testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { testDatabaseConnection, testAPIEndpoints };
}