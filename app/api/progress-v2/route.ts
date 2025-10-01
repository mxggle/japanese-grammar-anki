import { NextRequest, NextResponse } from 'next/server';
import { auth, createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/app/lib/db';
import {
  scheduleCard,
  cardProgressToState,
  stateToPersistence,
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

function calculateChecksum(data: Record<string, unknown>): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

interface ProgressUpdatePayload {
  cardId: string;
  grade: number;
  studyTimeSeconds?: number;
  sessionId?: string;
  checksum?: string;
  lastModified?: string;
  deviceId?: string;
  settings?: Partial<AnkiSettings>;
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

    const body = await request.json() as ProgressUpdatePayload;
    const {
      cardId,
      grade,
      studyTimeSeconds,
      sessionId,
      checksum,
      lastModified,
      deviceId,
      settings: settingsInput
    } = body;

    // Enhanced validation
    if (!cardId || grade === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: cardId or grade' },
        { status: 400 }
      );
    }

    if (typeof grade !== 'number' || grade < 0 || grade > 3) {
      return NextResponse.json(
        { success: false, error: 'Invalid grade value' },
        { status: 400 }
      );
    }

    // Validate optional parameters
    if (studyTimeSeconds !== undefined && (typeof studyTimeSeconds !== 'number' || studyTimeSeconds < 0 || studyTimeSeconds > 86400)) {
      return NextResponse.json(
        { success: false, error: 'Invalid study time (must be 0-86400 seconds)' },
        { status: 400 }
      );
    }

    const user = await getOrCreateUser(clerkUserId);

    // Get headers for conflict detection
    const clientVersion = request.headers.get('X-Client-Version');
    const requestDeviceId = request.headers.get('X-Device-ID') ?? deviceId ?? undefined;
    const requestOperationId = request.headers.get('X-Operation-ID');

    // Check for existing progress
    const existingProgress = await db.cardProgress.findUnique({
      where: {
        userId_cardId: {
          userId: user.id,
          cardId
        }
      }
    });

    // Conflict detection
    if (existingProgress && clientVersion) {
      const serverVersion = existingProgress.version || 1;
      const clientVersionNum = parseInt(clientVersion);

      if (clientVersionNum < serverVersion) {
        // Client is behind server, return conflict
        return NextResponse.json(
          {
            success: false,
            error: 'Version conflict',
            conflict: {
              type: 'version',
              serverVersion: serverVersion,
              clientVersion: clientVersionNum,
              serverData: {
                cardId: existingProgress.cardId,
                interval: existingProgress.interval,
                easeFactor: existingProgress.easeFactor,
                repetitions: existingProgress.repetitions,
                status: existingProgress.status,
                stepIndex: existingProgress.stepIndex,
                lapses: existingProgress.lapses,
                previousInterval: existingProgress.previousInterval,
                isLeech: existingProgress.isLeech,
                lastReviewed: existingProgress.lastReviewed?.toISOString(),
                version: serverVersion,
                lastModified: existingProgress.updatedAt?.toISOString()
              }
            }
          },
          { status: 409 }
        );
      }

      // Check for concurrent modifications
      if (existingProgress.updatedAt && lastModified) {
        const serverTime = existingProgress.updatedAt.getTime();
        const clientTime = new Date(lastModified).getTime();
        const timeDiff = Math.abs(serverTime - clientTime);

        // If modifications happened within 30 seconds and from different devices
        if (timeDiff < 30000 && existingProgress.lastSyncedDeviceId !== requestDeviceId) {
          return NextResponse.json(
            {
              success: false,
              error: 'Concurrent modification conflict',
              conflict: {
                type: 'concurrent',
                serverTime: existingProgress.updatedAt.toISOString(),
                clientTime: lastModified,
                serverDeviceId: existingProgress.lastSyncedDeviceId,
                clientDeviceId: requestDeviceId
              }
            },
            { status: 409 }
          );
        }
      }
    }

    const now = new Date();
    const settings = normalizeSettings(settingsInput as Partial<AnkiSettings> | undefined);

    const schedulingResult = scheduleCard({
      previousState: cardProgressToState(existingProgress),
      grade: grade as 0 | 1 | 2 | 3,
      settings,
      now,
    });

    const persistence = stateToPersistence(schedulingResult.state);

    if (checksum) {
      const expectedChecksum = calculateChecksum({
        cardId,
        grade,
        interval: persistence.interval,
        easeFactor: persistence.easeFactor,
        repetitions: persistence.repetitions,
        status: persistence.status,
        stepIndex: persistence.stepIndex,
      });

      if (checksum !== expectedChecksum) {
        return NextResponse.json(
          {
            success: false,
            error: 'Data integrity check failed',
            expectedChecksum,
            receivedChecksum: checksum
          },
          { status: 400 }
        );
      }
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
      correctCount,
      incorrectCount,
      totalReviews,
      averageGrade,
      version: (existingProgress?.version ?? 0) + 1,
      lastSyncedDeviceId: requestDeviceId,
      sessionId,
      updatedAt: now
    };

    const isReviewCard = Boolean(existingProgress && (existingProgress.status === 'review' || existingProgress.status === 'relearning'));
    const learnedNewCard = schedulingResult.wasNewCard && schedulingResult.state.status !== 'new';

    // Start database transaction for atomic updates
    const result = await db.$transaction(async (tx) => {
      // Update or create card progress
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

      // Update user stats
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
          difficultyCards: persistence.easeFactor < 2.0 ? 1 : 0
        },
        update: {
          totalCardsStudied: { increment: 1 },
          totalCorrectAnswers: { increment: grade >= 2 ? 1 : 0 },
          totalIncorrectAnswers: { increment: grade < 2 ? 1 : 0 },
          totalStudyTime: { increment: studyTimeSeconds ?? 0 },
          lastStudyDate: now
        }
      });

      // Update daily stats
      const today = new Date().toISOString().split('T')[0];
      await tx.dailyStats.upsert({
        where: {
          userId_date: {
            userId: user.id,
            date: new Date(today)
          }
        },
        create: {
          userId: user.id,
          date: new Date(today),
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

      return cardProgress;
    });

    // Prepare response
    const responseData = {
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
      version: result.version,
      lastModified: result.updatedAt?.toISOString(),
      syncedAt: now.toISOString(),
      operationId: requestOperationId,
      scheduling: schedulingResult
    };

    // Add response checksum for verification
    const responseChecksum = calculateChecksum({
      cardId: responseData.cardId,
      interval: responseData.interval,
      easeFactor: responseData.easeFactor,
      repetitions: responseData.repetitions,
      status: responseData.status,
      stepIndex: responseData.stepIndex,
      version: responseData.version
    });

    return NextResponse.json({
      success: true,
      data: responseData,
      checksum: responseChecksum,
      serverTime: now.toISOString()
    });

  } catch (error) {
    console.error('Error updating progress:', error);

    // Enhanced error response
    const errorResponse = {
      success: false,
      error: 'Internal server error',
      errorId: `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    // Don't expose internal error details in production
    if (process.env.NODE_ENV === 'development') {
      errorResponse.error = error instanceof Error ? error.message : 'Unknown error';
    }

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
