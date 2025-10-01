import { NextRequest, NextResponse } from 'next/server';
import { auth, createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/app/lib/db';
import {
  scheduleCard,
  stateToPersistence,
  cardProgressToState,
  normalizeSettings,
  type AnkiSettings,
} from '@/app/lib/srs/ankiScheduler';

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

async function getOrCreateUser(clerkUserId: string) {
  const existingUser = await db.user.findUnique({
    where: { clerkId: clerkUserId }
  });

  if (existingUser) {
    return existingUser;
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email = clerkUser.primaryEmailAddress?.emailAddress
    || clerkUser.emailAddresses[0]?.emailAddress
    || `${clerkUserId}@users.clerk.dev`;

  return db.user.create({
    data: {
      clerkId: clerkUserId,
      email
    }
  });
}

export async function GET(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await getOrCreateUser(clerkUserId);

    const cardProgress = await db.cardProgress.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        lastReviewed: 'desc'
      }
    });

    return NextResponse.json({
      success: true,
      data: cardProgress.map(progress => ({
        cardId: progress.cardId,
        easeFactor: progress.easeFactor,
        interval: progress.interval,
        repetitions: progress.repetitions,
        status: progress.status,
        stepIndex: progress.stepIndex,
        lapses: progress.lapses,
        previousInterval: progress.previousInterval,
        isLeech: progress.isLeech,
        lastReviewed: progress.lastReviewed?.toISOString(),
        nextReview: progress.nextReview?.toISOString(),
        correctCount: progress.correctCount,
        incorrectCount: progress.incorrectCount,
        totalReviews: progress.totalReviews,
        averageGrade: progress.averageGrade
      }))
    });
  } catch (error) {
    console.error('Error loading progress:', error);
    return NextResponse.json(
      { success: false, error: 'Database connection issue' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as {
      cardId: string;
      grade: number;
      studyTimeSeconds?: number;
      settings?: Partial<AnkiSettings>;
    };

    const { cardId, grade, studyTimeSeconds, settings: settingsInput } = body;

    if (!cardId || grade === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing cardId or grade' },
        { status: 400 }
      );
    }

    if (typeof grade !== 'number' || grade < 0 || grade > 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid grade value (must be 0-3)' },
        { status: 400 }
      );
    }

    if (studyTimeSeconds !== undefined && (typeof studyTimeSeconds !== 'number' || studyTimeSeconds < 0 || studyTimeSeconds > 86400)) {
      return NextResponse.json(
        { success: false, error: 'Invalid study time (must be 0-86400 seconds)' },
        { status: 400 }
      );
    }

    const user = await getOrCreateUser(clerkUserId);

    const existingProgress = await db.cardProgress.findUnique({
      where: {
        userId_cardId: {
          userId: user.id,
          cardId
        }
      }
    });

    const now = new Date();
    const settings = normalizeSettings(settingsInput);
    const schedulingResult = scheduleCard({
      previousState: cardProgressToState(existingProgress),
      grade: grade as 0 | 1 | 2 | 3,
      settings,
      now,
    });

    const persistence = stateToPersistence(schedulingResult.state);

    const totalReviews = (existingProgress?.totalReviews ?? 0) + 1;
    const correctCount = (existingProgress?.correctCount ?? 0) + (grade >= 2 ? 1 : 0);
    const incorrectCount = (existingProgress?.incorrectCount ?? 0) + (grade < 2 ? 1 : 0);
    const averageGrade = ((existingProgress?.averageGrade ?? 0) * (existingProgress?.totalReviews ?? 0) + grade) / totalReviews;

    const progressPayload = {
      easeFactor: persistence.easeFactor,
      interval: persistence.interval,
      repetitions: persistence.repetitions,
      status: persistence.status,
      stepIndex: persistence.stepIndex,
      lapses: persistence.lapses,
      previousInterval: persistence.previousInterval,
      isLeech: persistence.isLeech,
      lastReviewed: persistence.lastReviewed ?? now,
      nextReview: persistence.nextReview,
      correctCount,
      incorrectCount,
      totalReviews,
      averageGrade
    };

    const cardProgress = existingProgress
      ? await db.cardProgress.update({
          where: {
            userId_cardId: {
              userId: user.id,
              cardId
            }
          },
          data: progressPayload
        })
      : await db.cardProgress.create({
          data: {
            userId: user.id,
            cardId,
            ...progressPayload
          }
        });

    await db.userStats.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        totalCardsStudied: 1,
        totalCorrectAnswers: grade >= 2 ? 1 : 0,
        totalIncorrectAnswers: grade < 2 ? 1 : 0,
        totalStudyTime: studyTimeSeconds ?? 0,
        totalSessions: 0,
        averageAccuracy: grade >= 2 ? 100 : 0,
        currentStreak: grade >= 2 ? 1 : 0,
        longestStreak: grade >= 2 ? 1 : 0,
        cardsPerDay: 1,
        studyTimePerDay: studyTimeSeconds ?? 0,
        masteredCards: persistence.easeFactor > 2.8 ? 1 : 0,
        difficultyCards: persistence.easeFactor < 2.0 ? 1 : 0,
        lastStudyDate: now
      },
      update: {
        totalCardsStudied: { increment: 1 },
        totalCorrectAnswers: { increment: grade >= 2 ? 1 : 0 },
        totalIncorrectAnswers: { increment: grade < 2 ? 1 : 0 },
        totalStudyTime: { increment: studyTimeSeconds ?? 0 },
        lastStudyDate: now
      }
    });

    const todayIso = new Date().toISOString().split('T')[0];
    const isReviewCard = Boolean(existingProgress && (existingProgress.status === 'review' || existingProgress.status === 'relearning'));
    const learnedNewCard = schedulingResult.wasNewCard && schedulingResult.state.status !== 'new';

    await db.dailyStats.upsert({
      where: {
        userId_date: {
          userId: user.id,
          date: new Date(todayIso)
        }
      },
      create: {
        userId: user.id,
        date: new Date(todayIso),
        cardsStudied: 1,
        correctAnswers: grade >= 2 ? 1 : 0,
        incorrectAnswers: grade < 2 ? 1 : 0,
        studyTime: studyTimeSeconds ?? 0,
        sessionsCount: 0,
        newCardsLearned: learnedNewCard ? 1 : 0,
        reviewsCompleted: isReviewCard ? 1 : 0
      },
      update: {
        cardsStudied: { increment: 1 },
        correctAnswers: { increment: grade >= 2 ? 1 : 0 },
        incorrectAnswers: { increment: grade < 2 ? 1 : 0 },
        studyTime: { increment: studyTimeSeconds ?? 0 },
        newCardsLearned: { increment: learnedNewCard ? 1 : 0 },
        reviewsCompleted: { increment: isReviewCard ? 1 : 0 }
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        cardId,
        userId: user.id,
        interval: cardProgress.interval,
        easeFactor: cardProgress.easeFactor,
        repetitions: cardProgress.repetitions,
        status: cardProgress.status,
        stepIndex: cardProgress.stepIndex,
        lapses: cardProgress.lapses,
        previousInterval: cardProgress.previousInterval,
        isLeech: cardProgress.isLeech,
        lastReviewed: cardProgress.lastReviewed?.toISOString(),
        nextReview: cardProgress.nextReview?.toISOString(),
        grade,
        correctCount: cardProgress.correctCount,
        incorrectCount: cardProgress.incorrectCount,
        totalReviews: cardProgress.totalReviews,
        averageGrade: cardProgress.averageGrade,
        studyTimeSeconds: studyTimeSeconds ?? 0,
        scheduling: schedulingResult
      }
    });
  } catch (error) {
    console.error('Error updating progress:', error);
    return NextResponse.json(
      { success: false, error: 'Database connection issue' },
      { status: 500 }
    );
  }
}
