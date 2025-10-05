'use client';

import { localStatsManager } from './localStats';
import { clientDB } from './clientDB';
import { userSettingsManager } from './userSettings';
import { scheduleCard, type AnkiCardState, type AnkiSettings } from './srs/ankiScheduler';

export interface SyncableData {
  lastSynced?: string;
  pendingSync?: boolean;
  syncVersion?: number;
}

export interface UserProgress extends SyncableData {
  cardId: string;
  grade: number;
  timestamp: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  studyTimeSeconds?: number;
  syncedToStats?: boolean;
  status: AnkiCardState['status'];
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech: boolean;
  nextReview?: string | null;
}

export interface UserStats extends SyncableData {
  totalCardsStudied: number;
  totalCorrectAnswers: number;
  totalIncorrectAnswers: number;
  totalStudyTime: number;
  totalSessions?: number;
  averageAccuracy?: number;
  cardsPerDay?: number;
  studyTimePerDay?: number;
  masteredCards?: number;
  difficultyCards?: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  firstStudyDate: string | null;
}

export interface DailyStats extends SyncableData {
  date: string;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  sessionsCount: number;
  reviewsCompleted: number;
  newCardsLearned: number;
  currentStreak?: number;
}

interface SaveProgressResult {
  progress: UserProgress;
  synced: boolean;
}

interface DailyIncrementPayload {
  date?: string;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  sessionsCount: number;
  reviewsCompleted: number;
  newCardsLearned: number;
}

type ServerStatsResponse = {
  userStats?: UserStats;
  recentDailyStats?: DailyStats[];
};

class UnifiedStorageManager {
  private userId: string | null = null;
  private syncInProgress = false;
  private hasPendingSync = false;
  private syncIntervalId: number | null = null;
  private onlineListenerRegistered = false;

  private handleOnline = () => {
    this.attemptSync();
  };

  setUserId(userId: string) {
    this.userId = userId;
    localStatsManager.setUserId(userId);

    if (typeof window !== 'undefined') {
      this.setupBackgroundSync();
    }
  }

  private setupBackgroundSync(): void {
    if (this.syncIntervalId !== null) {
      window.clearInterval(this.syncIntervalId);
    }

    this.syncIntervalId = window.setInterval(() => {
      if (navigator.onLine && !this.syncInProgress) {
        this.attemptSync();
      }
    }, 30000);

    if (!this.onlineListenerRegistered) {
      window.addEventListener('online', this.handleOnline);
      this.onlineListenerRegistered = true;
    }
  }

  async saveCardProgress(cardId: string, grade: number, studyTimeSeconds: number = 0): Promise<SaveProgressResult | null> {
    if (!this.userId) return null;

    const settings = userSettingsManager.getSrsSettings();
    const existingLocal = await clientDB.getCardProgress(this.userId, cardId) as UserProgress | undefined;
    const previousState = existingLocal ? mapStoredProgressToState(existingLocal, settings) : undefined;

    const payload = {
      cardId,
      grade,
      studyTimeSeconds,
      settings
    };

    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Failed to sync progress: ${response.status}`);
      }

      const result = await response.json();
      const serverProgress = result.data;

       const stateFromServer: AnkiCardState = {
        easeFactor: serverProgress.easeFactor,
        interval: serverProgress.interval,
        repetitions: serverProgress.repetitions,
        status: serverProgress.status,
        stepIndex: serverProgress.stepIndex,
        lapses: serverProgress.lapses,
        previousInterval: serverProgress.previousInterval,
        isLeech: serverProgress.isLeech,
        lastReviewed: serverProgress.lastReviewed ?? serverProgress.timestamp ?? new Date().toISOString(),
        nextReview: serverProgress.nextReview ?? null
      };

      const normalizedProgress: UserProgress = {
        cardId,
        grade,
        timestamp: serverProgress.lastReviewed || new Date().toISOString(),
        interval: stateFromServer.interval,
        easeFactor: stateFromServer.easeFactor,
        repetitions: stateFromServer.repetitions,
        studyTimeSeconds,
        pendingSync: false,
        syncedToStats: false,
        lastSynced: new Date().toISOString(),
        status: stateFromServer.status,
        stepIndex: stateFromServer.stepIndex,
        lapses: stateFromServer.lapses,
        previousInterval: stateFromServer.previousInterval,
        isLeech: stateFromServer.isLeech,
        nextReview: stateFromServer.nextReview
      };

      const schedulingInfo = serverProgress.scheduling;
      const learnedNewCard = Boolean(schedulingInfo?.wasNewCard && stateFromServer.status !== 'new');
      const isReviewCard = Boolean(previousState && (previousState.status === 'review' || previousState.status === 'relearning'));

      localStatsManager.saveCardProgress(
        cardId,
        grade,
        stateFromServer,
        studyTimeSeconds,
        { learnedNewCard, isReviewCard }
      );

      const statsSynced = await this.sendDailyStatsIncrement({
        cardsStudied: 1,
        correctAnswers: grade >= 2 ? 1 : 0,
        incorrectAnswers: grade < 2 ? 1 : 0,
        studyTime: studyTimeSeconds,
        sessionsCount: 0,
        reviewsCompleted: isReviewCard ? 1 : 0,
        newCardsLearned: learnedNewCard ? 1 : 0
      });

      normalizedProgress.syncedToStats = statsSynced;
      await clientDB.saveCardProgress(this.userId, cardId, normalizedProgress);

      if (!statsSynced) {
        this.hasPendingSync = true;
      }

      return {
        progress: normalizedProgress,
        synced: true
      };
    } catch (error) {
      console.warn('Immediate sync failed, queuing progress for retry', error);

      const schedulingResult = scheduleCard({
        previousState,
        grade: Math.max(0, Math.min(3, grade)) as 0 | 1 | 2 | 3,
        settings
      });

      const learnedNewCard = schedulingResult.wasNewCard && schedulingResult.state.status !== 'new';
      const isReviewCard = previousState ? previousState.status === 'review' || previousState.status === 'relearning' : false;

      const queuedProgress: UserProgress = {
        cardId,
        grade,
        timestamp: new Date().toISOString(),
        interval: schedulingResult.state.interval,
        easeFactor: schedulingResult.state.easeFactor,
        repetitions: schedulingResult.state.repetitions,
        studyTimeSeconds,
        pendingSync: true,
        syncedToStats: false,
        syncVersion: Date.now(),
        status: schedulingResult.state.status,
        stepIndex: schedulingResult.state.stepIndex,
        lapses: schedulingResult.state.lapses,
        previousInterval: schedulingResult.state.previousInterval,
        isLeech: schedulingResult.state.isLeech,
        nextReview: schedulingResult.state.nextReview ?? null
      };

      localStatsManager.saveCardProgress(
        cardId,
        grade,
        schedulingResult.state,
        studyTimeSeconds,
        { learnedNewCard, isReviewCard }
      );
      await clientDB.saveCardProgress(this.userId, cardId, queuedProgress);
      this.hasPendingSync = true;

      return {
        progress: queuedProgress,
        synced: false
      };
    }
  }

  async getUserStats(): Promise<UserStats | null> {
    if (!this.userId) return null;

    const localStats = localStatsManager.getUserStats();

    if (localStats) {
      return localStats;
    }

    try {
      const indexedDbStats = await clientDB.getUserStats(this.userId);
      if (indexedDbStats && !this.isStaleData(indexedDbStats)) {
        return indexedDbStats;
      }
    } catch (error) {
      console.warn('Failed to get stats from IndexedDB:', error);
    }

    return null;
  }

  async getDailyStats(days: number = 7): Promise<DailyStats[]> {
    if (!this.userId) return [];

    const localStats = localStatsManager.getDailyStats(days);

    if (localStats && localStats.length > 0) {
      return localStats.map(stat => ({
        ...stat,
        reviewsCompleted: stat.reviewsCompleted ?? 0,
        newCardsLearned: stat.newCardsLearned ?? 0
      }));
    }

    try {
      const indexedDbStats = await clientDB.getDailyStats(this.userId, days);
      if (indexedDbStats && indexedDbStats.length > 0) {
        return indexedDbStats;
      }
    } catch (error) {
      console.warn('Failed to get daily stats from IndexedDB:', error);
    }

    return [];
  }

  async syncWithServer(): Promise<boolean> {
    if (!this.userId || this.syncInProgress) return false;

    this.syncInProgress = true;

    try {
      const pendingProgress = await this.getPendingSyncData();

      if (pendingProgress.length === 0) {
        this.syncInProgress = false;
        this.hasPendingSync = false;
        return true;
      }

      const dailyIncrement: DailyIncrementPayload = {
        cardsStudied: 0,
        correctAnswers: 0,
        incorrectAnswers: 0,
        studyTime: 0,
        sessionsCount: 0,
        reviewsCompleted: 0,
        newCardsLearned: 0
      };
      const progressUpdates: UserProgress[] = [];

      for (const progress of pendingProgress) {
        let updatedProgress: UserProgress = { ...progress };

        if (progress.pendingSync) {
          try {
            const response = await fetch('/api/progress', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cardId: progress.cardId,
                grade: progress.grade,
                interval: progress.interval,
                easeFactor: progress.easeFactor,
                repetitions: progress.repetitions,
                studyTimeSeconds: progress.studyTimeSeconds ?? 0
              })
            });

            if (!response.ok) {
              throw new Error(`Failed to sync card ${progress.cardId}`);
            }

            const result = await response.json();
            const serverProgress = result.data;

            updatedProgress = {
              ...progress,
              interval: serverProgress.interval,
              easeFactor: serverProgress.easeFactor,
              repetitions: serverProgress.repetitions,
              status: serverProgress.status ?? progress.status,
              stepIndex: serverProgress.stepIndex ?? progress.stepIndex,
              lapses: serverProgress.lapses ?? progress.lapses,
              previousInterval: serverProgress.previousInterval ?? progress.previousInterval,
              isLeech: serverProgress.isLeech ?? progress.isLeech,
              nextReview: serverProgress.nextReview ?? progress.nextReview,
              pendingSync: false,
              lastSynced: new Date().toISOString()
            };
          } catch (error) {
            console.warn('Failed to sync progress item:', error);
            progressUpdates.push(updatedProgress);
            continue;
          }
        }

        if (!updatedProgress.syncedToStats) {
          dailyIncrement.cardsStudied += 1;
          dailyIncrement.correctAnswers += updatedProgress.grade >= 2 ? 1 : 0;
          dailyIncrement.incorrectAnswers += updatedProgress.grade < 2 ? 1 : 0;
          dailyIncrement.studyTime += updatedProgress.studyTimeSeconds ?? 0;

          const status = updatedProgress.status;
          if (status === 'review' || status === 'relearning') {
            dailyIncrement.reviewsCompleted += 1;
          }

          if (status === 'review' && (updatedProgress.previousInterval ?? 0) === 0) {
            dailyIncrement.newCardsLearned += 1;
          }
        }

        progressUpdates.push(updatedProgress);
      }

      const statsSynced = dailyIncrement.cardsStudied > 0
        ? await this.sendDailyStatsIncrement(dailyIncrement)
        : true;

      for (const progress of progressUpdates) {
        const finalProgress = {
          ...progress,
          syncedToStats: progress.syncedToStats || statsSynced
        } as UserProgress;

        await this.markAsSynced(finalProgress);
      }

      if (!statsSynced) {
        this.hasPendingSync = true;
      }

      const remaining = await this.getPendingSyncData();
      this.hasPendingSync = this.hasPendingSync || remaining.length > 0;
      this.syncInProgress = false;

      return dailyIncrement.cardsStudied > 0 && statsSynced;
    } catch (error) {
      console.error('Sync failed:', error);
      this.syncInProgress = false;
      return false;
    }
  }

  private async getPendingSyncData(): Promise<UserProgress[]> {
    if (!this.userId) return [];

    try {
      const allProgress = await clientDB.getCardProgress(this.userId) as UserProgress[];
      return (allProgress || []).filter(p => p.pendingSync || !p.syncedToStats);
    } catch (error) {
      console.warn('Failed to get pending sync data:', error);
      return [];
    }
  }

  private async markAsSynced(progress: UserProgress): Promise<void> {
    if (!this.userId) return;

    const updatedProgress: UserProgress = {
      ...progress,
      pendingSync: false,
      syncedToStats: true,
      lastSynced: new Date().toISOString(),
      timestamp: progress.timestamp || new Date().toISOString()
    };

    await clientDB.saveCardProgress(this.userId, progress.cardId, updatedProgress);
    this.updateLocalProgressCache(updatedProgress);
  }

  private updateLocalProgressCache(progress: UserProgress) {
    if (!this.userId || typeof window === 'undefined') return;

    const key = `progress_${this.userId}_${progress.cardId}`;
    const existing = window.localStorage.getItem(key);

    if (existing) {
      try {
        const parsed = JSON.parse(existing);
        parsed.interval = progress.interval;
        parsed.easeFactor = progress.easeFactor;
        parsed.repetitions = progress.repetitions;
        window.localStorage.setItem(key, JSON.stringify(parsed));
      } catch {
        // Ignore parse errors and avoid breaking sync
      }
    }
  }

  private isStaleData(data: SyncableData): boolean {
    if (!data.lastSynced) return true;

    const lastSync = new Date(data.lastSynced);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    return (now.getTime() - lastSync.getTime()) > fiveMinutes;
  }

  private async sendDailyStatsIncrement(increment: DailyIncrementPayload): Promise<boolean> {
    if (!this.userId) return false;

    try {
      await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dailyData: {
            date: new Date().toISOString().split('T')[0],
            cardsStudied: increment.cardsStudied,
            correctAnswers: increment.correctAnswers,
            incorrectAnswers: increment.incorrectAnswers,
            studyTime: increment.studyTime,
            sessionsCount: increment.sessionsCount,
            reviewsCompleted: increment.reviewsCompleted,
            newCardsLearned: increment.newCardsLearned
          }
        })
      });
      return true;
    } catch (error) {
      console.warn('Failed to send daily stats increment:', error);
      return false;
    }
  }

  private async attemptSync(): Promise<void> {
    try {
      await this.syncWithServer();
    } catch (error) {
      console.warn('Background sync failed:', error);
    }
  }

  getAccuracy(): number {
    return localStatsManager.getAccuracy();
  }

  getCardsPerDay(): number {
    return localStatsManager.getCardsPerDay();
  }

  getStudyTimePerDay(): number {
    return localStatsManager.getStudyTimePerDay();
  }

  getTodayStudiedCount(): number {
    return localStatsManager.getTodayStudiedCount();
  }

  async downloadFromServer(): Promise<boolean> {
    if (!this.userId) return false;

    try {
      const response = await fetch('/api/stats');
      if (!response.ok) return false;

      const result = await response.json();
      if (result.success && result.data) {
        await this.saveServerDataLocally(result.data);
        return true;
      }
    } catch (error) {
      console.error('Failed to download from server:', error);
    }

    return false;
  }

  private async saveServerDataLocally(serverData: ServerStatsResponse): Promise<void> {
    if (!this.userId || !serverData.userStats) return;

    try {
      const statsWithSync = {
        ...serverData.userStats,
        lastSynced: new Date().toISOString(),
        pendingSync: false
      };

      await clientDB.saveUserStats(this.userId, statsWithSync);
      localStatsManager.setUserStats({
        totalCardsStudied: serverData.userStats.totalCardsStudied,
        totalCorrectAnswers: serverData.userStats.totalCorrectAnswers,
        totalIncorrectAnswers: serverData.userStats.totalIncorrectAnswers,
        totalStudyTime: serverData.userStats.totalStudyTime,
        totalSessions: serverData.userStats.totalSessions ?? 0,
        masteredCards: serverData.userStats.masteredCards ?? 0,
        difficultyCards: serverData.userStats.difficultyCards ?? 0,
        currentStreak: serverData.userStats.currentStreak ?? 0,
        longestStreak: serverData.userStats.longestStreak ?? 0,
        lastStudyDate: serverData.userStats.lastStudyDate || null,
        firstStudyDate: serverData.userStats.firstStudyDate || null,
        averageAccuracy: serverData.userStats.averageAccuracy ?? 0,
        cardsPerDay: serverData.userStats.cardsPerDay ?? 0,
        studyTimePerDay: serverData.userStats.studyTimePerDay ?? 0
      });

      if (serverData.recentDailyStats) {
        localStatsManager.setDailyStats(serverData.recentDailyStats.map(stat => ({
          date: stat.date,
          cardsStudied: stat.cardsStudied,
          correctAnswers: stat.correctAnswers,
          incorrectAnswers: stat.incorrectAnswers,
          studyTime: stat.studyTime,
          sessionsCount: stat.sessionsCount,
          currentStreak: stat.currentStreak,
          newCardsLearned: stat.newCardsLearned ?? 0,
          reviewsCompleted: stat.reviewsCompleted ?? 0
        })));

        for (const dailyStat of serverData.recentDailyStats) {
          const statWithSync = {
            ...dailyStat,
            lastSynced: new Date().toISOString(),
            pendingSync: false
          };

          await clientDB.saveDailyStats(this.userId, dailyStat.date, statWithSync);
        }
      }
    } catch (error) {
      console.warn('Failed to save server data locally:', error);
    }
  }

  async clearUserData(): Promise<void> {
    if (!this.userId) return;

    localStatsManager.clearUserData();

    try {
      await clientDB.init();
    } catch (error) {
      console.warn('Failed to clear IndexedDB:', error);
    }

    this.hasPendingSync = false;
    this.syncInProgress = false;
  }

  getSyncStatus(): { hasUnsyncedData: boolean; isOnline: boolean; syncInProgress: boolean } {
    return {
      hasUnsyncedData: this.hasPendingSync,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      syncInProgress: this.syncInProgress
    };
  }
}

function mapStoredProgressToState(progress: Partial<UserProgress> | undefined, settings: AnkiSettings): AnkiCardState {
  if (!progress) {
    return {
      easeFactor: settings.startingEase,
      interval: 0,
      repetitions: 0,
      status: 'new',
      stepIndex: 0,
      lapses: 0,
      previousInterval: 0,
      isLeech: false,
      lastReviewed: null,
      nextReview: null
    };
  }

  return {
    easeFactor: typeof progress.easeFactor === 'number' ? progress.easeFactor : settings.startingEase,
    interval: typeof progress.interval === 'number' ? progress.interval : 0,
    repetitions: typeof progress.repetitions === 'number' ? progress.repetitions : 0,
    status: (progress.status as AnkiCardState['status']) ?? 'new',
    stepIndex: typeof progress.stepIndex === 'number' ? progress.stepIndex : 0,
    lapses: typeof progress.lapses === 'number' ? progress.lapses : 0,
    previousInterval: typeof progress.previousInterval === 'number' ? progress.previousInterval : 0,
    isLeech: Boolean(progress.isLeech),
    lastReviewed: progress.timestamp ?? null,
    nextReview: progress.nextReview ?? null
  };
}

export const unifiedStorage = new UnifiedStorageManager();
