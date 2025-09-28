'use client';

import { useState, useRef } from 'react';
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
}

export default function StudyCard({
  card,
  onAnswer,
  onNext,
  showAnswer = false,
  onToggleAnswer
}: StudyCardProps) {
  const [isFlipping, setIsFlipping] = useState(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

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

  const renderRichFormation = (html: string) => {
    return { __html: html };
  };

  const renderMarkdown = (markdown: string) => {
    return { __html: marked(markdown) };
  };

  const handleAudioPlay = () => {
    if (!card.audio_file) return;

    // Stop any currently playing audio
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.currentTime = 0;
    }

    // Create new audio instance
    const audio = new Audio(`/audio/${card.audio_file}`);
    currentAudioRef.current = audio;

    // Play the audio
    audio.play().catch(console.error);

    // Clear reference when audio ends
    audio.addEventListener('ended', () => {
      currentAudioRef.current = null;
    });
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Card Container */}
      <div className={`relative w-full min-h-[400px] transition-transform duration-300 ${isFlipping ? 'scale-95' : 'scale-100'}`}>
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          {/* Card Header */}
          <div className="mb-4 flex justify-between items-center">
            <div className="text-sm text-gray-600">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {card.lesson_info}
              </span>
              {card.grammar_pattern && (
                <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded">
                  {card.grammar_pattern}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              Level: {card.level || 'N2'}
            </div>
          </div>

          {/* Card Content */}
          <div className="space-y-6">
            {!showAnswer ? (
              /* Front Side */
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {card.audio_file && (
                    <button
                      onClick={handleAudioPlay}
                      className="p-3 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors text-2xl"
                      title="播放音频"
                    >
                      🔊
                    </button>
                  )}
                  <div className="text-2xl japanese-text card-text">
                    {card.front_sentence}
                  </div>
                </div>
                {card.reading_furigana && (
                  <div className="text-lg text-gray-800 mb-2">
                    <ruby dangerouslySetInnerHTML={renderRichFormation(card.reading_furigana)} />
                  </div>
                )}
                {card.translation && (
                  <div className="text-lg text-gray-800 card-text">
                    {card.translation}
                  </div>
                )}
                <button
                  onClick={handleFlip}
                  className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  显示答案
                </button>
              </div>
            ) : (
              /* Back Side */
              <div className="space-y-4">
                <div className="flex items-center justify-center gap-4 mb-4">
                  {card.audio_file && (
                    <button
                      onClick={handleAudioPlay}
                      className="p-3 bg-blue-100 rounded-full hover:bg-blue-200 transition-colors text-2xl"
                      title="播放音频"
                    >
                      🔊
                    </button>
                  )}
                  <div className="text-2xl japanese-text card-text">
                    {card.back_sentence}
                  </div>
                </div>

                {card.reading_furigana && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Reading (Furigana):</div>
                    <div className="text-lg japanese-text" dangerouslySetInnerHTML={renderRichFormation(card.reading_furigana)} />
                  </div>
                )}

                {card.translation && (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Translation:</div>
                    <div className="text-gray-800 card-text">{card.translation}</div>
                  </div>
                )}

                {card.rich_grammar_formation && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Grammar Formation:</div>
                    <div dangerouslySetInnerHTML={renderRichFormation(card.rich_grammar_formation)} />
                  </div>
                )}

                {card.explanation_japanese && (
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Japanese Explanation:</div>
                    <div className="text-gray-800 japanese-text card-text">{card.explanation_japanese}</div>
                  </div>
                )}

                {card.explanation_chinese && (
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Chinese Explanation:</div>
                    <div className="text-gray-800 card-text">{card.explanation_chinese}</div>
                  </div>
                )}

                {card.style_notes && (
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Style Notes:</div>
                    <div className="text-gray-800 card-text">{card.style_notes}</div>
                  </div>
                )}

                {card.additional_notes && (
                  <div className="bg-pink-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Additional Notes (Japanese):</div>
                    <div className="text-gray-800 card-text whitespace-pre-line text-sm">{card.additional_notes}</div>
                  </div>
                )}

                {card.additional_notes_zh && (
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">Additional Notes (Chinese):</div>
                    <div className="text-gray-800 card-text whitespace-pre-line">{card.additional_notes_zh}</div>
                  </div>
                )}

                {card.detailed_explanation && (
                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <div className="font-semibold text-gray-800 mb-2">详细解释:</div>
                    <div className="text-gray-800 card-text prose prose-sm max-w-none" dangerouslySetInnerHTML={renderMarkdown(card.detailed_explanation)} />
                  </div>
                )}

                <div className="text-center mt-4">
                  <button
                    onClick={handleFlip}
                    className="text-gray-800 hover:text-gray-900 card-text"
                  >
                    显示问题
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixed Answer Buttons at Bottom */}
      {showAnswer && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex justify-center space-x-4">
              <button
                onClick={() => handleAnswer(0)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                再来 (0)
              </button>
              <button
                onClick={() => handleAnswer(1)}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
              >
                困难 (1)
              </button>
              <button
                onClick={() => handleAnswer(2)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                良好 (2)
              </button>
              <button
                onClick={() => handleAnswer(3)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                简单 (3)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}