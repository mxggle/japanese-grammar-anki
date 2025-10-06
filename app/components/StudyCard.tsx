'use client';

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';

export interface GrammarCard {
  id: string;
  front_sentence: string;
  back_sentence: string;
  grammar_pattern: string;
  lesson_info: string;
  reading_furigana: string;
  translation: string;
  chinese_meaning: string;
  audio_file: string;
  grammar_formation: string;
  rich_grammar_formation: string;
  style_notes: string;
  explanation_japanese: string;
  explanation_chinese: string;
  additional_notes: string;
  additional_notes_zh: string;
  detailed_explanation: string;
  line_number: string;
  level: string;
}

interface StudyCardProps {
  card: GrammarCard;
  onAnswer: (grade: number) => void;
  onNext: () => void;
  showAnswer?: boolean;
  onToggleAnswer: () => void;
  footerOffset?: number;
  mode: 'study' | 'review' | 'browse';
  readOnly?: boolean;
}

export default function StudyCard({
  card,
  onAnswer,
  onNext,
  showAnswer = false,
  onToggleAnswer,
  footerOffset = 0,
  mode,
  readOnly = false
}: StudyCardProps) {
  const [isFlipping, setIsFlipping] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const isReadOnly = readOnly || mode !== 'study';
  const revealButtonLabel = isReadOnly ? '查看答案' : '显示答案';

  const handleFlip = () => {
    setIsFlipping(true);
    setTimeout(() => {
      onToggleAnswer();
      setIsFlipping(false);
    }, 150);
  };

  const handleAnswer = (grade: number) => {
    onAnswer(grade);
    setTimeout(onNext, 500);
  };

  const renderRichFormation = (html: string) => ({ __html: html });
  const renderMarkdown = (markdown: string) => ({ __html: marked(markdown) });

  const handleAudioPlay = () => {
    if (!card.audio_file) {
      return;
    }

    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }

    const audio = new Audio(`/audio/${card.audio_file}`);
    currentAudioRef.current = audio;
    audio.play().catch(console.error);
    audio.addEventListener('ended', () => {
      currentAudioRef.current = null;
    });
  };

  useEffect(() => {
    if (showAnswer) {
      handleAudioPlay();
    }
    // Only trigger when visibility changes; eslint disabled to avoid unnecessary deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAnswer]);

  return (
    <div
      className="mx-auto w-full max-w-4xl px-2 sm:px-0"
      style={{ paddingBottom: `calc(${Math.max(0, footerOffset)}px + env(safe-area-inset-bottom, 0px))` }}
    >
      <div
        className={`relative w-full rounded-3xl bg-white/90 shadow-xl ring-1 ring-amber-100 backdrop-blur transition-transform duration-300 ${
          isFlipping ? 'scale-[0.99]' : 'scale-100'
        }`}
      >
        <div className="p-6 sm:p-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm text-amber-700">
            <div className="flex flex-wrap items-center gap-2">
              {card.lesson_info && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  {card.lesson_info}
                </span>
              )}
              {card.grammar_pattern && (
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  {card.grammar_pattern}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-amber-600">
              {card.level && (
                <span className="rounded-full bg-amber-50 px-3 py-1 font-medium">
                  等级 {card.level}
                </span>
              )}
              {card.audio_file && (
                <button
                  onClick={handleAudioPlay}
                  className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 font-medium text-amber-700 transition-colors hover:bg-amber-100"
                >
                  🔊 播放音频
                </button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="max-h-[60vh] overflow-y-auto pr-1 sm:max-h-[55vh] sm:pr-3">
              {!showAnswer ? (
                <div className="space-y-4 text-center">
                  <div className="text-2xl font-medium leading-relaxed text-amber-900 sm:text-3xl japanese-text card-text">
                    {card.front_sentence}
                  </div>
                  {card.chinese_meaning && (
                    <p className="text-sm text-amber-600">{card.chinese_meaning}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-4 text-left">
                  <div className="text-center text-2xl font-medium leading-relaxed text-amber-900 sm:text-3xl japanese-text card-text">
                    {card.back_sentence}
                  </div>


                  {card.translation && (
                    <section className="rounded-2xl bg-emerald-50 p-4 text-emerald-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-600">翻译</h3>
                      <p className="mt-2 text-base">{card.translation}</p>
                    </section>
                  )}

                  {card.rich_grammar_formation && (
                    <section className="rounded-2xl bg-indigo-50 p-4 text-indigo-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-indigo-600">接续规则</h3>
                      <div
                        className="mt-2 text-sm leading-relaxed"
                        dangerouslySetInnerHTML={renderRichFormation(card.rich_grammar_formation)}
                      />
                    </section>
                  )}

                  {card.explanation_japanese && (
                    <section className="rounded-2xl bg-amber-50 p-4 text-amber-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600">日本語解説</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 japanese-text card-text">
                        {card.explanation_japanese}
                      </p>
                    </section>
                  )}

                  {card.explanation_chinese && (
                    <section className="rounded-2xl bg-rose-50 p-4 text-rose-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-500">中文解释</h3>
                      <p className="mt-2 whitespace-pre-line text-sm leading-7 card-text">
                        {card.explanation_chinese}
                      </p>
                    </section>
                  )}

                  {card.style_notes && (
                    <section className="rounded-2xl bg-purple-50 p-4 text-purple-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-purple-500">语体说明</h3>
                      <p className="mt-2 whitespace-pre-line text-sm">{card.style_notes}</p>
                    </section>
                  )}

                  {card.additional_notes && (
                    <section className="rounded-2xl bg-blue-50 p-4 text-slate-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-500">附加说明 (日语)</h3>
                      <p className="mt-2 whitespace-pre-line text-sm">{card.additional_notes}</p>
                    </section>
                  )}

                  {card.additional_notes_zh && (
                    <section className="rounded-2xl bg-orange-50 p-4 text-slate-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-orange-500">附加说明 (中文)</h3>
                      <p className="mt-2 whitespace-pre-line text-sm">{card.additional_notes_zh}</p>
                    </section>
                  )}

                  {card.detailed_explanation && (
                    <section className="rounded-2xl bg-slate-50 p-4 text-slate-900">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">详细解释</h3>
                      <div
                        className="prose prose-sm mt-2 max-w-none text-slate-800"
                        dangerouslySetInnerHTML={renderMarkdown(card.detailed_explanation)}
                      />
                    </section>
                  )}
                </div>
              )}
            </div>

            {showAnswer && (
              <div className="text-center">
                <button
                  onClick={handleFlip}
                  className="inline-flex items-center gap-2 text-sm font-medium text-amber-700 transition-colors hover:text-amber-900"
                >
                  返回题面
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-amber-200/70 bg-white/95 backdrop-blur px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
      >
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-3 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:pt-3">
          {!showAnswer ? (
            <button
              onClick={handleFlip}
              className="w-full min-w-[160px] rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
            >
              {revealButtonLabel}
            </button>
          ) : isReadOnly ? (
            <div className="flex w-full flex-col items-center gap-3 text-sm text-amber-700 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-2 text-xs text-amber-500 sm:text-sm">
                <span className="inline-flex h-2 w-2 rounded-full bg-amber-400"></span>
                {mode === 'review' ? '复习模式仅用于查看答案' : '浏览模式仅展示答案内容'}
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <button
                  onClick={() => {
                    handleFlip();
                  }}
                  className="w-full min-w-[140px] rounded-full border border-amber-300 bg-white px-5 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 sm:w-auto"
                >
                  返回题面
                </button>
                <button
                  onClick={onNext}
                  className="w-full min-w-[140px] rounded-full bg-green-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 sm:w-auto"
                >
                  下一张
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => handleAnswer(0)}
                className="w-full min-w-[110px] rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 sm:w-auto"
              >
                再来 (0)
              </button>
              <button
                onClick={() => handleAnswer(1)}
                className="w-full min-w-[110px] rounded-full bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 sm:w-auto"
              >
                困难 (1)
              </button>
              <button
                onClick={() => handleAnswer(2)}
                className="w-full min-w-[110px] rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 sm:w-auto"
              >
                良好 (2)
              </button>
              <button
                onClick={() => handleAnswer(3)}
                className="w-full min-w-[110px] rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-green-700 sm:w-auto"
              >
                简单 (3)
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
