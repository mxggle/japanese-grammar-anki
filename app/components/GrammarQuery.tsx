'use client';

import { useState, useEffect } from 'react';
import { GrammarCard } from './StudyCard';
import { marked } from 'marked';

interface GrammarQueryProps {
  onBack: () => void;
}

export default function GrammarQuery({ onBack }: GrammarQueryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<GrammarCard[]>([]);
  const [allCards, setAllCards] = useState<GrammarCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<GrammarCard | null>(null);
  const [searchType, setSearchType] = useState<'all' | 'pattern' | 'meaning' | 'example'>('all');

  useEffect(() => {
    loadAllCards();
  }, []);

  useEffect(() => {
    if (searchTerm.trim()) {
      handleSearch();
    }
  }, [searchType]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedCard) {
          setSelectedCard(null);
        } else {
          onBack();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedCard, onBack]);

  const loadAllCards = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/cards');
      const result = await response.json();

      if (result.success) {
        setAllCards(result.data);
        setSearchResults(result.data.slice(0, 20)); // Show first 20 by default
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('加载卡片失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    try {
      setLoading(true);

      if (!searchTerm.trim()) {
        setSearchResults(allCards.slice(0, 20));
        return;
      }

      const url = new URL('/api/cards', window.location.origin);
      url.searchParams.set('search', searchTerm.trim());
      url.searchParams.set('searchType', searchType);

      const response = await fetch(url.toString());
      const result = await response.json();

      if (result.success) {
        setSearchResults(result.data);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError('搜索失败');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const renderMarkdown = (markdown: string) => {
    return { __html: marked(markdown) };
  };

  const renderRichFormation = (html: string) => {
    return { __html: html };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">错误: {error}</div>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  if (selectedCard) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <button
            onClick={() => setSelectedCard(null)}
            className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            ← 返回搜索结果
          </button>
        </div>

        {/* Card Detail */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
            {/* Card Header */}
            <div className="mb-4 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {selectedCard.lesson_info}
                </span>
                {selectedCard.grammar_pattern && (
                  <span className="ml-2 bg-green-100 text-green-800 px-2 py-1 rounded">
                    {selectedCard.grammar_pattern}
                  </span>
                )}
              </div>
              <div className="text-sm text-gray-500">
                Level: {selectedCard.level || 'N2'}
              </div>
            </div>

            {/* Card Content */}
            <div className="space-y-4">
              <div className="text-2xl japanese-text text-center mb-4 card-text">
                {selectedCard.front_sentence}
              </div>

              <div className="text-2xl japanese-text text-center mb-4 card-text">
                {selectedCard.back_sentence}
              </div>

              {selectedCard.reading_furigana && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">读音 (假名):</div>
                  <div className="text-lg japanese-text" dangerouslySetInnerHTML={renderRichFormation(selectedCard.reading_furigana)} />
                </div>
              )}

              {selectedCard.translation && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">翻译:</div>
                  <div className="text-gray-800 card-text">{selectedCard.translation}</div>
                </div>
              )}

              {selectedCard.rich_grammar_formation && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">语法构成:</div>
                  <div dangerouslySetInnerHTML={renderRichFormation(selectedCard.rich_grammar_formation)} />
                </div>
              )}

              {selectedCard.explanation_japanese && (
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">日语解释:</div>
                  <div className="text-gray-800 japanese-text card-text">{selectedCard.explanation_japanese}</div>
                </div>
              )}

              {selectedCard.explanation_chinese && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">中文解释:</div>
                  <div className="text-gray-800 card-text">{selectedCard.explanation_chinese}</div>
                </div>
              )}

              {selectedCard.style_notes && (
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">语体说明:</div>
                  <div className="text-gray-800 card-text">{selectedCard.style_notes}</div>
                </div>
              )}

              {selectedCard.additional_notes && (
                <div className="bg-pink-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">补充说明 (日语):</div>
                  <div className="text-gray-800 card-text whitespace-pre-line text-sm">{selectedCard.additional_notes}</div>
                </div>
              )}

              {selectedCard.additional_notes_zh && (
                <div className="bg-amber-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">补充说明 (中文):</div>
                  <div className="text-gray-800 card-text whitespace-pre-line">{selectedCard.additional_notes_zh}</div>
                </div>
              )}

              {selectedCard.detailed_explanation && (
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">详细解释:</div>
                  <div className="text-gray-800 card-text prose prose-sm max-w-none" dangerouslySetInnerHTML={renderMarkdown(selectedCard.detailed_explanation)} />
                </div>
              )}
            </div>

            {/* Audio Button */}
            {selectedCard.audio_file && (
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => {
                    const audio = new Audio(`/audio/${selectedCard.audio_file}`);
                    audio.play().catch(console.error);
                  }}
                  className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                  title="播放音频"
                >
                  🔊
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={onBack}
            className="flex items-center text-gray-600 hover:text-gray-800"
          >
            ← 返回主菜单
          </button>
          <h1 className="text-2xl font-bold text-gray-900">语法查询</h1>
          <div></div>
        </div>

        {/* Search Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col space-y-4">
            {/* Search Type Selection */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSearchType('all')}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setSearchType('pattern')}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === 'pattern'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                语法规则
              </button>
              <button
                onClick={() => setSearchType('meaning')}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === 'meaning'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                意思解释
              </button>
              <button
                onClick={() => setSearchType('example')}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === 'example'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                例句
              </button>
            </div>

            {/* Search Input */}
            <div className="flex space-x-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="请输入搜索关键词..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                搜索
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              搜索结果 ({searchResults.length} 条)
            </h2>
          </div>

          <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
            {searchResults.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                没有找到匹配的语法规则
              </div>
            ) : (
              searchResults.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        {card.grammar_pattern && (
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">
                            {card.grammar_pattern}
                          </span>
                        )}
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                          {card.lesson_info}
                        </span>
                      </div>
                      <div className="text-lg japanese-text mb-1">
                        {card.front_sentence}
                      </div>
                      <div className="text-gray-600 text-sm mb-1">
                        {card.translation}
                      </div>
                      {card.chinese_meaning && (
                        <div className="text-gray-700 text-sm">
                          {card.chinese_meaning}
                        </div>
                      )}
                    </div>
                    <div className="text-gray-400 ml-4">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-blue-50 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">💡 搜索提示</h3>
          <div className="text-sm text-blue-800 space-y-1">
            <div>• 可以搜索语法规则、中文意思、例句等内容</div>
            <div>• 使用不同的搜索类型可以更精确地找到需要的内容</div>
            <div>• 点击搜索结果可以查看详细信息</div>
            <div>• 按 ESC 键可以返回上一级</div>
          </div>
        </div>
      </div>
    </div>
  );
}