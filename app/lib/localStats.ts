'use client';

import type { AnkiCardState } from './srs/ankiScheduler';

interface UserProgress {
  cardId: string;
  grade: number;
  timestamp: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  status: AnkiCardState['status'];
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech: boolean;
  nextReview?: string | null;
}

export type LocalUserProgress = UserProgress;

interface DailyStats {
  date: string;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  sessionsCount: number;
  newCardsLearned?: number;
  reviewsCompleted?: number;
  currentStreak?: number;
  longestStreak?: number;
}

interface UserStats {
  totalCardsStudied: number;
  totalCorrectAnswers: number;
  totalIncorrectAnswers: number;
  totalStudyTime: number;
  totalSessions: number; // Add sessions tracking
  masteredCards: number; // Add mastered cards tracking
  difficultyCards: number; // Add difficulty cards tracking
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  firstStudyDate: string | null; // Add to track when user started
  averageAccuracy?: number;
  cardsPerDay?: number;
  studyTimePerDay?: number;
}

class LocalStatsManager {
  private userId: string | null = null;

  private createEmptyUserStats(referenceDate: string): UserStats {
    return {
      totalCardsStudied: 0,
      totalCorrectAnswers: 0,
      totalIncorrectAnswers: 0,
      totalStudyTime: 0,
      totalSessions: 0,
      masteredCards: 0,
      difficultyCards: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
      firstStudyDate: referenceDate,
      averageAccuracy: 0,
      cardsPerDay: 0,
      studyTimePerDay: 0
    };
  }

  private createEmptyDailyStats(date: string): DailyStats {
    return {
      date,
      cardsStudied: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      studyTime: 0,
      sessionsCount: 0,
      newCardsLearned: 0,
      reviewsCompleted: 0
    };
  }

  setUserId(userId: string) {
    this.userId = userId;
  }

  // Start a new study session
  startSession() {
    if (!this.userId) return;

    const key = `user_stats_${this.userId}`;
    const existing = localStorage.getItem(key);
    const today = new Date().toISOString().split('T')[0];

    const userStats: UserStats = existing ? JSON.parse(existing) : this.createEmptyUserStats(today);

    userStats.totalSessions++;

    // Also increment daily session count
    this.updateDailySessionCount();

    localStorage.setItem(key, JSON.stringify(userStats));
  }

  // Update daily session count
  private updateDailySessionCount() {
    if (!this.userId) return;

    const today = new Date().toISOString().split('T')[0];
    const key = `daily_${this.userId}_${today}`;

    const existing = localStorage.getItem(key);
    const dailyStats: DailyStats = existing ? JSON.parse(existing) : this.createEmptyDailyStats(today);

    dailyStats.sessionsCount++;
    localStorage.setItem(key, JSON.stringify(dailyStats));
  }

  // Save card progress locally with study time tracking
  saveCardProgress(
    cardId: string,
    grade: number,
    progressData: AnkiCardState,
    studyTimeSeconds: number = 0,
    options?: { learnedNewCard?: boolean; isReviewCard?: boolean }
  ) {
    if (!this.userId) return;

    const progress: UserProgress = {
      cardId,
      grade,
      timestamp: new Date().toISOString(),
      interval: progressData.interval,
      easeFactor: progressData.easeFactor,
      repetitions: progressData.repetitions,
      status: progressData.status,
      stepIndex: progressData.stepIndex,
      lapses: progressData.lapses,
      previousInterval: progressData.previousInterval,
      isLeech: progressData.isLeech,
      nextReview: progressData.nextReview ?? null
    };

    // Save individual card progress
    const key = `progress_${this.userId}_${cardId}`;
    localStorage.setItem(key, JSON.stringify(progress));

    // Update daily stats with study time
    this.updateDailyStats(grade, studyTimeSeconds, options);

    // Update overall stats with study time
    this.updateUserStats(grade, studyTimeSeconds);

    // Update card difficulty tracking
    this.updateCardDifficulty(cardId, progressData.easeFactor);
  }

  // Update daily statistics
  private updateDailyStats(
    grade: number,
    studyTimeSeconds: number = 0,
    options?: { learnedNewCard?: boolean; isReviewCard?: boolean }
  ) {
    if (!this.userId) return;

    const today = new Date().toISOString().split('T')[0];
    const key = `daily_${this.userId}_${today}`;

    const existing = localStorage.getItem(key);
    const dailyStats: DailyStats = existing ? JSON.parse(existing) : {
      date: today,
      cardsStudied: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      studyTime: 0,
      sessionsCount: 0,
      newCardsLearned: 0,
      reviewsCompleted: 0
    };

    dailyStats.cardsStudied++;
    dailyStats.studyTime += studyTimeSeconds;
    if (grade >= 2) {
      dailyStats.correctAnswers++;
    } else {
      dailyStats.incorrectAnswers++;
    }

    if (options?.learnedNewCard) {
      dailyStats.newCardsLearned = (dailyStats.newCardsLearned ?? 0) + 1;
    }

    if (options?.isReviewCard) {
      dailyStats.reviewsCompleted = (dailyStats.reviewsCompleted ?? 0) + 1;
    }

    localStorage.setItem(key, JSON.stringify(dailyStats));
  }

  // Update overall user statistics
  private updateUserStats(grade: number, studyTimeSeconds: number = 0) {
    if (!this.userId) return;

    const key = `user_stats_${this.userId}`;
    const existing = localStorage.getItem(key);
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString(); // Full timestamp

    const userStats: UserStats = existing ? JSON.parse(existing) : this.createEmptyUserStats(today);

    // Set first study date if not set
    if (!userStats.firstStudyDate) {
      userStats.firstStudyDate = today;
    }

    userStats.totalCardsStudied++;
    userStats.totalStudyTime += studyTimeSeconds;
    if (grade >= 2) {
      userStats.totalCorrectAnswers++;
    } else {
      userStats.totalIncorrectAnswers++;
    }

    // Update streak before setting last study date
    this.updateStreak(userStats, today);
    userStats.lastStudyDate = now; // Store full timestamp

    localStorage.setItem(key, JSON.stringify(userStats));
  }

  // Calculate and update study streak
  private updateStreak(userStats: UserStats, today: string) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // Convert lastStudyDate to date string for comparison
    const lastStudyDateStr = userStats.lastStudyDate
      ? userStats.lastStudyDate.split('T')[0]
      : null;

    // If this is the first time studying today
    if (lastStudyDateStr !== today) {
      if (lastStudyDateStr === yesterdayStr) {
        // Consecutive day - increment streak
        userStats.currentStreak++;
      } else if (lastStudyDateStr === null || lastStudyDateStr === today) {
        // First day ever or same day - start streak at 1
        userStats.currentStreak = 1;
      } else {
        // Broke the streak - reset to 1
        userStats.currentStreak = 1;
      }

      if (userStats.currentStreak > userStats.longestStreak) {
        userStats.longestStreak = userStats.currentStreak;
      }
    }
    // If already studied today, don't change streak
  }

  // Get user statistics
  getUserStats(): UserStats | null {
    if (!this.userId) return null;

    const key = `user_stats_${this.userId}`;
    const existing = localStorage.getItem(key);
    return existing ? JSON.parse(existing) : null;
  }

  // Get daily statistics for recent days
  getDailyStats(days: number = 7): DailyStats[] {
    if (!this.userId) return [];

    const stats: DailyStats[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const key = `daily_${this.userId}_${dateStr}`;
      const existing = localStorage.getItem(key);

      if (existing) {
        stats.push(JSON.parse(existing));
      }
    }

    return stats.reverse(); // Most recent first
  }

  setUserStats(stats: Partial<UserStats>) {
    if (!this.userId) return;

    const key = `user_stats_${this.userId}`;
    const existing = this.getUserStats();
    const today = new Date().toISOString().split('T')[0];
    const base = existing ?? this.createEmptyUserStats(today);

    const updated: UserStats = {
      ...base,
      ...stats,
      firstStudyDate: stats.firstStudyDate ?? base.firstStudyDate ?? today,
      lastStudyDate: stats.lastStudyDate ?? base.lastStudyDate ?? null,
      averageAccuracy: stats.averageAccuracy ?? base.averageAccuracy ?? 0,
      cardsPerDay: stats.cardsPerDay ?? base.cardsPerDay ?? 0,
      studyTimePerDay: stats.studyTimePerDay ?? base.studyTimePerDay ?? 0
    };

    localStorage.setItem(key, JSON.stringify(updated));
  }

  setDailyStats(entries: Array<Partial<DailyStats> & { date: string }>) {
    if (!this.userId || entries.length === 0) return;

    let earliestDate: string | null = null;

    for (const entry of entries) {
      const date = entry.date;
      if (!date) continue;

      const key = `daily_${this.userId}_${date}`;
      const existing = localStorage.getItem(key);
      const base = existing ? JSON.parse(existing) as DailyStats : this.createEmptyDailyStats(date);
      const updated: DailyStats = {
        ...base,
        ...entry
      };
      localStorage.setItem(key, JSON.stringify(updated));

       if (!earliestDate || date < earliestDate) {
         earliestDate = date;
       }
    }

    if (earliestDate) {
      const stats = this.getUserStats();
      if (stats && !stats.firstStudyDate) {
        this.setUserStats({ firstStudyDate: earliestDate });
      }
    }
  }

  // Calculate accuracy
  getAccuracy(): number {
    const stats = this.getUserStats();
    if (!stats) return 0;

    const total = stats.totalCorrectAnswers + stats.totalIncorrectAnswers;
    return total > 0 ? (stats.totalCorrectAnswers / total) * 100 : 0;
  }

  // Get card progress
  getCardProgress(cardId: string): LocalUserProgress | null {
    if (!this.userId) return null;

    const key = `progress_${this.userId}_${cardId}`;
    const existing = localStorage.getItem(key);
    return existing ? JSON.parse(existing) : null;
  }

  // Get today's studied count
  getTodayStudiedCount(): number {
    if (!this.userId) return 0;

    const today = new Date().toISOString().split('T')[0];
    const key = `daily_${this.userId}_${today}`;
    const existing = localStorage.getItem(key);

    if (existing) {
      const dailyStats: DailyStats = JSON.parse(existing);
      return dailyStats.cardsStudied;
    }

    return 0;
  }

  // Calculate cards per day based on actual days since start
  getCardsPerDay(): number {
    const stats = this.getUserStats();
    if (!stats || !stats.firstStudyDate) return 0;

    const firstDate = new Date(stats.firstStudyDate);
    const today = new Date();
    const daysDiff = Math.max(1, Math.ceil((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));

    return stats.totalCardsStudied / daysDiff;
  }

  // Calculate study time per day based on actual days since start (in seconds)
  getStudyTimePerDay(): number {
    const stats = this.getUserStats();
    if (!stats || !stats.firstStudyDate) return 0;

    const firstDate = new Date(stats.firstStudyDate);
    const today = new Date();
    const daysDiff = Math.max(1, Math.ceil((today.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));

    return stats.totalStudyTime / daysDiff; // Returns seconds per day
  }

  // Calculate and track mastered/difficulty cards
  private updateCardDifficulty(cardId: string, easeFactor: number) {
    if (!this.userId) return;

    const key = `user_stats_${this.userId}`;
    const existing = localStorage.getItem(key);
    if (!existing) return;

    const userStats: UserStats = JSON.parse(existing);

    // Track previous ease factor for this card
    const cardKey = `ease_${this.userId}_${cardId}`;
    const previousEase = localStorage.getItem(cardKey);
    const previousEaseValue = previousEase ? parseFloat(previousEase) : 2.5;

    // Update the ease factor for this card
    localStorage.setItem(cardKey, easeFactor.toString());

    // Recalculate mastered and difficulty cards
    this.recalculateCardDifficulties(userStats);

    localStorage.setItem(key, JSON.stringify(userStats));
  }

  private recalculateCardDifficulties(userStats: UserStats) {
    if (!this.userId) return;

    let masteredCards = 0;
    let difficultyCards = 0;

    // Get all ease factor entries for this user
    const keys = Object.keys(localStorage);
    const easeKeys = keys.filter(key => key.startsWith(`ease_${this.userId}_`));

    for (const key of easeKeys) {
      const easeValue = parseFloat(localStorage.getItem(key) || '2.5');
      if (easeValue > 2.8) {
        masteredCards++;
      } else if (easeValue < 2.0) {
        difficultyCards++;
      }
    }

    userStats.masteredCards = masteredCards;
    userStats.difficultyCards = difficultyCards;
  }

  // Clear all data for current user
  clearUserData() {
    if (!this.userId) return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes(this.userId!)) {
        localStorage.removeItem(key);
      }
    });
  }
}

export const localStatsManager = new LocalStatsManager();
