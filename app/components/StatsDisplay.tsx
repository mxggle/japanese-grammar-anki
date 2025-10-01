'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { unifiedStorage } from '@/app/lib/unifiedStorage';
import type { UserStats as UnifiedUserStats, DailyStats as UnifiedDailyStats } from '@/app/lib/unifiedStorage';

const formatDuration = (seconds?: number | null): string => {
  if (!seconds || seconds <= 0) {
    return '0 分钟';
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);

  if (minutes < 1) {
    return '<1 分钟';
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${minutes} 分钟`;
  }

  if (remainingMinutes === 0) {
    return `${hours} 小时`;
  }

  return `${hours} 小时 ${remainingMinutes} 分钟`;
};

const formatDurationSummary = (seconds?: number | null): { value: string; unit: string } => {
  if (!seconds || seconds <= 0) {
    return { value: '0', unit: '分钟' };
  }

  const roundedSeconds = Math.round(seconds);
  const minutes = Math.floor(roundedSeconds / 60);

  if (minutes < 1) {
    return { value: '<1', unit: '分钟' };
  }

  if (minutes < 60) {
    return { value: `${minutes}`, unit: '分钟' };
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (remainingMinutes === 0) {
    return { value: `${hours}`, unit: '小时' };
  }

  return { value: `${hours}`, unit: `小时 ${remainingMinutes} 分` };
};

type DisplayUserStats = UnifiedUserStats & { lastStudyDate: string | null };
type DisplayDailyStats = UnifiedDailyStats & { currentStreak: number };

interface StatsDisplayProps {
  onClose: () => void;
}

export default function StatsDisplay({ onClose }: StatsDisplayProps) {
  const { user } = useUser();
  const [userStats, setUserStats] = useState<DisplayUserStats | null>(null);
  const [dailyStats, setDailyStats] = useState<DisplayDailyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState({ hasUnsyncedData: false, isOnline: true, syncInProgress: false });

  const totalDurationSummary = formatDurationSummary(userStats?.totalStudyTime);
  const averageDailyDurationText = formatDuration(userStats?.studyTimePerDay);

  useEffect(() => {
    if (user) {
      unifiedStorage.setUserId(user.id);
      loadStats();

      // Update sync status periodically
      const syncStatusInterval = setInterval(() => {
        setSyncStatus(unifiedStorage.getSyncStatus());
      }, 2000);

      return () => clearInterval(syncStatusInterval);
    } else {
      // User is not logged in, show appropriate message
      setError('Please sign in to view your statistics');
      setLoading(false);
    }
  }, [user]);

  const loadStats = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to get from unified storage (combines local + server)
      const localUserStats = await unifiedStorage.getUserStats();
      const localDailyStats = await unifiedStorage.getDailyStats(7);

      if (localUserStats) {
        // Convert local stats to match UserStats interface
        const accuracy = unifiedStorage.getAccuracy();
        const cardsPerDay = unifiedStorage.getCardsPerDay();
        const studyTimePerDay = unifiedStorage.getStudyTimePerDay();

        const enhancedStats: DisplayUserStats = {
          ...localUserStats,
          averageAccuracy: accuracy,
          totalSessions: localUserStats.totalSessions ?? 0,
          cardsPerDay: cardsPerDay,
          studyTimePerDay: studyTimePerDay,
          masteredCards: localUserStats.masteredCards ?? 0,
          difficultyCards: localUserStats.difficultyCards ?? 0,
          lastStudyDate: localUserStats.lastStudyDate ?? null
        };
        setUserStats(enhancedStats);

        // Convert local daily stats to match DailyStats interface
        const enhancedDailyStats = localDailyStats.map(day => ({
          ...day,
          currentStreak: localUserStats?.currentStreak || 0
        })) as DisplayDailyStats[];
        setDailyStats(enhancedDailyStats);
      }

      // Try to sync with server in background
      try {
        await unifiedStorage.syncWithServer();

        // Try to download fresh data from server
        const downloaded = await unifiedStorage.downloadFromServer();
        if (downloaded) {
          // Refresh local data after server sync
          const updatedStats = await unifiedStorage.getUserStats();
          const updatedDailyStats = await unifiedStorage.getDailyStats(7);

          if (updatedStats) {
            const accuracy = unifiedStorage.getAccuracy();
            const cardsPerDay = unifiedStorage.getCardsPerDay();
            const studyTimePerDay = unifiedStorage.getStudyTimePerDay();

            const enhancedStats: DisplayUserStats = {
              ...updatedStats,
              averageAccuracy: accuracy,
              totalSessions: updatedStats.totalSessions ?? 0,
              cardsPerDay: cardsPerDay,
              studyTimePerDay: studyTimePerDay,
              masteredCards: updatedStats.masteredCards ?? 0,
              difficultyCards: updatedStats.difficultyCards ?? 0,
              lastStudyDate: updatedStats.lastStudyDate ?? null
            };
            setUserStats(enhancedStats);

            const enhancedDailyStats = updatedDailyStats.map(day => ({
              ...day,
              currentStreak: updatedStats?.currentStreak || 0
            })) as DisplayDailyStats[];
            setDailyStats(enhancedDailyStats);
          }
        }
      } catch (syncError) {
        console.warn('Background sync failed:', syncError);
        // Continue with local data
      }

    } catch (error) {
      console.error('Error loading stats:', error);
      setError('Failed to load statistics. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-indigo-700">Loading statistics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📊</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Sign In Required</h2>
          <p className="text-gray-600 mb-6">
            Please sign in to view your learning statistics and progress tracking.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/sign-in'}
              className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
            >
              Sign In to View Stats
            </button>
            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50">
      {/* Header with gradient design similar to home page */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-400 via-yellow-400 to-orange-400 opacity-90"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="w-full h-full bg-gradient-to-br from-transparent via-white/10 to-transparent"></div>
        </div>
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-3 hover:bg-amber-100/50 rounded-xl transition-colors border border-amber-200/50 backdrop-blur-sm bg-amber-50/50"
              >
                <svg className="w-6 h-6 text-amber-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <div className="inline-flex items-center gap-2 mb-2 px-3 py-1 bg-amber-100/80 backdrop-blur-sm rounded-full border border-amber-200/50 shadow-md">
                  <span className="text-xl">📊</span>
                  <span className="text-sm font-medium text-amber-800">学习统计</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-bold text-amber-900 drop-shadow-sm">学习进度报告</h1>
                <p className="text-amber-700 text-sm md:text-base">追踪你的日语语法学习进度和成果</p>
              </div>
            </div>
            <div className="text-right">
              <div className="bg-amber-100/80 backdrop-blur-sm rounded-lg p-3 border border-amber-200/50 shadow-md">
                <p className="text-xs text-amber-700">当前用户</p>
                <p className="font-medium text-amber-900">{user?.firstName || user?.emailAddresses[0]?.emailAddress}</p>

                {/* Sync Status Indicator */}
                <div className="flex items-center gap-1 mt-2">
                  {syncStatus.syncInProgress ? (
                    <>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-blue-700">同步中...</span>
                    </>
                  ) : syncStatus.hasUnsyncedData ? (
                    <>
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <span className="text-xs text-orange-700">待同步</span>
                    </>
                  ) : syncStatus.isOnline ? (
                    <>
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-green-700">已同步</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-gray-500 rounded-full"></div>
                      <span className="text-xs text-gray-700">离线</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {/* Overview Cards with sticky note style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          <div className="group bg-yellow-200 rounded-xl p-6 shadow-xl hover:shadow-2xl border-l-6 border-yellow-400 transition-all duration-500 hover:scale-105 rotate-1 hover:rotate-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-yellow-700 mb-2">累计学习卡片</p>
                <p className="text-4xl font-bold text-yellow-900 mb-1">{userStats?.totalCardsStudied || 0}</p>
                <p className="text-yellow-600 text-xs">张卡片</p>
              </div>
              <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">📚</span>
              </div>
            </div>
          </div>

          <div className="group bg-green-200 rounded-xl p-6 shadow-xl hover:shadow-2xl border-l-6 border-green-400 transition-all duration-500 hover:scale-105 -rotate-1 hover:rotate-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-700 mb-2">正确率</p>
                <p className="text-4xl font-bold text-green-900 mb-1">{userStats?.averageAccuracy?.toFixed(1) || 0}<span className="text-2xl">%</span></p>
                <p className="text-green-600 text-xs">准确度</p>
              </div>
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">🎯</span>
              </div>
            </div>
          </div>

          <div className="group bg-orange-200 rounded-xl p-6 shadow-xl hover:shadow-2xl border-l-6 border-orange-400 transition-all duration-500 hover:scale-105 rotate-2 hover:rotate-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-orange-700 mb-2">连续学习</p>
                <p className="text-4xl font-bold text-orange-900 mb-1">{userStats?.currentStreak || 0}<span className="text-xl ml-1">天</span></p>
                <p className="text-orange-600 text-xs">当前连击</p>
              </div>
              <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">🔥</span>
              </div>
            </div>
          </div>

          <div className="group bg-purple-200 rounded-xl p-6 shadow-xl hover:shadow-2xl border-l-6 border-purple-400 transition-all duration-500 hover:scale-105 -rotate-2 hover:rotate-0">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-700 mb-2">学习时长</p>
                <p className="text-4xl font-bold text-purple-900 mb-1">
                  {totalDurationSummary.value}
                  <span className="text-xl ml-1">{totalDurationSummary.unit}</span>
                </p>
                <p className="text-purple-600 text-xs">总时长</p>
              </div>
              <div className="w-16 h-16 bg-purple-500/20 rounded-full flex items-center justify-center transform group-hover:scale-110 transition-transform duration-300">
                <span className="text-3xl">⏱️</span>
              </div>
            </div>
          </div>
        </div>

        {/* Detailed Statistics with sticky note style */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-12">
          {/* Learning Progress */}
          <div className="bg-blue-200 rounded-xl p-8 shadow-xl border-l-6 border-blue-400 rotate-1 hover:rotate-0 transition-all duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">📈</span>
              </div>
              <h3 className="text-2xl font-bold text-blue-900">学习进度详情</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-blue-100/70 rounded-lg">
                <span className="text-blue-800 font-medium">学习会话</span>
                <span className="font-bold text-blue-900 text-lg">{userStats?.totalSessions || 0} 次</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-100/70 rounded-lg">
                <span className="text-blue-800 font-medium">日均卡片</span>
                <span className="font-bold text-blue-900 text-lg">{userStats?.cardsPerDay?.toFixed(1) || 0} 张</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-100/70 rounded-lg">
                <span className="text-blue-800 font-medium">日均时长</span>
                <span className="font-bold text-blue-900 text-lg">{averageDailyDurationText}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-blue-100/70 rounded-lg">
                <span className="text-blue-800 font-medium">最长连击</span>
                <span className="font-bold text-blue-900 text-lg">{userStats?.longestStreak || 0} 天</span>
              </div>
            </div>
          </div>

          {/* Mastery Levels */}
          <div className="bg-pink-200 rounded-xl p-8 shadow-xl border-l-6 border-pink-400 -rotate-1 hover:rotate-0 transition-all duration-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 bg-pink-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xl">🏆</span>
              </div>
              <h3 className="text-2xl font-bold text-pink-900">掌握程度分析</h3>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-pink-100/70 rounded-lg">
                <span className="text-pink-800 font-medium">已掌握卡片</span>
                <span className="font-bold text-green-700 text-lg">{userStats?.masteredCards || 0} 张</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-pink-100/70 rounded-lg">
                <span className="text-pink-800 font-medium">困难卡片</span>
                <span className="font-bold text-red-700 text-lg">{userStats?.difficultyCards || 0} 张</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-pink-100/70 rounded-lg">
                <span className="text-pink-800 font-medium">正确回答</span>
                <span className="font-bold text-green-700 text-lg">{userStats?.totalCorrectAnswers || 0} 次</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-pink-100/70 rounded-lg">
                <span className="text-pink-800 font-medium">错误回答</span>
                <span className="font-bold text-red-700 text-lg">{userStats?.totalIncorrectAnswers || 0} 次</span>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity with sticky note style */}
        <div className="bg-lime-200 rounded-xl p-8 shadow-xl border-l-6 border-lime-400 rotate-2 hover:rotate-0 transition-all duration-500">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-lime-500 rounded-full flex items-center justify-center">
              <span className="text-white text-xl">📅</span>
            </div>
            <h3 className="text-2xl font-bold text-lime-900">最近7天活动记录</h3>
          </div>
          {dailyStats.length > 0 ? (
            <div className="overflow-x-auto bg-lime-100/70 rounded-lg">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-lime-300">
                    <th className="text-left py-4 px-4 font-bold text-lime-800">日期</th>
                    <th className="text-left py-4 px-4 font-bold text-lime-800">卡片数</th>
                    <th className="text-left py-4 px-4 font-bold text-lime-800">正确/错误</th>
                    <th className="text-left py-4 px-4 font-bold text-lime-800">会话</th>
                    <th className="text-left py-4 px-4 font-bold text-lime-800">时长</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyStats.slice(0, 7).map((day, index) => (
                    <tr key={index} className="border-b border-lime-200 hover:bg-lime-50 transition-colors">
                      <td className="py-3 px-4 text-lime-900 font-medium">{new Date(day.date).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-lime-900 font-bold">{day.cardsStudied}</td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1">
                          <span className="text-green-700 font-bold">{day.correctAnswers}</span>
                          <span className="text-lime-600">/</span>
                          <span className="text-red-700 font-bold">{day.incorrectAnswers}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 text-lime-900 font-bold">{day.sessionsCount}</td>
                    <td className="py-3 px-4 text-lime-900 font-bold">{formatDuration(day.studyTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          ) : (
            <div className="text-center py-12 bg-lime-100/70 rounded-lg">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-lime-700 text-lg font-medium mb-2">还没有最近的活动数据</p>
              <p className="text-lime-600">开始学习后，这里会显示你的进度记录！</p>
            </div>
          )}
        </div>

        {/* Last Study Session with sticky note style */}
        {userStats?.lastStudyDate && (
          <div className="mt-8 bg-teal-200 rounded-xl p-6 shadow-xl border-l-6 border-teal-400 -rotate-1 hover:rotate-0 transition-all duration-500">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-500 rounded-full flex items-center justify-center">
                <span className="text-white text-lg">⏰</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-teal-900 mb-1">上次学习时间</h3>
                <p className="text-teal-700 font-medium">
                  {new Date(userStats.lastStudyDate).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
