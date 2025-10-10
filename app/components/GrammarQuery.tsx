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
      <div className="min-h-screen bg-[#faf6eb] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-amber-600">加载中...</p>
        </div>
      </div>
    );
  }

  if (selectedCard) {
    return (
      <div className="min-h-screen bg-[#faf6eb] py-8">
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
          <div className="relative rounded-[26px] border border-amber-100 bg-white/95 p-6 shadow-[0_18px_45px_-22px_rgba(191,148,64,0.45)]">
            <div className="pointer-events-none absolute -top-5 left-1/2 h-8 w-28 -translate-x-1/2 rotate-[-1.5deg] rounded-md bg-gradient-to-b from-amber-200/70 to-amber-300/50 opacity-80 shadow-md"></div>
            {/* Card Header */}
            <div className="mb-4 flex justify-between items-center">
              <div className="text-sm text-amber-600">
                <span className="rounded px-2 py-1 bg-white/80 text-amber-700 shadow-sm ring-1 ring-amber-100">
                  {selectedCard.lesson_info}
                </span>
                {selectedCard.grammar_pattern && (
                  <span className="ml-2 rounded px-2 py-1 bg-amber-100 text-amber-700 shadow-sm ring-1 ring-amber-200/70">
                    {selectedCard.grammar_pattern}
                  </span>
                )}
              </div>
              <div className="text-sm text-amber-600/70">
                等级：{selectedCard.level || "N2"}
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
                <div className="rounded-lg bg-white/70 p-4 shadow-sm ring-1 ring-amber-100">
                  <div className="mb-2 font-semibold text-amber-700">
                    读音 (假名):
                  </div>
                  <div
                    className="text-lg japanese-text text-amber-900 card-text"
                    dangerouslySetInnerHTML={renderRichFormation(
                      selectedCard.reading_furigana
                    )}
                  />
                </div>
              )}

              {selectedCard.translation && (
                <div className="rounded-lg bg-amber-50 p-4 shadow-sm ring-1 ring-amber-100/60">
                  <div className="mb-2 font-semibold text-amber-700">翻译:</div>
                  <div className="card-text text-amber-900/90">
                    {selectedCard.translation}
                  </div>
                </div>
              )}

              {selectedCard.rich_grammar_formation && (
                <div className="rounded-lg bg-white/70 p-4 shadow-sm ring-1 ring-amber-100">
                  <div className="mb-2 font-semibold text-amber-700">
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
                <div className="rounded-lg bg-white/70 p-4 shadow-sm ring-1 ring-amber-100">
                  <div className="mb-2 font-semibold text-amber-700">
                    日语解释:
                  </div>
                  <div className="japanese-text card-text text-amber-900/90">
                    {selectedCard.explanation_japanese}
                  </div>
                </div>
              )}

              {selectedCard.explanation_chinese && (
                <div className="rounded-lg bg-amber-50 p-4 shadow-sm ring-1 ring-amber-100/60">
                  <div className="mb-2 font-semibold text-amber-700">
                    中文解释:
                  </div>
                  <div className="card-text text-amber-900/90">
                    {selectedCard.explanation_chinese}
                  </div>
                </div>
              )}

              {selectedCard.style_notes && (
                <div className="rounded-lg bg-rose-50/60 p-4 shadow-sm ring-1 ring-rose-100/60">
                  <div className="mb-2 font-semibold text-rose-600">
                    语体说明:
                  </div>
                  <div className="card-text text-amber-900/90">
                    {selectedCard.style_notes}
                  </div>
                </div>
              )}

              {selectedCard.additional_notes && (
                <div className="rounded-lg bg-amber-50/70 p-4 shadow-sm ring-1 ring-amber-100/40">
                  <div className="mb-2 font-semibold text-amber-700">
                    补充说明 (日语):
                  </div>
                  <div className="card-text whitespace-pre-line text-sm text-amber-900/90">
                    {selectedCard.additional_notes}
                  </div>
                </div>
              )}

              {selectedCard.additional_notes_zh && (
                <div className="rounded-lg bg-amber-50 p-4 shadow-sm ring-1 ring-amber-100/60">
                  <div className="mb-2 font-semibold text-amber-700">
                    补充说明 (中文):
                  </div>
                  <div className="card-text whitespace-pre-line text-amber-900/90">
                    {selectedCard.additional_notes_zh}
                  </div>
                </div>
              )}

              {selectedCard.detailed_explanation && (
                <div className="rounded-lg bg-white/70 p-4 shadow-sm ring-1 ring-amber-100">
                  <div className="mb-2 font-semibold text-amber-700">
                    详细解释:
                  </div>
                  <div
                    className="card-text prose prose-sm max-w-none text-amber-900/90"
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
    <div className="min-h-screen bg-[#faf6eb] py-6 sm:py-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 mb-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
          <button
            onClick={onBack}
            className="flex items-center text-amber-700 hover:text-amber-900 transition-colors"
          >
            ← 返回主菜单
          </button>
          <h1 className="text-2xl font-semibold text-amber-900 sm:text-3xl">语法查询</h1>
        </div>

        {/* Search Section */}
        <div className="relative mb-6 rounded-[26px] border border-amber-100 bg-white/95 p-6 shadow-[0_18px_45px_-25px_rgba(191,148,64,0.35)]">
          <div className="pointer-events-none absolute -top-5 left-1/2 h-8 w-24 -translate-x-1/2 rotate-[2deg] rounded-md bg-gradient-to-b from-amber-200/70 to-amber-300/50 opacity-75 shadow-md"></div>
          <div className="flex flex-col gap-4">
            {/* Search Type Selection */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleSearchTypeChange("all")}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  searchType === "all"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "border border-amber-100 bg-white text-amber-700 hover:bg-amber-50"
                }`}
              >
                全部
              </button>
              <button
                onClick={() => handleSearchTypeChange("pattern")}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  searchType === "pattern"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "border border-amber-100 bg-white text-amber-700 hover:bg-amber-50"
                }`}
              >
                语法规则
              </button>
              <button
                onClick={() => handleSearchTypeChange("meaning")}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  searchType === "meaning"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "border border-amber-100 bg-white text-amber-700 hover:bg-amber-50"
                }`}
              >
                意思解释
              </button>
              <button
                onClick={() => handleSearchTypeChange("example")}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  searchType === "example"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "border border-amber-100 bg-white text-amber-700 hover:bg-amber-50"
                }`}
              >
                例句
              </button>
            </div>

            {/* Search Input */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSearch()}
                placeholder="请输入搜索关键词..."
                className="w-full flex-1 rounded-lg border border-amber-200/80 px-4 py-2 text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              <button
                onClick={() => handleSearch()}
                className="w-full rounded-lg bg-amber-500 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-600 sm:w-auto"
              >
                搜索
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="relative rounded-[24px] border border-amber-100 bg-white/95 shadow-[0_18px_45px_-25px_rgba(191,148,64,0.35)]">
          <div className="pointer-events-none absolute -top-5 left-1/2 h-7 w-24 -translate-x-1/2 rotate-[-2deg] rounded-md bg-gradient-to-b from-amber-200/70 to-amber-300/50 opacity-70 shadow-md"></div>
          <div className="flex items-center justify-between border-b border-amber-100 p-4">
            <h2 className="text-lg font-semibold text-amber-800">
              搜索结果 ({total} 条)
            </h2>
            {isSearching && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-amber-400 border-t-transparent"></span>
                <span>检索中...</span>
              </div>
            )}
          </div>

          {error && (
            <div className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-200">
              {error}
            </div>
          )}

          <div className="max-h-[65vh] overflow-y-auto divide-y divide-amber-100 sm:max-h-96">
            {cards.length === 0 ? (
              <div className="p-8 text-center text-amber-600">
                没有找到匹配的语法规则
              </div>
            ) : (
              cards.map((card) => (
                <div
                  key={card.id}
                  onClick={() => setSelectedCard(card)}
                  className="cursor-pointer p-4 transition-transform hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between gap-4 rounded-2xl border border-transparent bg-white/80 px-4 py-3 shadow-[0_12px_35px_-28px_rgba(191,148,64,0.7)] transition-colors hover:border-amber-100 hover:bg-[#fff9e6]">
                    <div className="flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        {card.grammar_pattern && (
                          <span className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-700 shadow-sm ring-1 ring-amber-100">
                            {card.grammar_pattern}
                          </span>
                        )}
                        <span className="rounded bg-white/80 px-2 py-1 text-sm text-amber-700 shadow-sm ring-1 ring-amber-100">
                          {card.lesson_info}
                        </span>
                      </div>
                      <div className="mb-1 text-lg japanese-text text-amber-900 card-text">
                        {card.front_sentence}
                      </div>
                      <div className="mb-1 text-sm text-amber-600">
                        {card.translation}
                      </div>
                      {card.chinese_meaning && (
                        <div className="text-sm text-amber-700">
                          {card.chinese_meaning}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 text-amber-300">
                      <svg
                        className="h-5 w-5"
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

          <div className="flex flex-col gap-3 border-t border-amber-100 px-4 py-3 text-sm text-amber-600 sm:flex-row sm:items-center sm:justify-between">
            <span>
              第 {startIndex}-{endIndex} 条 / 共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange('previous')}
                disabled={page <= 1}
                className="rounded-full border border-amber-200 px-3 py-1 text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => handlePageChange('next')}
                disabled={page >= totalPages}
                className="rounded-full border border-amber-200 px-3 py-1 text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 rounded-lg bg-white/70 p-4 shadow-sm ring-1 ring-amber-100">
          <h3 className="mb-2 font-semibold text-amber-700">💡 搜索提示</h3>
          <div className="space-y-1 text-sm text-amber-700">
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
