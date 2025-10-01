import { NextRequest, NextResponse } from 'next/server';
import { auth, createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/app/lib/db';
import {
  scheduleCard,
  stateToPersistence,
  cardProgressToState,
  normalizeSettings,
  type AnkiSettings,
  type CardStatus,
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

export async function GET() {
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

interface SerializedState {
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: CardStatus;
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech?: boolean;
  lastReviewed?: string | null;
  nextReview?: string | null;
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
      state?: SerializedState;
      learnedNewCard?: boolean;
      isReviewCard?: boolean;
    };

    const {
      cardId,
      grade,
      studyTimeSeconds,
      settings: settingsInput,
      state: providedState,
      learnedNewCard: learnedNewCardInput,
      isReviewCard: isReviewCardInput,
    } = body;

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

    let schedulingResult: ReturnType<typeof scheduleCard> | null = null;
    let persistence = providedState ? deserializeState(providedState, now) : null;

    if (!persistence) {
      schedulingResult = scheduleCard({
        previousState: cardProgressToState(existingProgress),
        grade: grade as 0 | 1 | 2 | 3,
        settings,
        now,
      });
      persistence = stateToPersistence(schedulingResult.state);
    }

    if (!persistence) {
      throw new Error('Unable to determine card state');
    }

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
      version: (existingProgress?.version ?? 0) + 1,
      correctCount,
      incorrectCount,
      totalReviews,
      averageGrade
    };
    const learnedNewCard = learnedNewCardInput ?? (schedulingResult ? (schedulingResult.wasNewCard && schedulingResult.state.status !== 'new') : !existingProgress);
    const isReviewCard = isReviewCardInput ?? Boolean(existingProgress && (existingProgress.status === 'review' || existingProgress.status === 'relearning'));

    const result = await db.$transaction(async (tx) => {
      const cardProgress = existingProgress
        ? await tx.cardProgress.update({
            where: {
              userId_cardId: {
                userId: user.id,
                cardId
              }
            },
            data: progressPayload
          })
        : await tx.cardProgress.create({
            data: {
              userId: user.id,
              cardId,
              ...progressPayload
            }
          });

      await tx.userStats.upsert({
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
          ...(learnedNewCard ? { totalCardsStudied: { increment: 1 } } : {}),
          totalCorrectAnswers: { increment: grade >= 2 ? 1 : 0 },
          totalIncorrectAnswers: { increment: grade < 2 ? 1 : 0 },
          totalStudyTime: { increment: studyTimeSeconds ?? 0 },
          lastStudyDate: now
        }
      });

      const todayIso = new Date().toISOString().split('T')[0];

      await tx.dailyStats.upsert({
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
          ...(learnedNewCard ? { newCardsLearned: { increment: 1 } } : {}),
          ...(isReviewCard ? { reviewsCompleted: { increment: 1 } } : {})
        }
      });

      return cardProgress;
    });

    return NextResponse.json({
      success: true,
      data: {
        cardId,
        userId: user.id,
        interval: result.interval,
        easeFactor: result.easeFactor,
        repetitions: result.repetitions,
        status: result.status,
        stepIndex: result.stepIndex,
        lapses: result.lapses,
        previousInterval: result.previousInterval,
        isLeech: result.isLeech,
        lastReviewed: result.lastReviewed?.toISOString(),
        nextReview: result.nextReview?.toISOString(),
        grade,
        correctCount: result.correctCount,
        incorrectCount: result.incorrectCount,
        totalReviews: result.totalReviews,
        averageGrade: result.averageGrade,
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

function deserializeState(state: SerializedState, fallbackDate: Date) {
  const toDate = (value?: string | null) => (value ? new Date(value) : null);

  return {
    easeFactor: state.easeFactor,
    interval: state.interval,
    repetitions: state.repetitions,
    status: state.status,
    stepIndex: state.stepIndex,
    lapses: state.lapses,
    previousInterval: state.previousInterval,
    isLeech: Boolean(state.isLeech),
    lastReviewed: toDate(state.lastReviewed) ?? fallbackDate,
    nextReview: toDate(state.nextReview)
  };
}
