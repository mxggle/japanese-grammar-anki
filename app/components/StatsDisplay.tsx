'use client';

import { useState, useEffect } from 'react';

interface StudyStats {
  totalStudied: number;
  studiedToday: number;
  streak: number;
  averageGrade: number;
  totalReviews: number;
  lastStudyDate: string;
}

interface StatsDisplayProps {
  onClose: () => void;
}

export default function StatsDisplay({ onClose }: StatsDisplayProps) {
  const [stats, setStats] = useState<StudyStats>({
    totalStudied: 0,
    studiedToday: 0,
    streak: 0,
    averageGrade: 0,
    totalReviews: 0,
    lastStudyDate: ''
  });

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = () => {
    // Load from localStorage
    const stored = localStorage.getItem('studyStats');
    if (stored) {
      setStats(JSON.parse(stored));
    }
  };

  const resetStats = () => {
    if (confirm('Are you sure you want to reset all statistics?')) {
      const emptyStats = {
        totalStudied: 0,
        studiedToday: 0,
        streak: 0,
        averageGrade: 0,
        totalReviews: 0,
        lastStudyDate: ''
      };
      setStats(emptyStats);
      localStorage.setItem('studyStats', JSON.stringify(emptyStats));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="flex justify-between items-center">
          <button
            onClick={onClose}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            ← Back to Menu
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Study Statistics</h1>
          <button
            onClick={resetStats}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            Reset Stats
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="max-w-4xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Total Studied */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {stats.totalStudied}
                </div>
                <div className="text-gray-600">Total Cards Studied</div>
              </div>
              <div className="text-3xl">📚</div>
            </div>
          </div>

          {/* Studied Today */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {stats.studiedToday}
                </div>
                <div className="text-gray-600">Studied Today</div>
              </div>
              <div className="text-3xl">📅</div>
            </div>
          </div>

          {/* Current Streak */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-orange-600">
                  {stats.streak}
                </div>
                <div className="text-gray-600">Day Streak</div>
              </div>
              <div className="text-3xl">🔥</div>
            </div>
          </div>

          {/* Average Grade */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-purple-600">
                  {stats.averageGrade.toFixed(1)}
                </div>
                <div className="text-gray-600">Average Grade</div>
              </div>
              <div className="text-3xl">⭐</div>
            </div>
          </div>

          {/* Total Reviews */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {stats.totalReviews}
                </div>
                <div className="text-gray-600">Total Reviews</div>
              </div>
              <div className="text-3xl">🔄</div>
            </div>
          </div>

          {/* Last Study Date */}
          <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-gray-700">
                  {stats.lastStudyDate || 'Never'}
                </div>
                <div className="text-gray-600">Last Study</div>
              </div>
              <div className="text-3xl">🕒</div>
            </div>
          </div>
        </div>

        {/* Progress Chart Placeholder */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Study Progress</h3>
          <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
            <div className="text-center text-gray-500">
              <div className="text-4xl mb-4">📊</div>
              <div>Progress charts coming soon!</div>
              <div className="text-sm mt-2">
                Track your daily study habits and improvement over time
              </div>
            </div>
          </div>
        </div>

        {/* Grade Distribution */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200 mb-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Performance Distribution</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-2xl font-bold text-red-600">0</div>
              <div className="text-sm text-gray-600">Again</div>
              <div className="text-xs text-gray-500">Need more practice</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">0</div>
              <div className="text-sm text-gray-600">Hard</div>
              <div className="text-xs text-gray-500">Challenging</div>
            </div>
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">0</div>
              <div className="text-sm text-gray-600">Good</div>
              <div className="text-xs text-gray-500">Standard difficulty</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">0</div>
              <div className="text-sm text-gray-600">Easy</div>
              <div className="text-xs text-gray-500">Well mastered</div>
            </div>
          </div>
        </div>

        {/* Study Tips */}
        <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
          <h3 className="text-xl font-bold text-gray-800 mb-4">💡 Study Tips</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="text-green-600">✅</div>
              <div>
                <div className="font-semibold">Consistency is key</div>
                <div className="text-sm text-gray-600">
                  Study a little bit every day rather than cramming
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="text-green-600">✅</div>
              <div>
                <div className="font-semibold">Review before forgetting</div>
                <div className="text-sm text-gray-600">
                  The spaced repetition algorithm helps you review at optimal times
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="text-green-600">✅</div>
              <div>
                <div className="font-semibold">Be honest with grades</div>
                <div className="text-sm text-gray-600">
                  Accurate self-assessment leads to better learning outcomes
                </div>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <div className="text-green-600">✅</div>
              <div>
                <div className="font-semibold">Focus on understanding</div>
                <div className="text-sm text-gray-600">
                  Don&apos;t just memorize - understand the grammar patterns and their usage
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}