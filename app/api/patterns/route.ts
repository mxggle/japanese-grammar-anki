import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataPath = path.join(process.cwd(), 'public/data/grammar_patterns_index.json');
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

    return NextResponse.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Error loading patterns:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load patterns' },
      { status: 500 }
    );
  }
}
