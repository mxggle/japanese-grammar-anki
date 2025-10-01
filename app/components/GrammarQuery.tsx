"use client";

import { useState, useEffect, useCallback } from "react";
import { GrammarCard } from "./StudyCard";
import { marked } from "marked";

type SearchType = "all" | "pattern" | "meaning" | "example";

interface CardsResponse {
  success: boolean;
  data: GrammarCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  error?: string;
}

interface GrammarQueryProps {
  onBack: () => void;
}

const PAGE_SIZE = 20;

export default function GrammarQuery({ onBack }: GrammarQueryProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCard, setSelectedCard] = useState<GrammarCard | null>(null);
  const [cards, setCards] = useState<GrammarCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<SearchType>("all");
  const [activeSearchTerm, setActiveSearchTerm] = useState("");
  const [activeSearchType, setActiveSearchType] = useState<SearchType>("all");

  const fetchCards = useCallback(
    async ({
      term,
      type,
      targetPage,
      showInitial
    }: {
      term: string;
      type: SearchType;
      targetPage: number;
      showInitial: boolean;
    }) => {
      try {
        if (showInitial) {
          setInitialLoading(true);
        } else {
          setIsSearching(true);
        }

        setError(null);

        const url = new URL("/api/cards", window.location.origin);
        url.searchParams.set("page", String(targetPage));
        url.searchParams.set("pageSize", String(PAGE_SIZE));
        url.searchParams.set("searchType", type);
        const trimmedTerm = term.trim();
        if (trimmedTerm) {
          url.searchParams.set("search", trimmedTerm);
        }

        const response = await fetch(url.toString());
        const result: CardsResponse = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "搜索失败");
        }

        setCards(result.data);
        setTotal(result.total);
        setPage(result.page);
        setTotalPages(result.totalPages);
        setActiveSearchTerm(trimmedTerm);
        setActiveSearchType(type);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "搜索失败");
        setCards([]);
        setTotal(0);
        setTotalPages(1);
      } finally {
        if (showInitial) {
          setInitialLoading(false);
        }
        setIsSearching(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchCards({ term: "", type: "all", targetPage: 1, showInitial: true });
  }, [fetchCards]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedCard) {
          setSelectedCard(null);
        } else {
          onBack();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedCard, onBack]);

  const handleSearch = useCallback(
    (override?: { term?: string; type?: SearchType }) => {
      const term = override?.term ?? searchTerm;
      const type = override?.type ?? searchType;
      setSelectedCard(null);
      fetchCards({ term, type, targetPage: 1, showInitial: false });
    },
    [fetchCards, searchTerm, searchType]
  );

  const handleSearchTypeChange = (type: SearchType) => {
    setSearchType(type);
    const termToUse = searchTerm.trim() || activeSearchTerm;
    if (termToUse || activeSearchTerm) {
      handleSearch({ term: termToUse, type });
    }
  };

  const handlePageChange = (direction: 'previous' | 'next') => {
    const targetPage = direction === 'previous' ? page - 1 : page + 1;
    if (targetPage < 1 || targetPage > totalPages) return;
    setSelectedCard(null);
    fetchCards({ term: activeSearchTerm, type: activeSearchType, targetPage, showInitial: false });
  };

  const renderMarkdown = (markdown: string) => {
    return { __html: marked(markdown) };
  };

  const renderRichFormation = (html: string) => {
    return { __html: html };
  };

  const startIndex = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const endIndex = total === 0 ? 0 : Math.min(page * PAGE_SIZE, total);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="mt-4 text-amber-700">加载中...</p>
        </div>
      </div>
    );
  }

  if (selectedCard) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 py-8">
        {/* Header */}
        <div className="max-w-4xl mx-auto px-4 mb-6">
          <button
            onClick={() => setSelectedCard(null)}
            className="flex items-center text-amber-700 hover:text-amber-900 mb-4"
          >
            ← 返回搜索结果
          </button>
        </div>

        {/* Card Detail */}
        <div className="max-w-4xl mx-auto px-4">
          <div className="bg-amber-50 rounded-xl shadow-lg border border-amber-200 p-6">
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
                Level: {selectedCard.level || "N2"}
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
                  <div className="font-semibold text-gray-800 mb-2">
                    读音 (假名):
                  </div>
                  <div
                    className="text-lg japanese-text"
                    dangerouslySetInnerHTML={renderRichFormation(
                      selectedCard.reading_furigana
                    )}
                  />
                </div>
              )}

              {selectedCard.translation && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">翻译:</div>
                  <div className="text-gray-800 card-text">
                    {selectedCard.translation}
                  </div>
                </div>
              )}

              {selectedCard.rich_grammar_formation && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    语法构成:
                  </div>
                  <div
                    dangerouslySetInnerHTML={renderRichFormation(
                      selectedCard.rich_grammar_formation
                    )}
                  />
                </div>
              )}

              {selectedCard.explanation_japanese && (
                <div className="bg-orange-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    日语解释:
                  </div>
                  <div className="text-gray-800 japanese-text card-text">
                    {selectedCard.explanation_japanese}
                  </div>
                </div>
              )}

              {selectedCard.explanation_chinese && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    中文解释:
                  </div>
                  <div className="text-gray-800 card-text">
                    {selectedCard.explanation_chinese}
                  </div>
                </div>
              )}

              {selectedCard.style_notes && (
                <div className="bg-purple-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    语体说明:
                  </div>
                  <div className="text-gray-800 card-text">
                    {selectedCard.style_notes}
                  </div>
                </div>
              )}

              {selectedCard.additional_notes && (
                <div className="bg-pink-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    补充说明 (日语):
                  </div>
                  <div className="text-gray-800 card-text whitespace-pre-line text-sm">
                    {selectedCard.additional_notes}
                  </div>
                </div>
              )}

              {selectedCard.additional_notes_zh && (
                <div className="bg-amber-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    补充说明 (中文):
                  </div>
                  <div className="text-gray-800 card-text whitespace-pre-line">
                    {selectedCard.additional_notes_zh}
                  </div>
                </div>
              )}

              {selectedCard.detailed_explanation && (
                <div className="bg-indigo-50 p-4 rounded-lg">
                  <div className="font-semibold text-gray-800 mb-2">
                    详细解释:
                  </div>
                  <div
                    className="text-gray-800 card-text prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={renderMarkdown(
                      selectedCard.detailed_explanation
                    )}
                  />
                </div>
              )}
            </div>

            {/* Audio Button */}
            {selectedCard.audio_file && (
              <div className="absolute top-4 right-4">
                <button
                  onClick={() => {
                    const audio = new Audio(
                      `/audio/${selectedCard.audio_file}`
                    );
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
            className="flex items-center text-amber-700 hover:text-amber-900"
          >
            ← 返回主菜单
          </button>
          <h1 className="text-2xl font-bold text-amber-900">语法查询</h1>
          <div></div>
        </div>

        {/* Search Section */}
        <div className="bg-amber-50 rounded-lg shadow-sm border border-amber-200 p-6 mb-6">
          <div className="flex flex-col space-y-4">
            {/* Search Type Selection */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSearchTypeChange("all")}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === "all"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-200 text-amber-700 hover:bg-amber-300"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => handleSearchTypeChange("pattern")}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === "pattern"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-200 text-amber-700 hover:bg-amber-300"
                }`}
              >
                语法规则
              </button>
              <button
                onClick={() => handleSearchTypeChange("meaning")}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === "meaning"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-200 text-amber-700 hover:bg-amber-300"
                }`}
              >
                意思解释
              </button>
              <button
                onClick={() => handleSearchTypeChange("example")}
                className={`px-3 py-1 rounded-full text-sm ${
                  searchType === "example"
                    ? "bg-amber-600 text-white"
                    : "bg-amber-200 text-amber-700 hover:bg-amber-300"
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
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="请输入搜索关键词..."
                className="flex-1 px-4 py-2 border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleSearch}
                className="px-6 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                搜索
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="relative bg-amber-50 rounded-lg shadow-sm border border-amber-200">
          <div className="p-4 border-b border-amber-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-amber-900">
              搜索结果 ({total} 条)
            </h2>
            {isSearching && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <span className="h-3 w-3 rounded-full border-2 border-amber-500 border-t-transparent animate-spin"></span>
                <span>检索中...</span>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="divide-y divide-amber-200 max-h-96 overflow-y-auto">
            {cards.length === 0 ? (
              <div className="p-8 text-center text-amber-600">
                没有找到匹配的语法规则
              </div>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="p-4 hover:bg-amber-100 cursor-pointer transition-colors"
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
                    <div className="text-amber-400 ml-4">
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-amber-200 text-sm text-amber-700">
            <span>
              第 {startIndex}-{endIndex} 条 / 共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange('previous')}
                disabled={page <= 1}
                className="px-3 py-1 rounded-full border border-amber-300 text-amber-700 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                上一页
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange('next')}
                disabled={page >= totalPages}
                className="px-3 py-1 rounded-full border border-amber-300 text-amber-700 hover:bg-amber-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 bg-amber-100 rounded-lg p-4">
          <h3 className="font-semibold text-amber-900 mb-2">💡 搜索提示</h3>
          <div className="text-sm text-amber-800 space-y-1">
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
