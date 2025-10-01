import { NextResponse } from "next/server";
import { auth, createClerkClient } from "@clerk/nextjs/server";
import { db } from "@/app/lib/db";

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

type DailyDataInput = {
  date?: string;
  cardsStudied?: number;
  correctAnswers?: number;
  incorrectAnswers?: number;
  studyTime?: number;
  sessionsCount?: number;
  newCardsLearned?: number;
  reviewsCompleted?: number;
};

interface NormalizedDailyData {
  date: Date;
  cardsStudied: number;
  correctAnswers: number;
  incorrectAnswers: number;
  studyTime: number;
  sessionsCount: number;
  newCardsLearned: number;
  reviewsCompleted: number;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function resolveDailyDate(dateInput?: string): Date {
  if (dateInput) {
    const explicitDate = new Date(`${dateInput}T00:00:00.000Z`);
    if (!Number.isNaN(explicitDate.getTime())) {
      return explicitDate;
    }
  }

  const todayIso = new Date().toISOString().split("T")[0];
  return new Date(`${todayIso}T00:00:00.000Z`);
}

function normalizeDailyData(payload: DailyDataInput | null | undefined): NormalizedDailyData | null {
  if (!payload) {
    return null;
  }

  const cardsStudied = Math.max(0, Math.round(payload.cardsStudied ?? 0));
  const correctAnswers = Math.max(0, Math.round(payload.correctAnswers ?? 0));
  const incorrectAnswers = Math.max(0, Math.round(payload.incorrectAnswers ?? 0));
  const studyTime = Math.max(0, Math.round(payload.studyTime ?? 0));
  const sessionsCount = Math.max(0, Math.round(payload.sessionsCount ?? 0));
  const newCardsLearned = Math.max(0, Math.round(payload.newCardsLearned ?? 0));
  const reviewsCompleted = Math.max(0, Math.round(payload.reviewsCompleted ?? 0));

  const totalActivity =
    cardsStudied +
    correctAnswers +
    incorrectAnswers +
    studyTime +
    sessionsCount +
    newCardsLearned +
    reviewsCompleted;

  if (totalActivity === 0) {
    return null;
  }

  return {
    date: resolveDailyDate(payload.date),
    cardsStudied,
    correctAnswers,
    incorrectAnswers,
    studyTime,
    sessionsCount,
    newCardsLearned,
    reviewsCompleted,
  };
}

async function getOrCreateUser(clerkUserId: string) {
  const existingUser = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (existingUser) {
    return existingUser;
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.primaryEmailAddress?.emailAddress ||
    clerkUser.emailAddresses[0]?.emailAddress ||
    `${clerkUserId}@users.clerk.dev`;

  return db.user.create({
    data: {
      clerkId: clerkUserId,
      email,
    },
  });
}

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Ensure user exists in database
    const user = await getOrCreateUser(clerkUserId);

    // Get user stats
    let userStats = await db.userStats.findUnique({
      where: { userId: user.id },
    });

    if (!userStats) {
      // Create initial user stats
      userStats = await db.userStats.create({
        data: {
          userId: user.id,
          totalCardsStudied: 0,
          totalCorrectAnswers: 0,
          totalIncorrectAnswers: 0,
          totalStudyTime: 0,
          totalSessions: 0,
          averageAccuracy: 0,
          currentStreak: 0,
          longestStreak: 0,
          cardsPerDay: 0,
          studyTimePerDay: 0,
          masteredCards: 0,
          difficultyCards: 0,
        },
      });
    }

    // Get recent daily stats (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentDailyStats = await db.dailyStats.findMany({
      where: {
        userId: user.id,
        date: {
          gte: sevenDaysAgo,
        },
      },
      orderBy: {
        date: "desc",
      },
      take: 7,
    });

    // Get recent study sessions
    const recentSessions = await db.studySession.findMany({
      where: {
        userId: user.id,
      },
      orderBy: {
        startTime: "desc",
      },
      take: 10,
    });

    // Get card progress stats
    const cardProgressStats = await db.cardProgress.aggregate({
      where: {
        userId: user.id,
      },
      _count: {
        id: true,
      },
      _avg: {
        easeFactor: true,
        averageGrade: true,
      },
      _sum: {
        correctCount: true,
        incorrectCount: true,
        totalReviews: true,
      },
    });

    // Get mastery distribution
    const masteryDistribution = await db.cardProgress.groupBy({
      by: ["easeFactor"],
      where: {
        userId: user.id,
      },
      _count: {
        id: true,
      },
    });

    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    const todayStats = await db.dailyStats.findFirst({
      where: {
        userId: user.id,
        date: new Date(today),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        userStats: {
          totalCardsStudied: userStats.totalCardsStudied,
          totalCorrectAnswers: userStats.totalCorrectAnswers,
          totalIncorrectAnswers: userStats.totalIncorrectAnswers,
          totalStudyTime: userStats.totalStudyTime,
          totalSessions: userStats.totalSessions,
          averageAccuracy: userStats.averageAccuracy,
          currentStreak: userStats.currentStreak,
          longestStreak: userStats.longestStreak,
          cardsPerDay: userStats.cardsPerDay,
          studyTimePerDay: userStats.studyTimePerDay,
          masteredCards: userStats.masteredCards,
          difficultyCards: userStats.difficultyCards,
          lastStudyDate: userStats.lastStudyDate?.toISOString() || null,
        },
        recentDailyStats: recentDailyStats.map((stat) => ({
          date: stat.date.toISOString().split("T")[0],
          cardsStudied: stat.cardsStudied,
          correctAnswers: stat.correctAnswers,
          incorrectAnswers: stat.incorrectAnswers,
          studyTime: stat.studyTime,
          sessionsCount: stat.sessionsCount,
          currentStreak: stat.currentStreak,
        })),
        recentSessions: recentSessions.map((session) => ({
          ...session,
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString() || null,
        })),
        cardProgressStats,
        masteryDistribution,
        todayStats: todayStats
          ? {
              date: todayStats.date.toISOString().split("T")[0],
              cardsStudied: todayStats.cardsStudied,
              correctAnswers: todayStats.correctAnswers,
              incorrectAnswers: todayStats.incorrectAnswers,
              studyTime: todayStats.studyTime,
              sessionsCount: todayStats.sessionsCount,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error loading statistics:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Database connection issue - please try again later",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Find user in database
    const user = await getOrCreateUser(clerkUserId);

    const body = await request.json();
    const { sessionData, dailyData, dailyDataBatch } = body;

    // Update session data if provided
    if (sessionData) {
      await db.studySession.create({
        data: {
          userId: user.id,
          ...sessionData,
        },
      });
    }

    const dailyPayloads: DailyDataInput[] = Array.isArray(dailyDataBatch)
      ? dailyDataBatch
      : dailyData
        ? [dailyData]
        : [];

    let statsUpdated = false;
    for (const payload of dailyPayloads) {
      const updated = await processDailyData(user.id, payload);
      if (updated) {
        statsUpdated = true;
      }
    }

    // Recalculate derived statistics
    if (statsUpdated) {
      await updateDerivedStats(user.id);
    }

    return NextResponse.json({
      success: true,
      message: "Statistics updated successfully",
    });
  } catch (error) {
    console.error("Error updating statistics:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update statistics" },
      { status: 500 }
    );
  }
}

async function processDailyData(
  userId: string,
  payload: DailyDataInput
): Promise<boolean> {
  const normalized = normalizeDailyData(payload);

  if (!normalized) {
    return false;
  }

  const {
    date,
    cardsStudied,
    correctAnswers,
    incorrectAnswers,
    studyTime,
    sessionsCount,
    newCardsLearned,
    reviewsCompleted,
  } = normalized;

  await db.$transaction(async (tx) => {
    const existingStats = await tx.userStats.findUnique({
      where: { userId },
      select: { lastStudyDate: true },
    });

    await tx.dailyStats.upsert({
      where: {
        userId_date: {
          userId,
          date,
        },
      },
      update: {
        cardsStudied: { increment: cardsStudied },
        correctAnswers: { increment: correctAnswers },
        incorrectAnswers: { increment: incorrectAnswers },
        studyTime: { increment: studyTime },
        sessionsCount: { increment: sessionsCount },
        newCardsLearned: { increment: newCardsLearned },
        reviewsCompleted: { increment: reviewsCompleted },
      },
      create: {
        userId,
        date,
        cardsStudied,
        correctAnswers,
        incorrectAnswers,
        studyTime,
        sessionsCount,
        newCardsLearned,
        reviewsCompleted,
      },
    });

    if (!existingStats) {
      await tx.userStats.create({
        data: {
          userId,
          totalCardsStudied: cardsStudied,
          totalCorrectAnswers: correctAnswers,
          totalIncorrectAnswers: incorrectAnswers,
          totalStudyTime: studyTime,
          totalSessions: sessionsCount,
          lastStudyDate:
            cardsStudied + correctAnswers + incorrectAnswers + studyTime > 0
              ? date
              : null,
        },
      });
      return;
    }

    const nextLastStudyDate =
      !existingStats.lastStudyDate || date > existingStats.lastStudyDate
        ? date
        : existingStats.lastStudyDate;

    await tx.userStats.update({
      where: { userId },
      data: {
        totalCardsStudied: { increment: cardsStudied },
        totalCorrectAnswers: { increment: correctAnswers },
        totalIncorrectAnswers: { increment: incorrectAnswers },
        totalStudyTime: { increment: studyTime },
        totalSessions: { increment: sessionsCount },
        lastStudyDate: nextLastStudyDate,
      },
    });
  });

  return true;
}

async function updateDerivedStats(userId: string) {
  const userStats = await db.userStats.findUnique({
    where: { userId },
  });

  if (!userStats) {
    return;
  }

  const total = userStats.totalCorrectAnswers + userStats.totalIncorrectAnswers;
  const accuracy = total > 0 ? (userStats.totalCorrectAnswers / total) * 100 : 0;

  const [masteredCards, difficultyCards, streaks] = await Promise.all([
    db.cardProgress.count({
      where: {
        userId,
        easeFactor: { gte: 2.8 },
      },
    }),
    db.cardProgress.count({
      where: {
        userId,
        easeFactor: { lt: 2.0 },
      },
    }),
    calculateStreaks(userId),
  ]);

  const daysSinceStart = Math.max(
    1,
    Math.ceil((Date.now() - userStats.createdAt.getTime()) / DAY_IN_MS)
  );

  await db.userStats.update({
    where: { userId },
    data: {
      averageAccuracy: accuracy,
      masteredCards,
      difficultyCards,
      cardsPerDay: userStats.totalCardsStudied / daysSinceStart,
      studyTimePerDay: userStats.totalStudyTime / daysSinceStart,
      currentStreak: streaks.currentStreak,
      longestStreak: streaks.longestStreak,
    },
  });
}

async function calculateStreaks(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
}> {
  const dailyDates = await db.dailyStats.findMany({
    where: {
      userId,
      cardsStudied: { gt: 0 },
    },
    select: { date: true },
    orderBy: { date: "asc" },
  });

  if (dailyDates.length === 0) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  const dateStrings = dailyDates.map((stat) =>
    stat.date.toISOString().split("T")[0]
  );
  const uniqueDates = Array.from(new Set(dateStrings));

  let longest = 0;
  let running = 0;
  let previous: Date | null = null;

  for (const dateString of uniqueDates) {
    const currentDate = new Date(`${dateString}T00:00:00.000Z`);

    if (!previous) {
      running = 1;
    } else {
      const diffDays = Math.round(
        (currentDate.getTime() - previous.getTime()) / DAY_IN_MS
      );

      if (diffDays === 1) {
        running += 1;
      } else if (diffDays > 1) {
        running = 1;
      }
    }

    longest = Math.max(longest, running);
    previous = currentDate;
  }

  let current = 0;
  if (uniqueDates.length > 0) {
    current = 1;
    for (let i = uniqueDates.length - 1; i > 0; i--) {
      const latest = new Date(`${uniqueDates[i]}T00:00:00.000Z`);
      const previousDate = new Date(`${uniqueDates[i - 1]}T00:00:00.000Z`);
      const diffDays = Math.round(
        (latest.getTime() - previousDate.getTime()) / DAY_IN_MS
      );

      if (diffDays === 1) {
        current += 1;
      } else {
        break;
      }
    }
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
  };
}
