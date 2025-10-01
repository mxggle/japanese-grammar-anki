
'use client';

import {
  defaultAnkiSettings,
  normalizeSettings,
  type AnkiSettings,
} from './srs/ankiScheduler';

interface UserSettings {
  dailyGoal: number;
  autoAdvanceOnCorrect: boolean;
  showRomaji: boolean;
  audioEnabled: boolean;
  difficulty: 'easy' | 'normal' | 'hard';
  srsSettings: AnkiSettings;
}

interface DailyProgress {
  date: string;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  goal: number;
  completed: boolean;
}

class UserSettingsManager {
  private userId: string | null = null;

  setUserId(userId: string) {
    this.userId = userId;
  }

  // Get user settings with defaults
  getSettings(): UserSettings {
    if (!this.userId) {
      return this.getDefaultSettings();
    }

    const key = `settings_${this.userId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        const settings = JSON.parse(stored);
        const defaults = this.getDefaultSettings();
        return {
          ...defaults,
          ...settings,
          srsSettings: normalizeSettings(settings?.srsSettings ?? defaults.srsSettings)
        };
      } catch {
        return this.getDefaultSettings();
      }
    }

    return this.getDefaultSettings();
  }

  // Save user settings
  saveSettings(settings: Partial<UserSettings>) {
    if (!this.userId) return;

    const current = this.getSettings();
    const updated = { ...current, ...settings };

    const key = `settings_${this.userId}`;
    localStorage.setItem(key, JSON.stringify(updated));
  }

  getSrsSettings(): AnkiSettings {
    return normalizeSettings(this.getSettings().srsSettings);
  }

  saveSrsSettings(settings: Partial<AnkiSettings>) {
    if (!this.userId) return;

    const current = this.getSrsSettings();
    const updated = normalizeSettings({ ...current, ...settings });
    this.saveSettings({ srsSettings: updated } as Partial<UserSettings>);
  }

  // Get default settings
  private getDefaultSettings(): UserSettings {
    return {
      dailyGoal: 20,
      autoAdvanceOnCorrect: false,
      showRomaji: true,
      audioEnabled: true,
      difficulty: 'normal',
      srsSettings: { ...defaultAnkiSettings }
    };
  }

  // Get daily goal
  getDailyGoal(): number {
    return this.getSettings().dailyGoal;
  }

  // Set daily goal
  setDailyGoal(goal: number) {
    this.saveSettings({ dailyGoal: Math.max(1, Math.min(100, goal)) });
  }

  // Get today's progress
  getTodayProgress(): DailyProgress {
    if (!this.userId) {
      return this.getEmptyProgress();
    }

    const today = new Date().toISOString().split('T')[0];
    const key = `daily_progress_${this.userId}_${today}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return this.getEmptyProgress();
      }
    }

    return this.getEmptyProgress();
  }

  // Update today's progress
  updateTodayProgress(cardsStudied: number, correctAnswers: number, incorrectAnswers: number, studyTime: number) {
    if (!this.userId) return;

    const today = new Date().toISOString().split('T')[0];
    const goal = this.getDailyGoal();

    const progress: DailyProgress = {
      date: today,
      cardsStudied,
      correctAnswers,
      incorrectAnswers,
      studyTime,
      goal,
      completed: cardsStudied >= goal
    };

    const key = `daily_progress_${this.userId}_${today}`;
    localStorage.setItem(key, JSON.stringify(progress));
  }

  // Increment today's progress
  incrementTodayProgress(grade: number, studyTime: number = 0) {
    const current = this.getTodayProgress();

    this.updateTodayProgress(
      current.cardsStudied + 1,
      current.correctAnswers + (grade >= 2 ? 1 : 0),
      current.incorrectAnswers + (grade < 2 ? 1 : 0),
      current.studyTime + studyTime
    );
  }

  // Get empty progress for today
  private getEmptyProgress(): DailyProgress {
    const today = new Date().toISOString().split('T')[0];
    return {
      date: today,
      cardsStudied: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      studyTime: 0,
      goal: this.getDailyGoal(),
      completed: false
    };
  }

  // Get progress for last N days
  getRecentProgress(days: number = 7): DailyProgress[] {
    if (!this.userId) return [];

    const progress: DailyProgress[] = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const key = `daily_progress_${this.userId}_${dateStr}`;
      const stored = localStorage.getItem(key);

      if (stored) {
        try {
          progress.push(JSON.parse(stored));
        } catch {
          // Skip invalid data
        }
      } else {
        // Add empty progress for days with no data
        progress.push({
          date: dateStr,
          cardsStudied: 0,
          correctAnswers: 0,
          incorrectAnswers: 0,
          studyTime: 0,
          goal: this.getDailyGoal(),
          completed: false
        });
      }
    }

    return progress.reverse(); // Most recent first
  }

  // Check if daily goal is completed
  isDailyGoalCompleted(): boolean {
    const progress = this.getTodayProgress();
    return progress.cardsStudied >= progress.goal;
  }

  // Get remaining cards for today
  getRemainingCardsToday(): number {
    const progress = this.getTodayProgress();
    return Math.max(0, progress.goal - progress.cardsStudied);
  }

  // Get progress percentage for today
  getTodayProgressPercentage(): number {
    const progress = this.getTodayProgress();
    return Math.min(100, (progress.cardsStudied / progress.goal) * 100);
  }

  // Clear user data
  clearUserData() {
    if (!this.userId) return;

    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes(`_${this.userId}_`) || key.includes(`_${this.userId}`)) {
        localStorage.removeItem(key);
      }
    });
  }
}

export const userSettingsManager = new UserSettingsManager();
