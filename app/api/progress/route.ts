import { NextRequest, NextResponse } from 'next/server';

// In-memory storage for demo - in production, use a database
const studyProgress: { [cardId: string]: { interval: number; easiness: number; repetitions: number; nextReview: Date } } = {};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cardId = searchParams.get('cardId');

    if (cardId) {
      return NextResponse.json({
        success: true,
        data: studyProgress[cardId] || null
      });
    }

    return NextResponse.json({
      success: true,
      data: studyProgress
    });
  } catch (error) {
    console.error('Error loading progress:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load progress' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardId, grade } = body; // grade: 0 (again), 1 (hard), 2 (good), 3 (easy)

    if (!cardId || grade === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing cardId or grade' },
        { status: 400 }
      );
    }

    // Get existing progress or create new
    const current = studyProgress[cardId] || {
      interval: 1,
      easiness: 2.5,
      repetitions: 0,
      nextReview: new Date()
    };

    // SM-2 algorithm for spaced repetition
    let { interval, easiness, repetitions } = current;

    if (grade >= 2) {
      // Correct answer
      if (repetitions === 0) {
        interval = 1;
      } else if (repetitions === 1) {
        interval = 6;
      } else {
        interval = Math.round(interval * easiness);
      }
      repetitions++;
    } else {
      // Incorrect answer
      repetitions = 0;
      interval = 1;
    }

    // Update easiness factor
    easiness = Math.max(1.3, easiness + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)));

    const nextReview = new Date();
    nextReview.setDate(nextReview.getDate() + interval);

    studyProgress[cardId] = {
      interval,
      easiness,
      repetitions,
      nextReview
    };

    return NextResponse.json({
      success: true,
      data: studyProgress[cardId]
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}