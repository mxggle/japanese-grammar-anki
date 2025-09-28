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
    const searchType = searchParams.get('searchType');

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

    // General search functionality
    if (search) {
      const searchTerm = search.toLowerCase().trim();
      filteredData = filteredData.filter(card => {
        switch (searchType) {
          case 'pattern':
            return card.grammar_pattern?.toLowerCase().includes(searchTerm) ||
                   card.grammar_formation?.toLowerCase().includes(searchTerm);
          case 'meaning':
            return card.chinese_meaning?.toLowerCase().includes(searchTerm) ||
                   card.explanation_chinese?.toLowerCase().includes(searchTerm) ||
                   card.translation?.toLowerCase().includes(searchTerm);
          case 'example':
            return card.front_sentence?.toLowerCase().includes(searchTerm) ||
                   card.back_sentence?.toLowerCase().includes(searchTerm);
          default: // 'all'
            return card.grammar_pattern?.toLowerCase().includes(searchTerm) ||
                   card.grammar_formation?.toLowerCase().includes(searchTerm) ||
                   card.chinese_meaning?.toLowerCase().includes(searchTerm) ||
                   card.explanation_chinese?.toLowerCase().includes(searchTerm) ||
                   card.translation?.toLowerCase().includes(searchTerm) ||
                   card.front_sentence?.toLowerCase().includes(searchTerm) ||
                   card.back_sentence?.toLowerCase().includes(searchTerm) ||
                   card.additional_notes?.toLowerCase().includes(searchTerm) ||
                   card.additional_notes_zh?.toLowerCase().includes(searchTerm) ||
                   card.detailed_explanation?.toLowerCase().includes(searchTerm);
        }
      });
    }

    // Limit results if specified
    if (limit) {
      const limitNum = parseInt(limit);
      filteredData = filteredData.slice(0, limitNum);
    }

    return NextResponse.json({
      success: true,
      data: filteredData,
      total: filteredData.length
    });
  } catch (error) {
    console.error('Error loading cards:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load cards' },
      { status: 500 }
    );
  }
}