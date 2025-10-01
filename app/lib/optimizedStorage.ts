'use client';

import { localStatsManager } from './localStats';
import { clientDB } from './clientDB';
import { userSettingsManager } from './userSettings';
import {
  scheduleCard,
  normalizeSettings,
  type AnkiSettings,
  type AnkiCardState,
} from './srs/ankiScheduler';
import type { DailyStats as UnifiedDailyStats } from './unifiedStorage';

export interface ProgressUpdate {
  cardId: string;
  grade: number;
  timestamp: string;
  studyTimeSeconds: number;
  sessionId: string;
  settings: AnkiSettings;
  learnedNewCard?: boolean;
  isReviewCard?: boolean;
}

export interface StudySession {
  id: string;
  startTime: string;
  endTime?: string;
  mode: 'study' | 'review' | 'browse';
  progressUpdates: ProgressUpdate[];
  synced: boolean;
}

export interface SyncStats {
  pendingUpdates: number;
  lastSyncTime: string | null;
  nextSyncScheduled: boolean;
}

interface AggregatedDailyStatsPayload {
  date: string;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  sessionsCount: number;
  reviewsCompleted: number;
  newCardsLearned: number;
}

class OptimizedStorageManager {
  private userId: string | null = null;
  private currentSession: StudySession | null = null;
  private syncScheduled = false;
  private isOnline = true;

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupPageLifecycleHandlers();
      this.setupNetworkHandlers();
    }
  }

  private setupPageLifecycleHandlers() {
    // Sync when page loads
    window.addEventListener('load', () => {
      this.syncOnPageLoad();
    });

    // Sync before page unloads
    window.addEventListener('beforeunload', () => {
      this.syncOnPageUnload();
    });

    // Sync when page becomes visible (user switches back to tab)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.syncOnVisibilityChange();
      }
    });

    // Sync when user focuses on window
    window.addEventListener('focus', () => {
      this.syncOnFocus();
    });
  }

  private setupNetworkHandlers() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncOnNetworkReconnect();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    this.isOnline = navigator.onLine;
  }

  setUserId(userId: string) {
    this.userId = userId;
    localStatsManager.setUserId(userId);
    userSettingsManager.setUserId(userId);
  }

  // Start a new study session
  startStudySession(mode: 'study' | 'review' | 'browse'): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.currentSession = {
      id: sessionId,
      startTime: new Date().toISOString(),
      mode,
      progressUpdates: [],
      synced: false
    };

    // Track session in local stats
    localStatsManager.startSession();

    this.saveSessionLocally();
    return sessionId;
  }

  // End current study session and trigger sync
  async endStudySession(): Promise<boolean> {
    if (!this.currentSession) return true;

    this.currentSession.endTime = new Date().toISOString();
    this.saveSessionLocally();

    // Trigger immediate sync when exiting study mode
    const syncSuccess = await this.syncToServer();

    if (syncSuccess) {
      this.currentSession.synced = true;
      this.saveSessionLocally();
    }

    return syncSuccess;
  }

  // Save card progress locally (instant, no network)
  saveCardProgressLocally(cardId: string, grade: number, studyTimeSeconds: number = 0): void {
    if (!this.userId || !this.currentSession) {
      console.warn('Cannot save progress: no user or session');
      return;
    }

    const timestamp = new Date().toISOString();
    const settings = userSettingsManager.getSrsSettings();
    const previousLocal = localStatsManager.getCardProgress(cardId);
    const previousState = previousLocal ? mapLocalProgressToState(previousLocal, settings) : undefined;
    const schedulingResult = scheduleCard({
      previousState,
      grade: Math.max(0, Math.min(3, grade)) as 0 | 1 | 2 | 3,
      settings,
      now: new Date(timestamp)
    });

    const learnedNewCard = schedulingResult.wasNewCard && schedulingResult.state.status !== 'new';
    const isReviewCard = previousState ? previousState.status === 'review' || previousState.status === 'relearning' : false;

    const progressUpdate: ProgressUpdate = {
      cardId,
      grade,
      timestamp,
      studyTimeSeconds,
      sessionId: this.currentSession.id,
      settings,
      learnedNewCard,
      isReviewCard
    };

    this.currentSession.progressUpdates.push(progressUpdate);
    this.saveProgressUpdateLocally(progressUpdate);
    this.saveSessionLocally();

    localStatsManager.saveCardProgress(
      cardId,
      grade,
      schedulingResult.state,
      studyTimeSeconds,
      { learnedNewCard, isReviewCard }
    );

    userSettingsManager.incrementTodayProgress(grade, studyTimeSeconds);
  }

  private saveProgressUpdateLocally(update: ProgressUpdate) {
    if (!this.userId) return;

    const key = `pending_progress_${this.userId}`;
    const existing = this.getPendingUpdates();
    existing.push(update);

    localStorage.setItem(key, JSON.stringify(existing));
  }

  private saveSessionLocally() {
    if (!this.userId || !this.currentSession) return;

    const key = `current_session_${this.userId}`;
    localStorage.setItem(key, JSON.stringify(this.currentSession));
  }

  private getPendingUpdates(): ProgressUpdate[] {
    if (!this.userId) return [];

    const key = `pending_progress_${this.userId}`;
    const stored = localStorage.getItem(key);

    try {
      const parsed = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map((update: ProgressUpdate) => ({
        ...update,
        settings: normalizeSettings(update.settings),
        learnedNewCard: update.learnedNewCard ?? false,
        isReviewCard: update.isReviewCard ?? false
      }));
    } catch {
      return [];
    }
  }

  private clearPendingUpdates() {
    if (!this.userId) return;

    const key = `pending_progress_${this.userId}`;
    localStorage.removeItem(key);
  }

  // Sync all pending data to server
  async syncToServer(): Promise<boolean> {
    if (!this.userId || !this.isOnline) return false;

    const pendingUpdates = this.getPendingUpdates().sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (pendingUpdates.length === 0) return true;

    try {
      // Send progress updates sequentially
      const progressSyncSuccess = await this.syncProgressUpdates(pendingUpdates);

      // Send stats updates
      const statsSyncSuccess = await this.syncStatsUpdates(pendingUpdates);

      if (progressSyncSuccess && statsSyncSuccess) {
        this.clearPendingUpdates();
        this.markCurrentSessionSynced();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Sync failed:', error);
      return false;
    }
  }

  private async syncProgressUpdates(updates: ProgressUpdate[]): Promise<boolean> {
    for (const update of updates) {
      const success = await this.syncSingleCardProgress(update);
      if (!success) {
        return false;
      }
    }
    return true;
  }

  private async syncSingleCardProgress(update: ProgressUpdate): Promise<boolean> {
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: update.cardId,
          grade: update.grade,
          studyTimeSeconds: update.studyTimeSeconds,
          settings: update.settings
        })
      });

      return response.ok;
    } catch (error) {
      console.error(`Failed to sync progress for card ${update.cardId}:`, error);
      return false;
    }
  }

  private async syncStatsUpdates(updates: ProgressUpdate[]): Promise<boolean> {
    try {
      const dailyDataBatch = this.aggregateUpdatesForStats(updates);

      if (dailyDataBatch.length === 0) {
        return true;
      }

      const response = await fetch('/api/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyDataBatch })
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to sync stats:', error);
      return false;
    }
  }

  private aggregateUpdatesForStats(updates: ProgressUpdate[]): AggregatedDailyStatsPayload[] {
    if (updates.length === 0) {
      return [];
    }

    type AggregationAccumulator = AggregatedDailyStatsPayload & { sessionIds: Set<string> };

    const perDayTotals = new Map<string, AggregationAccumulator>();

    for (const update of updates) {
      const rawTimestamp = update.timestamp ? new Date(update.timestamp) : new Date();
      const timestamp = Number.isNaN(rawTimestamp.getTime()) ? new Date() : rawTimestamp;
      const dateKey = timestamp.toISOString().split('T')[0];

      if (!perDayTotals.has(dateKey)) {
        perDayTotals.set(dateKey, {
          date: dateKey,
          cardsStudied: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          studyTime: 0,
          sessionsCount: 0,
          reviewsCompleted: 0,
          newCardsLearned: 0,
          sessionIds: new Set<string>()
        });
      }

      const totals = perDayTotals.get(dateKey)!;
      totals.cardsStudied += 1;
      totals.studyTime += Math.max(0, update.studyTimeSeconds ?? 0);

      if (update.grade >= 2) {
        totals.correctAnswers += 1;
      } else {
        totals.incorrectAnswers += 1;
      }

      if (update.learnedNewCard) {
        totals.newCardsLearned += 1;
      }

      if (update.isReviewCard) {
        totals.reviewsCompleted += 1;
      }

      if (update.sessionId) {
        totals.sessionIds.add(update.sessionId);
      }
    }

    return Array.from(perDayTotals.values())
      .map(({ sessionIds, ...rest }) => ({
        ...rest,
        sessionsCount:
          sessionIds.size > 0
            ? sessionIds.size
            : rest.cardsStudied > 0
              ? 1
              : 0
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private markCurrentSessionSynced() {
    if (!this.currentSession) return;

    this.currentSession.synced = true;
    this.saveSessionLocally();
  }

  // Sync trigger methods
  private async syncOnPageLoad() {
    if (!this.userId) return;

    // Download latest data from server on page load
    await this.downloadLatestFromServer();

    // Sync any pending local changes
    await this.syncToServer();
  }

  private syncOnPageUnload() {
    if (!this.userId) return;

    // Use sendBeacon for reliable delivery during page unload
    const pendingUpdates = this.getPendingUpdates();
    if (pendingUpdates.length === 0) return;

    try {
      const dailyDataBatch = this.aggregateUpdatesForStats(pendingUpdates);
      if (dailyDataBatch.length === 0) {
        return;
      }

      const payload = JSON.stringify({ dailyDataBatch });

      navigator.sendBeacon('/api/stats', payload);
    } catch (error) {
      console.error('Failed to sync on page unload:', error);
    }
  }

  private async syncOnVisibilityChange() {
    if (!this.userId || !this.isOnline) return;

    // Debounce multiple quick visibility changes
    if (this.syncScheduled) return;

    this.syncScheduled = true;
    setTimeout(async () => {
      await this.syncToServer();
      this.syncScheduled = false;
    }, 1000);
  }

  private async syncOnFocus() {
    if (!this.userId || !this.isOnline) return;

    // Download any new data when user focuses on app
    await this.downloadLatestFromServer();
  }

  private async syncOnNetworkReconnect() {
    if (!this.userId) return;

    // Immediate sync when network comes back
    await this.syncToServer();
  }

  private async downloadLatestFromServer(): Promise<boolean> {
    if (!this.userId || !this.isOnline) return false;

    try {
      const response = await fetch('/api/stats');
      if (!response.ok) return false;

      const result = await response.json();
      if (result.success && result.data) {
        const nowIso = new Date().toISOString();

        if (result.data.userStats) {
          await clientDB.saveUserStats(this.userId, {
            ...result.data.userStats,
            lastSynced: nowIso
          });

          localStatsManager.setUserStats({
            totalCardsStudied: result.data.userStats.totalCardsStudied,
            totalCorrectAnswers: result.data.userStats.totalCorrectAnswers,
            totalIncorrectAnswers: result.data.userStats.totalIncorrectAnswers,
            totalStudyTime: result.data.userStats.totalStudyTime,
            totalSessions: result.data.userStats.totalSessions ?? 0,
            currentStreak: result.data.userStats.currentStreak ?? 0,
            longestStreak: result.data.userStats.longestStreak ?? 0,
            masteredCards: result.data.userStats.masteredCards ?? 0,
            difficultyCards: result.data.userStats.difficultyCards ?? 0,
            lastStudyDate: result.data.userStats.lastStudyDate || null,
            firstStudyDate: result.data.userStats.firstStudyDate || null,
            averageAccuracy: result.data.userStats.averageAccuracy ?? 0,
            cardsPerDay: result.data.userStats.cardsPerDay ?? 0,
            studyTimePerDay: result.data.userStats.studyTimePerDay ?? 0
          });
        }

        if (result.data.recentDailyStats) {
          localStatsManager.setDailyStats(result.data.recentDailyStats.map((stat: UnifiedDailyStats) => ({
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
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to download from server:', error);
      return false;
    }
  }

  // Utility methods
  getSyncStats(): SyncStats {
    const pendingUpdates = this.getPendingUpdates();
    const lastSyncKey = `last_sync_${this.userId}`;
    const lastSyncTime = localStorage.getItem(lastSyncKey);

    return {
      pendingUpdates: pendingUpdates.length,
      lastSyncTime,
      nextSyncScheduled: this.syncScheduled
    };
  }

  getTodayStudiedCount(): number {
    return userSettingsManager.getTodayProgress().cardsStudied;
  }

  getDailyGoal(): number {
    return userSettingsManager.getDailyGoal();
  }

  setDailyGoal(goal: number): void {
    userSettingsManager.setDailyGoal(goal);
  }

  getTodayProgress(): { studied: number; goal: number; percentage: number; remaining: number; completed: boolean } {
    const progress = userSettingsManager.getTodayProgress();
    return {
      studied: progress.cardsStudied,
      goal: progress.goal,
      percentage: userSettingsManager.getTodayProgressPercentage(),
      remaining: userSettingsManager.getRemainingCardsToday(),
      completed: userSettingsManager.isDailyGoalCompleted()
    };
  }

  getAccuracy(): number {
    return localStatsManager.getAccuracy();
  }

  isOffline(): boolean {
    return !this.isOnline;
  }

  hasUnsyncedData(): boolean {
    return this.getPendingUpdates().length > 0;
  }

  // Force sync method for manual sync
  async forcSync(): Promise<boolean> {
    return await this.syncToServer();
  }
}

export const optimizedStorage = new OptimizedStorageManager();

function mapLocalProgressToState(progress: Record<string, unknown> | null | undefined, settings: AnkiSettings): AnkiCardState {
  const data = (progress ?? {}) as Record<string, unknown>;

  const getNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const parseDate = (value: unknown) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  };

  return {
    easeFactor: getNumber(data.easeFactor, settings.startingEase),
    interval: getNumber(data.interval, 0),
    repetitions: getNumber(data.repetitions, 0),
    status: (data.status as AnkiCardState['status']) ?? 'new',
    stepIndex: getNumber(data.stepIndex, 0),
    lapses: getNumber(data.lapses, 0),
    previousInterval: getNumber(data.previousInterval, 0),
    isLeech: Boolean(data.isLeech),
    nextReview: parseDate(data.nextReview),
    lastReviewed: parseDate(data.lastReviewed ?? data.timestamp),
  };
}
