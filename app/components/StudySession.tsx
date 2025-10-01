"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import StudyCard, { GrammarCard } from "./StudyCard";
import LoginPrompt from "./LoginPrompt";
import { optimizedStorage } from "@/app/lib/optimizedStorage";
import { userSettingsManager } from "@/app/lib/userSettings";

const getDailyLimitStorageKey = (userId: string) => {
  const today = new Date().toISOString().split("T")[0];
  return `study_limit_${userId}_${today}`;
};

type StudySessionCard = GrammarCard & {
  __meta?: {
    type: 'learning' | 'review' | 'new';
    progress?: Record<string, unknown> | null;
  };
};

interface StudySessionProps {
  mode: "study" | "review" | "browse";
  onBack: () => void;
}

export default function StudySession({ mode, onBack }: StudySessionProps) {
  const { user } = useUser();
  const [cards, setCards] = useState<StudySessionCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studiedToday, setStudiedToday] = useState(0);
  const [baseDailyGoal, setBaseDailyGoal] = useState(20);
  const [dailyLimit, setDailyLimit] = useState(20);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showGoalCompleteModal, setShowGoalCompleteModal] = useState(false);
  const [cardStartTime, setCardStartTime] = useState<number>(Date.now());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [customExtra, setCustomExtra] = useState('');
  const extraCardChoices = [3, 5, 10];
  const [syncStatus, setSyncStatus] = useState<{
    offline: boolean;
    unsyncedData: boolean;
  }>({
    offline: false,
    unsyncedData: false,
  });

  const persistDailyLimit = useCallback((limit: number) => {
    if (typeof window === 'undefined' || !user) return;
    const key = getDailyLimitStorageKey(user.id);
    window.localStorage.setItem(key, String(limit));
  }, [user]);

  const updateSyncStatus = useCallback(() => {
    setSyncStatus({
      offline: optimizedStorage.isOffline(),
      unsyncedData: optimizedStorage.hasUnsyncedData(),
    });
  }, []);

  // Initialize user and start study session
  useEffect(() => {
    if (user) {
      optimizedStorage.setUserId(user.id);
      const newSessionId = optimizedStorage.startStudySession(mode);
      setSessionId(newSessionId);

      // Get today's progress
      const progress = optimizedStorage.getTodayProgress();
      setStudiedToday(progress.studied);
      const baseGoal = progress.goal && progress.goal > 0 ? progress.goal : 20;
      setBaseDailyGoal(baseGoal);

      if (typeof window !== 'undefined') {
        const key = getDailyLimitStorageKey(user.id);
        let initialLimit = baseGoal;
        if (key) {
          const storedRaw = window.localStorage.getItem(key);
          const storedLimit = storedRaw ? parseInt(storedRaw, 10) : NaN;
          if (Number.isFinite(storedLimit) && storedLimit > 0) {
            initialLimit = storedLimit;
          } else {
            window.localStorage.setItem(key, String(baseGoal));
          }
        }
        const effectiveLimit = Math.max(initialLimit, progress.studied || 0);
        setDailyLimit(effectiveLimit);
        persistDailyLimit(effectiveLimit);
      }

      updateSyncStatus();
    }
  }, [user, mode, persistDailyLimit, updateSyncStatus]);

  // Update sync status periodically
  useEffect(() => {
    const updateStatus = () => {
      setSyncStatus({
        offline: optimizedStorage.isOffline(),
        unsyncedData: optimizedStorage.hasUnsyncedData(),
      });
    };

    updateStatus();
    const interval = setInterval(updateStatus, 5000); // Update every 5 seconds

    return () => clearInterval(interval);
  }, [updateSyncStatus]);

  const handleBackWithSync = async () => {
    if (!user || !sessionId) {
      onBack();
      return;
    }

    setIsExiting(true);

    try {
      // End session and sync all progress to server
      const syncSuccess = await optimizedStorage.endStudySession();

      if (!syncSuccess && !optimizedStorage.isOffline()) {
        console.warn("Some data may not have synced to server");
      }
    } catch (error) {
      console.error("Error during session sync:", error);
    } finally {
      setIsExiting(false);
      onBack();
    }
  };

  const lastLoadedModeRef = useRef<string | null>(null);
  const hasPerformedInitialLoadRef = useRef(false);

  const loadCards = useCallback(async () => {
    try {
      setLoading(true);
      if (mode === "study" || mode === "review") {
        const settings = userSettingsManager.getSrsSettings();
        const requestLimit = Math.max(dailyLimit - studiedToday, 1) + 10;
        const response = await fetch('/api/study-queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ settings, limit: requestLimit })
        });
        const result = await response.json();

        if (result.success) {
          setCards(result.data ?? []);
          setCurrentIndex(0);
          setShowAnswer(false);
          setCardStartTime(Date.now());
        } else {
          setError(result.error ?? 'Unable to load study queue');
        }
      } else {
        const response = await fetch('/api/cards');
        const result = await response.json();

        if (result.success) {
          setCards(result.data ?? []);
          setCurrentIndex(0);
          setShowAnswer(false);
          setCardStartTime(Date.now());
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      setError("Failed to load cards");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [mode, dailyLimit, studiedToday]);

  useEffect(() => {
    if (hasPerformedInitialLoadRef.current && lastLoadedModeRef.current === mode) {
      return;
    }

    hasPerformedInitialLoadRef.current = true;
    lastLoadedModeRef.current = mode;
    loadCards();
  }, [mode, loadCards]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
        case "Enter":
          e.preventDefault();
          setShowAnswer(!showAnswer);
          break;
        case "ArrowLeft":
          if (currentIndex > 0) {
            handlePrevious();
          }
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "0":
          if (showAnswer) handleAnswer(0);
          break;
        case "1":
          if (showAnswer) handleAnswer(1);
          break;
        case "2":
          if (showAnswer) handleAnswer(2);
          break;
        case "3":
          if (showAnswer) handleAnswer(3);
          break;
        case "Escape":
          handleBackWithSync();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, showAnswer, cards.length, handleBackWithSync]);

  const handleAnswer = async (grade: number) => {
    if (!cards[currentIndex]) return;

    if (studiedToday >= dailyLimit) {
      setShowGoalCompleteModal(true);
      return;
    }

    // Calculate study time for this card (time spent on this specific card)
    const studyTimeForCard = Math.max(
      1,
      Math.round((Date.now() - cardStartTime) / 1000)
    );

    if (user) {
      // Save locally instantly - no server call during study
      optimizedStorage.saveCardProgressLocally(
        cards[currentIndex].id,
        grade,
        studyTimeForCard
      );

      // Update UI immediately
      const progress = optimizedStorage.getTodayProgress();
      setStudiedToday(progress.studied);
      updateSyncStatus();

      // Check if current allowance is used up
      if (progress.studied >= dailyLimit && (progress.studied - 1) < dailyLimit) {
        setShowGoalCompleteModal(true);
      } else {
        handleNext(progress.studied, dailyLimit);
      }
    } else {
      // Show login prompt for guest users
      setShowLoginPrompt(true);
    }
  };

  const handleContinueWithoutSaving = () => {
    setShowLoginPrompt(false);
    handleNext(studiedToday, dailyLimit);
  };

  const handleFinishToday = () => {
    setCustomExtra('');
    setShowGoalCompleteModal(false);
    handleBackWithSync();
  };

  const handleExtendLimit = (extraCards: number) => {
    const sanitized = Math.max(1, Math.floor(extraCards));
    const updatedLimit = dailyLimit + sanitized;
    setDailyLimit(updatedLimit);
    persistDailyLimit(updatedLimit);
    setCustomExtra('');
    setShowGoalCompleteModal(false);
    // Allow state updates to flush before moving on
    setTimeout(() => handleNext(studiedToday, updatedLimit), 0);
  };

  const handleNext = (futureStudiedCount?: number, futureLimit?: number) => {
    const checkCount = typeof futureStudiedCount === 'number' ? futureStudiedCount : studiedToday;
    const limit = typeof futureLimit === 'number' ? futureLimit : dailyLimit;

    if (checkCount >= limit) {
      setShowGoalCompleteModal(true);
      return;
    }

    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
      setCardStartTime(Date.now()); // Reset timer for next card
    } else {
      // Session complete - sync and exit
      handleBackWithSync();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowAnswer(false);
      setCardStartTime(Date.now()); // Reset timer for previous card
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-amber-700">加载卡片中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-red-200 rounded-xl p-8 shadow-xl border-l-6 border-red-400">
            <div className="text-red-600 text-6xl mb-4">😅</div>
            <div className="text-red-900 text-xl font-bold mb-4">Error: {error}</div>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors shadow-md"
            >
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-blue-200 rounded-xl p-8 shadow-xl border-l-6 border-blue-400">
            <div className="text-blue-600 text-6xl mb-4">📚</div>
            <div className="text-blue-900 text-xl font-bold mb-4">暂无可用卡片</div>
            <p className="text-blue-700 mb-6">当前没有可学习的卡片，请稍后再试</p>
            <button
              onClick={onBack}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-md"
            >
              返回主菜单
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];
  const goalRemaining = Math.max(0, dailyLimit - studiedToday);
  const progressPercent = dailyLimit > 0 ? Math.min(100, (studiedToday / dailyLimit) * 100) : 0;
  const parsedCustomExtra = parseInt(customExtra, 10);
  const isCustomExtraValid = !Number.isNaN(parsedCustomExtra) && parsedCustomExtra > 0;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 text-amber-900">
      <header className="sticky top-0 z-40 border-b border-amber-200/70 bg-amber-50/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <button
            onClick={handleBackWithSync}
            disabled={isExiting}
            className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-sm font-medium text-amber-700 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {isExiting ? "同步中..." : "返回"}
          </button>

          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <span className="text-lg">
                {mode === "study" ? "📚" : mode === "review" ? "🔄" : "📖"}
              </span>
              <span>{mode === "study" ? "学习模式" : mode === "review" ? "复习模式" : "浏览模式"}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-baseline justify-between text-xs text-amber-700">
              <span>今日 {studiedToday} / {dailyLimit} 张</span>
              <span>当前第 {currentIndex + 1} / {cards.length} 张</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-amber-100">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            {dailyLimit > baseDailyGoal && (
              <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                <span className="h-2 w-2 rounded-full bg-amber-400"></span>
                额外解锁 {dailyLimit - baseDailyGoal} 张
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-1 text-xs text-amber-600">
            <span className={`font-medium ${studiedToday >= dailyLimit ? "text-green-700" : "text-amber-700"}`}>
              {studiedToday >= dailyLimit ? "今日目标已完成 🎉" : `还差 ${goalRemaining} 张`}
            </span>
            {syncStatus.offline && (
              <span className="flex items-center gap-1 text-orange-600">
                <span className="h-2 w-2 rounded-full bg-orange-500"></span>
                离线待同步
              </span>
            )}
            {!syncStatus.offline && syncStatus.unsyncedData && (
              <span className="flex items-center gap-1 text-blue-600">
                <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>
                有待同步数据
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="w-full flex-1">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 pt-6 pb-32">
          <StudyCard
            card={currentCard}
            onAnswer={handleAnswer}
            onNext={handleNext}
            showAnswer={showAnswer}
            onToggleAnswer={() => setShowAnswer(!showAnswer)}
            footerOffset={showAnswer ? 180 : 140}
          />

          <div className="flex w-full max-w-3xl items-center justify-between gap-4 text-sm text-amber-700">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-4 py-2 font-medium transition hover:bg-white disabled:opacity-60"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              上一张
            </button>

            <div className="flex flex-col items-center text-xs text-amber-600">
              <span>总卡片 {cards.length}</span>
              <span>今日已答 {studiedToday} 张</span>
            </div>

            <button
              onClick={() => handleNext()}
              disabled={currentIndex === cards.length - 1 || studiedToday >= dailyLimit}
              title={studiedToday >= dailyLimit ? '今日学习上限已达成' : undefined}
              className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-4 py-2 font-medium transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              下一张
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <details className="w-full max-w-3xl rounded-2xl border border-amber-200/70 bg-white/80 shadow-sm">
            <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-semibold text-amber-800">
              <span>⌨️ 键盘快捷键</span>
              <span className="text-xs text-amber-500">Space / 数字键 / Esc</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 px-4 pb-4 text-sm text-amber-700 sm:grid-cols-4">
              <div className="rounded-lg bg-amber-100 px-3 py-2 text-center">
                <span className="block font-mono text-xs font-semibold uppercase text-amber-700">Space</span>
                <span className="text-xs">显示/隐藏答案</span>
              </div>
              <div className="rounded-lg bg-amber-100 px-3 py-2 text-center">
                <span className="block font-mono text-xs font-semibold uppercase text-amber-700">0-3</span>
                <span className="text-xs">答题评分</span>
              </div>
              <div className="rounded-lg bg-amber-100 px-3 py-2 text-center">
                <span className="block font-mono text-xs font-semibold uppercase text-amber-700">← →</span>
                <span className="text-xs">切换卡片</span>
              </div>
              <div className="rounded-lg bg-amber-100 px-3 py-2 text-center">
                <span className="block font-mono text-xs font-semibold uppercase text-amber-700">Esc</span>
                <span className="text-xs">快速退出</span>
              </div>
            </div>
          </details>
        </div>
      </main>

      {/* Daily Goal Complete Modal */}
      {showGoalCompleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex flex-col gap-5 text-left text-amber-800">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">🎉</div>
              <div className="text-center">
                <h2 className="text-2xl font-bold text-amber-900">今日目标已完成！</h2>
                <p className="mt-2 text-sm text-amber-600">
                  基础目标 {baseDailyGoal} 张 · 今日上限 {dailyLimit} 张
                </p>
                <p className="mt-1 text-sm text-amber-600">
                  已学习 {studiedToday} 张卡片
                  {dailyLimit > baseDailyGoal && (
                    <span>（其中额外 {dailyLimit - baseDailyGoal} 张）</span>
                  )}
                </p>
              </div>

              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-700">
                <p>继续学习只会调整今天的上限，明天仍然回到基础目标。</p>
              </div>

              <div>
                <p className="text-sm font-medium text-amber-700">想再练几张？</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {extraCardChoices.map(choice => (
                    <button
                      key={choice}
                      onClick={() => handleExtendLimit(choice)}
                      className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      +{choice} 张
                    </button>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={customExtra}
                    onChange={(e) => setCustomExtra(e.target.value)}
                    className="flex-1 rounded-lg border border-amber-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                    placeholder="自定义数量"
                  />
                  <button
                    onClick={() => {
                      if (!isCustomExtraValid) return;
                      handleExtendLimit(parsedCustomExtra);
                    }}
                    disabled={!isCustomExtraValid}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-amber-700 disabled:opacity-40"
                  >
                    添加
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  onClick={handleFinishToday}
                  className="rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  ✨ 结束今天
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login Prompt Modal */}
      <LoginPrompt
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        onContinueWithoutSaving={handleContinueWithoutSaving}
      />
    </div>
  );
}
