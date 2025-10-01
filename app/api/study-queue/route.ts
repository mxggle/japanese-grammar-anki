import { NextRequest, NextResponse } from 'next/server';
import { auth, createClerkClient } from '@clerk/nextjs/server';
import { db } from '@/app/lib/db';
import { normalizeSettings, defaultAnkiSettings, type AnkiSettings } from '@/app/lib/srs/ankiScheduler';
import fs from 'fs';
import path from 'path';
import type { CardProgress } from '@prisma/client';

interface GrammarCard {
  id: string;
  [key: string]: unknown;
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

let cachedCards: GrammarCard[] | null = null;

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

function loadCardData(): GrammarCard[] {
  if (cachedCards) {
    return cachedCards;
  }

  const dataPath = path.join(process.cwd(), 'public/data/anki_optimized_data.json');
  const raw = fs.readFileSync(dataPath, 'utf8');
  cachedCards = JSON.parse(raw) as GrammarCard[];
  return cachedCards;
}

function resolveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (value <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return value;
}

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { settings: settingsInput, limit, mode } = body as {
      settings?: Partial<AnkiSettings>;
      limit?: number;
      mode?: 'study' | 'review' | 'browse';
    };

    const user = await getOrCreateUser(clerkUserId);
    const settings = normalizeSettings(settingsInput ?? defaultAnkiSettings);
    const sessionMode = mode ?? 'study';

    const [progressList, todayStats] = await Promise.all([
      db.cardProgress.findMany({
        where: { userId: user.id }
      }),
      db.dailyStats.findUnique({
        where: {
          userId_date: {
            userId: user.id,
            date: new Date(new Date().toISOString().split('T')[0])
          }
        }
      })
    ]);

    const cards = loadCardData();
    const cardMap = new Map(cards.map(card => [card.id, card]));

    const now = new Date();
    const progressByCard = new Map(progressList.map(progress => [progress.cardId, progress]));

    const learningDue = progressList
      .filter(progress => (progress.status === 'learning' || progress.status === 'relearning'))
      .filter(progress => {
        if (!progress.nextReview) return true;
        return progress.nextReview.getTime() <= now.getTime();
      })
      .sort((a, b) => {
        const aTime = a.nextReview ? a.nextReview.getTime() : 0;
        const bTime = b.nextReview ? b.nextReview.getTime() : 0;
        return aTime - bTime;
      });

    const reviewDue = progressList
      .filter(progress => progress.status === 'review')
      .filter(progress => progress.nextReview && progress.nextReview.getTime() <= now.getTime())
      .sort((a, b) => {
        const aTime = a.nextReview ? a.nextReview.getTime() : now.getTime();
        const bTime = b.nextReview ? b.nextReview.getTime() : now.getTime();
        return aTime - bTime;
      });

    const reviewLimit = resolveLimit(settings.reviewLimitPerDay, Number.POSITIVE_INFINITY);
    const reviewsCompleted = todayStats?.reviewsCompleted ?? 0;
    const remainingReviews = reviewLimit === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(0, reviewLimit - reviewsCompleted);

    const newLimitSetting = resolveLimit(settings.newCardsPerDay, Number.POSITIVE_INFINITY);
    const newCardsLearnedToday = todayStats?.newCardsLearned ?? 0;
    const remainingNew = newLimitSetting === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.max(0, newLimitSetting - newCardsLearnedToday);

    const selectedReview = remainingReviews === Number.POSITIVE_INFINITY
      ? reviewDue
      : reviewDue.slice(0, remainingReviews);

    const newCards: GrammarCard[] = [];
    if (sessionMode === 'study' && remainingNew !== 0) {
      for (const card of cards) {
        if (!progressByCard.has(card.id)) {
          newCards.push(card);
          if (remainingNew !== Number.POSITIVE_INFINITY && newCards.length >= remainingNew) {
            break;
          }
        }
      }
    }

    const queue: Array<{ type: 'learning' | 'review' | 'new'; card: GrammarCard; progress: CardProgress | null }> = [];

    for (const progress of learningDue) {
      const card = cardMap.get(progress.cardId);
      if (!card) continue;
      queue.push({ type: 'learning', card, progress });
    }

    for (const progress of selectedReview) {
      const card = cardMap.get(progress.cardId);
      if (!card) continue;
      queue.push({ type: 'review', card, progress });
    }

    if (sessionMode === 'study') {
      for (const card of newCards) {
        queue.push({ type: 'new', card, progress: null });
      }
    }

    const finalLimit = typeof limit === 'number' && limit > 0 ? limit : undefined;
    const slicedQueue = finalLimit ? queue.slice(0, finalLimit) : queue;

    const responseData = slicedQueue.map(item => ({
      ...item.card,
      __meta: {
        type: item.type,
        progress: item.progress
          ? {
              interval: item.progress.interval,
              easeFactor: item.progress.easeFactor,
              repetitions: item.progress.repetitions,
              status: item.progress.status,
              stepIndex: item.progress.stepIndex,
              lapses: item.progress.lapses,
              previousInterval: item.progress.previousInterval,
              isLeech: item.progress.isLeech,
              nextReview: item.progress.nextReview?.toISOString() ?? null
            }
          : null
      }
    }));

    return NextResponse.json({
      success: true,
      data: responseData,
      meta: {
        counts: {
          learningDue: learningDue.length,
          reviewDue: reviewDue.length,
          reviewSelected: selectedReview.length,
          newAvailable: sessionMode === 'study'
            ? (remainingNew === Number.POSITIVE_INFINITY ? newCards.length : remainingNew)
            : 0,
          newSelected: sessionMode === 'study' ? newCards.length : 0
        }
      }
    });
  } catch (error) {
    console.error('Failed to build study queue:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
