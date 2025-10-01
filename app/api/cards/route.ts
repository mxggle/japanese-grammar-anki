import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lesson = searchParams.get('lesson');
    const pattern = searchParams.get('pattern');
    const limit = searchParams.get('limit');
    const search = searchParams.get('search');
    const searchType = (searchParams.get('searchType') || 'all') as
      | 'all'
      | 'pattern'
      | 'meaning'
      | 'example';
    const pageParam = searchParams.get('page');
    const pageSizeParam = searchParams.get('pageSize');

    const dataPath = path.join(process.cwd(), 'public/data/anki_optimized_data.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8')) as GrammarCard[];

    let filteredData = data;

    // Filter by lesson if specified
    if (lesson) {
      filteredData = filteredData.filter(card =>
        card.lesson_info.toLowerCase().includes(lesson.toLowerCase())
      );
    }

    // Filter by pattern if specified
    if (pattern) {
      filteredData = filteredData.filter(card =>
        card.grammar_pattern.toLowerCase().includes(pattern.toLowerCase())
      );
    }

    // General search functionality with scoring
    if (search && search.trim().length > 0) {
      const normalizedTerm = search.toLowerCase().trim();
      const sanitizedTerm = normalizedTerm.replace(/[\s_-]+/g, '');
      const tokens = normalizedTerm.split(/\s+/).filter(Boolean);

      const normalizeField = (value?: string | null) =>
        (value || '').toLowerCase();

      const computeFieldScore = (fieldValue?: string | null) => {
        const normalizedField = normalizeField(fieldValue);
        if (!normalizedField) return 0;

        const sanitizedField = normalizedField.replace(/[\s_-]+/g, '');
        let score = 0;

        if (sanitizedTerm && sanitizedField === sanitizedTerm) {
          score = Math.max(score, 1);
        }

        if (sanitizedTerm && sanitizedField.startsWith(sanitizedTerm)) {
          score = Math.max(score, 0.95);
        }

        if (normalizedField.startsWith(normalizedTerm)) {
          score = Math.max(score, 0.9);
        }

        if (normalizedField.includes(normalizedTerm)) {
          score = Math.max(score, 0.8);
        }

        if (tokens.length > 1) {
          const allTokensPresent = tokens.every(token => normalizedField.includes(token));
          if (allTokensPresent) {
            score = Math.max(score, 0.75);
          }
        }

        for (const token of tokens) {
          if (normalizedField.includes(token)) {
            const tokenScore = Math.min(0.7, 0.4 + token.length / Math.max(normalizedField.length, 1));
            score = Math.max(score, tokenScore);
          }
        }

        return score;
      };

      const selectFields = (card: GrammarCard): (string | null | undefined)[] => {
        switch (searchType) {
          case 'pattern':
            return [card.grammar_pattern, card.grammar_formation, card.style_notes];
          case 'meaning':
            return [card.chinese_meaning, card.explanation_chinese, card.translation, card.additional_notes_zh];
          case 'example':
            return [card.front_sentence, card.back_sentence, card.detailed_explanation];
          default:
            return [
              card.grammar_pattern,
              card.grammar_formation,
              card.chinese_meaning,
              card.explanation_chinese,
              card.translation,
              card.front_sentence,
              card.back_sentence,
              card.additional_notes,
              card.additional_notes_zh,
              card.detailed_explanation,
              card.style_notes
            ];
        }
      };

      filteredData = filteredData
        .map(card => {
          const fields = selectFields(card);
          const score = fields.reduce((max, field) => {
            const fieldScore = computeFieldScore(field);
            return fieldScore > max ? fieldScore : max;
          }, 0);

          return { card, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(item => item.card);
    }

    const totalItems = filteredData.length;
    const defaultPageSize = 20;

    if (limit && !pageParam && !pageSizeParam) {
      const limitNum = Math.max(1, parseInt(limit, 10) || defaultPageSize);
      const limitedData = filteredData.slice(0, limitNum);
      return NextResponse.json({
        success: true,
        data: limitedData,
        total: totalItems,
        page: 1,
        pageSize: limitNum,
        totalPages: Math.max(1, Math.ceil(totalItems / limitNum))
      });
    }

    const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
    const pageSize = Math.max(
      1,
      Math.min(parseInt(pageSizeParam ?? String(defaultPageSize), 10) || defaultPageSize, 100)
    );

    const start = (page - 1) * pageSize;
    const paginatedData = filteredData.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      data: paginatedData,
      total: totalItems,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize))
    });
  } catch (error) {
    console.error('Error loading cards:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load cards' },
      { status: 500 }
    );
  }
}
