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
        className={`relative w-full rounded-[28px] bg-[#fffdf2] shadow-[0_18px_45px_-22px_rgba(191,148,64,0.55)] ring-1 ring-amber-100/60 transition-transform duration-300 ${
          isFlipping ? 'scale-[0.99]' : 'scale-100'
        }`}
      >
        <div className="pointer-events-none absolute -top-5 left-1/2 h-8 w-28 -translate-x-1/2 rotate-[-2deg] rounded-md bg-gradient-to-b from-amber-200/70 to-amber-300/50 opacity-80 shadow-md"></div>
        <div className="pointer-events-none absolute -top-4 left-1/2 h-8 w-28 -translate-x-1/2 rotate-[4deg] rounded-md bg-gradient-to-b from-amber-100/60 to-amber-200/50 opacity-60 blur-[1px]"></div>
        <div className="p-6 sm:p-8">
          <div className="space-y-6">
            <div className="pr-1 sm:pr-3">
              <div className="space-y-6">
                <button
                  onClick={handleAudioPlay}
                  className="group relative w-full overflow-hidden rounded-3xl border border-amber-100 bg-white/95 px-5 py-6 text-left shadow-sm transition-transform hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                >
                  <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center justify-center gap-3">
                      {card.audio_file && (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-amber-600 shadow-sm ring-1 ring-amber-200/70">
                          <svg
                            className="h-5 w-5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path d="M3 8a1 1 0 011-1h2.172l2.121-2.121A1 1 0 019.414 4H10a1 1 0 011 1v10a1 1 0 01-1 1h-.586a1 1 0 01-.707-.293L6.172 13H4a1 1 0 01-1-1V8z" />
                            <path d="M14.5 5.5a1 1 0 10-1.5 1.32A2.5 2.5 0 0114.5 9a2.5 2.5 0 01-1.5 2.18 1 1 0 10.86 1.82A4.5 4.5 0 0016.5 9a4.5 4.5 0 00-2-3.75z" />
                          </svg>
                        </span>
                      )}
                      <span className="text-center text-2xl font-medium leading-relaxed text-amber-900 sm:text-3xl japanese-text card-text">
                        {showAnswer ? card.back_sentence : card.front_sentence}
                      </span>
                    </div>
                    {showAnswer && card.translation && (
                      <p className="max-w-2xl text-center text-sm text-amber-600 sm:text-base">
                        {card.translation}
                      </p>
                    )}
                  </div>
                  {!showAnswer && card.chinese_meaning && (
                    <p className="mt-4 text-center text-sm text-amber-600">{card.chinese_meaning}</p>
                  )}
                </button>

                {showAnswer && (
                  <div className="space-y-6">
                    {(card.lesson_info ||
                      card.grammar_pattern ||
                      card.level ||
                      card.explanation_chinese ||
                      card.explanation_japanese ||
                      card.rich_grammar_formation ||
                      card.style_notes ||
                      card.additional_notes ||
                      card.additional_notes_zh) && (
                      <section className="rounded-3xl border border-amber-100 bg-white/95 p-5 shadow-[0_12px_25px_-20px_rgba(191,148,64,0.6)]">
                        <div className="flex items-center justify-between border-b border-amber-100 pb-3 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-500/80">
                          <span>语法点</span>
                        </div>
                        <div className="mt-4 space-y-6 text-sm text-slate-800">
                          {(card.lesson_info || card.grammar_pattern || card.level) && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {card.lesson_info && (
                                <span className="rounded-full border border-amber-100 bg-[#fff5d6] px-3 py-1 font-medium text-amber-700 shadow-[0_1px_4px_rgba(191,148,64,0.18)]">
                                  {card.lesson_info}
                                </span>
                              )}
                              {card.grammar_pattern && (
                                <span className="rounded-full border border-amber-100 bg-[#fff5d6] px-3 py-1 font-medium text-amber-700 shadow-[0_1px_4px_rgba(191,148,64,0.18)]">
                                  {card.grammar_pattern}
                                </span>
                              )}
                              {card.level && (
                                <span className="rounded-full border border-amber-100 bg-[#fff5d6] px-3 py-1 font-medium text-amber-700 shadow-[0_1px_4px_rgba(191,148,64,0.18)]">
                                  等级 {card.level}
                                </span>
                              )}
                            </div>
                          )}
                          {card.rich_grammar_formation && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold tracking-[0.2em] text-amber-600/80 uppercase">
                                接续与结构
                              </p>
                              <div
                                className="leading-relaxed grammar-formation"
                                dangerouslySetInnerHTML={renderRichFormation(card.rich_grammar_formation)}
                              />
                            </div>
                          )}
                          {card.explanation_chinese && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold tracking-[0.2em] text-amber-600/80 uppercase">
                                中文解读
                              </p>
                              <p className="whitespace-pre-line text-sm text-amber-900/90 card-text">{card.explanation_chinese}</p>
                            </div>
                          )}
                          {card.explanation_japanese && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold tracking-[0.2em] text-amber-600/80 uppercase">
                                日本語解説
                              </p>
                              <p className="whitespace-pre-line text-sm text-slate-800 japanese-text card-text">
                                {card.explanation_japanese}
                              </p>
                            </div>
                          )}
                          {card.style_notes && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold tracking-[0.2em] text-amber-600/80 uppercase">
                                语体说明
                              </p>
                              <p className="whitespace-pre-line text-sm text-slate-800">{card.style_notes}</p>
                            </div>
                          )}
                          {card.additional_notes && (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold tracking-[0.2em] text-amber-600/80 uppercase">
                                附加说明
                              </p>
                              <p className="whitespace-pre-line text-sm text-slate-800">{card.additional_notes}</p>
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    {card.detailed_explanation && (
                      <details className="group rounded-3xl border border-amber-100 bg-white/95 p-5 shadow-sm" open>
                        <summary className="flex cursor-pointer select-none items-center justify-between text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-800">
                          <span>深入解读</span>
                          <svg
                            className="h-3 w-3 text-amber-300 transition group-open:-rotate-180"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            aria-hidden="true"
                          >
                            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </summary>
                        <div
                          className="prose prose-sm mt-4 max-w-none text-slate-800"
                          dangerouslySetInnerHTML={renderMarkdown(card.detailed_explanation)}
                        />
                      </details>
                    )}
                  </div>
                )}
              </div>
            </div>

            {showAnswer && (
              <div className="text-center">
                <button
                  onClick={handleFlip}
                  className="inline-flex items-center gap-2 text-sm font-medium text-amber-600 transition-colors hover:text-amber-800"
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
        <div className="mx-auto flex w-full max-w-4xl items-stretch gap-2 pt-3 sm:gap-3 sm:pt-3">
          {!showAnswer ? (
            <button
              onClick={handleFlip}
              className="w-full rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600"
            >
              {revealButtonLabel}
            </button>
          ) : isReadOnly ? (
            <div className="flex w-full flex-col items-center gap-3 text-sm text-amber-600 sm:flex-row sm:justify-between">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
                <button
                  onClick={() => {
                    handleFlip();
                  }}
                  className="w-full rounded-xl border border-amber-200 bg-white px-5 py-3 text-sm font-semibold text-amber-600 transition hover:bg-amber-50 sm:w-auto sm:min-w-[140px]"
                >
                  返回题面
                </button>
                <button
                  onClick={onNext}
                  className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100 sm:w-auto sm:min-w-[140px]"
                >
                  下一张
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex w-full items-stretch gap-2">
                <button
                  onClick={() => handleAnswer(0)}
                  className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100"
                >
                  再来 (0)
                </button>
                <button
                  onClick={() => handleAnswer(1)}
                  className="flex-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 shadow-sm transition hover:bg-amber-100"
                >
                  困难 (1)
                </button>
                <button
                  onClick={() => handleAnswer(2)}
                  className="flex-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 shadow-sm transition hover:bg-sky-100"
                >
                  良好 (2)
                </button>
                <button
                  onClick={() => handleAnswer(3)}
                  className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-100"
                >
                  简单 (3)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
