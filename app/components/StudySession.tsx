'use client';

import { useState, useEffect } from 'react';
import StudyCard, { GrammarCard } from './StudyCard';

interface StudySessionProps {
  mode: 'study' | 'review' | 'browse';
  onBack: () => void;
}

export default function StudySession({ mode, onBack }: StudySessionProps) {
  const [cards, setCards] = useState<GrammarCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studiedToday, setStudiedToday] = useState(0);

  useEffect(() => {
    loadCards();
  }, [mode]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault();
          setShowAnswer(!showAnswer);
          break;
        case 'ArrowLeft':
          if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
            setShowAnswer(false);
          }
          break;
        case 'ArrowRight':
          if (currentIndex < cards.length - 1) {
            setCurrentIndex(currentIndex + 1);
            setShowAnswer(false);
          }
          break;
        case '0':
          if (showAnswer) handleAnswer(0);
          break;
        case '1':
          if (showAnswer) handleAnswer(1);
          break;
        case '2':
          if (showAnswer) handleAnswer(2);
          break;
        case '3':
          if (showAnswer) handleAnswer(3);
          break;
        case 'Escape':
          onBack();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentIndex, showAnswer, cards.length, onBack]);

  const loadCards = async () => {
    try {
      setLoading(true);
      let url = '/api/cards';

      if (mode === 'study') {
        url += '?limit=20'; // Study mode: load 20 cards
      } else if (mode === 'review') {
        // For review mode, we would check which cards need review
        // For now, just load all cards
      }

      const response = await fetch(url);
      const result = await response.json();

      if (result.success) {
        setCards(result.data);
        setCurrentIndex(0);
        setShowAnswer(false);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('Failed to load cards');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = async (grade: number) => {
    if (!cards[currentIndex]) return;

    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: cards[currentIndex].id,
          grade
        })
      });

      if (response.ok) {
        setStudiedToday(prev => prev + 1);
      }
    } catch (err) {
      console.error('Failed to update progress:', err);
    }
  };

  const handleNext = () => {
    if (currentIndex < cards.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setShowAnswer(false);
    } else {
      // Session complete
      onBack();
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setShowAnswer(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载卡片中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">Error: {error}</div>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 text-xl mb-4">No cards available</div>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div className={`min-h-screen bg-gray-50 py-8 ${showAnswer ? 'pb-40' : ''}`}>
      {/* Header */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="flex justify-between items-center">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            ← 返回主菜单
          </button>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900">{mode === 'study' ? '学习' : mode === 'review' ? '复习' : '浏览'}模式</h1>
            <p className="text-gray-800">
              第 {currentIndex + 1} 张，共 {cards.length} 张
            </p>
          </div>

          <div className="text-right text-sm text-gray-800">
            <div>今日学习: {studiedToday}</div>
            <div>进度: {Math.round(((currentIndex + 1) / cards.length) * 100)}%</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="max-w-4xl mx-auto px-4 mb-6">
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Study Card */}
      <div className="px-4">
        <StudyCard
          card={currentCard}
          onAnswer={handleAnswer}
          onNext={handleNext}
          showAnswer={showAnswer}
          onToggleAnswer={() => setShowAnswer(!showAnswer)}
        />
      </div>

      {/* Navigation */}
      <div className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex justify-between">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← 上一张
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex === cards.length - 1}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            下一张 →
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Help */}
      <div className="max-w-4xl mx-auto px-4 mt-8">
        <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">键盘快捷键：</h3>
          <div className="text-sm text-gray-800 grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><kbd className="bg-gray-100 px-1 rounded">Space</kbd> 显示/隐藏答案</div>
            <div><kbd className="bg-gray-100 px-1 rounded">←/→</kbd> 切换卡片</div>
            <div><kbd className="bg-gray-100 px-1 rounded">0-3</kbd> 答题等级</div>
            <div><kbd className="bg-gray-100 px-1 rounded">Esc</kbd> 返回主菜单</div>
          </div>
        </div>
      </div>
    </div>
  );
}