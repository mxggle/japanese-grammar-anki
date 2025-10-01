import type { CardProgress } from '@prisma/client';

export type AnkiGrade = 0 | 1 | 2 | 3;

export type CardStatus = 'new' | 'learning' | 'review' | 'relearning' | 'suspended';

export interface AnkiSettings {
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
  graduatingInterval: number; // days
  easyInterval: number; // days
  easyBonus: number; // multiplier
  intervalModifier: number; // multiplier
  hardMultiplier: number; // multiplier
  lapseMultiplier: number; // multiplier (fraction of previous interval)
  minimumInterval: number; // days
  maximumInterval: number; // days
  startingEase: number; // ease factor (e.g. 2.5)
  leechThreshold: number; // lapse count before marking leech
  leechAction: 'none' | 'tag' | 'suspend';
  newCardsPerDay: number;
  reviewLimitPerDay: number;
  learningHardIntervalMultiplier: number; // multiplier applied to hard during learning steps
}

export interface AnkiCardState {
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: CardStatus;
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech: boolean;
  nextReview?: string | null;
  lastReviewed?: string | null;
}

export interface SchedulingResult {
  state: AnkiCardState;
  previousState: AnkiCardState;
  nextReview: Date | null;
  grade: AnkiGrade;
  action: 'again' | 'hard' | 'good' | 'easy';
  queue: CardStatus;
  isLapse: boolean;
  didGraduate: boolean;
  wasNewCard: boolean;
  becameLeech: boolean;
}

export interface PersistableCardState {
  easeFactor: number;
  interval: number;
  repetitions: number;
  status: CardStatus;
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech: boolean;
  lastReviewed: Date | null;
  nextReview: Date | null;
}

const MILLIS_PER_MINUTE = 60_000;
const MIN_EASE = 1.3;

const defaultLearningSteps = [1, 10];
const defaultRelearningSteps = [10];

export const defaultAnkiSettings: AnkiSettings = {
  learningSteps: defaultLearningSteps,
  relearningSteps: defaultRelearningSteps,
  graduatingInterval: 1,
  easyInterval: 4,
  easyBonus: 1.3,
  intervalModifier: 1,
  hardMultiplier: 1.2,
  lapseMultiplier: 0,
  minimumInterval: 1,
  maximumInterval: 36500,
  startingEase: 2.5,
  leechThreshold: 8,
  leechAction: 'tag',
  newCardsPerDay: 20,
  reviewLimitPerDay: 200,
  learningHardIntervalMultiplier: 1,
};

export function normalizeSettings(partial?: Partial<AnkiSettings>): AnkiSettings {
  const settings: AnkiSettings = {
    ...defaultAnkiSettings,
    ...(partial ?? {}),
  };

  settings.learningSteps = normaliseSteps(settings.learningSteps, defaultLearningSteps);
  settings.relearningSteps = normaliseSteps(settings.relearningSteps, defaultRelearningSteps);
  settings.graduatingInterval = clampNumber(settings.graduatingInterval, 1, settings.maximumInterval);
  settings.easyInterval = clampNumber(settings.easyInterval, settings.graduatingInterval, settings.maximumInterval);
  settings.easyBonus = clampNumber(settings.easyBonus, 1.0, 5.0);
  settings.intervalModifier = clampNumber(settings.intervalModifier, 0.5, 3.0);
  settings.hardMultiplier = clampNumber(settings.hardMultiplier, 1.0, 2.5);
  settings.lapseMultiplier = clampNumber(settings.lapseMultiplier, 0, 1.0);
  settings.minimumInterval = clampNumber(settings.minimumInterval, 0.1, settings.maximumInterval);
  settings.maximumInterval = Math.max(settings.maximumInterval, settings.minimumInterval);
  settings.startingEase = clampNumber(settings.startingEase, MIN_EASE, 5.0);
  settings.leechThreshold = Math.max(1, Math.round(settings.leechThreshold));
  settings.newCardsPerDay = Math.max(0, Math.round(settings.newCardsPerDay));
  settings.reviewLimitPerDay = Math.max(0, Math.round(settings.reviewLimitPerDay));
  settings.learningHardIntervalMultiplier = clampNumber(settings.learningHardIntervalMultiplier, 1, 3);

  return settings;
}

export function scheduleCard(
  options: {
    previousState?: Partial<AnkiCardState> | null;
    grade: AnkiGrade;
    settings?: Partial<AnkiSettings>;
    now?: Date | string | number;
  },
): SchedulingResult {
  const settings = normalizeSettings(options.settings);
  const now = normaliseDate(options.now);
  const action = gradeToAction(options.grade);

  const baseState = createBaseState(settings);
  const previousState = mergeStates(baseState, options.previousState ?? undefined);
  const state = { ...previousState };

  state.lastReviewed = now.toISOString();

  let nextReview: Date | null = null;
  let didGraduate = false;
  let isLapse = false;
  const wasNewCard = previousState.status === 'new';

  switch (action) {
    case 'again':
      ({ nextReview, isLapse } = handleAgain(state, previousState, settings, now));
      break;
    case 'hard':
      nextReview = handleHard(state, previousState, settings, now);
      break;
    case 'good':
      ({ nextReview, didGraduate } = handleGood(state, previousState, settings, now));
      break;
    case 'easy':
      ({ nextReview, didGraduate } = handleEasy(state, previousState, settings, now));
      break;
  }

  const becameLeech = updateLeech(state, settings, isLapse);

  state.nextReview = nextReview ? nextReview.toISOString() : null;

  return {
    state,
    previousState,
    nextReview,
    grade: options.grade,
    action,
    queue: state.status,
    isLapse,
    didGraduate,
    wasNewCard,
    becameLeech,
  };
}

export function cardProgressToState(progress: CardProgress | null | undefined): Partial<AnkiCardState> | undefined {
  if (!progress) {
    return undefined;
  }

  return {
    easeFactor: progress.easeFactor,
    interval: progress.interval,
    repetitions: progress.repetitions,
    status: (progress.status as CardStatus) ?? 'new',
    stepIndex: progress.stepIndex ?? 0,
    lapses: progress.lapses ?? 0,
    previousInterval: progress.previousInterval ?? 0,
    isLeech: progress.isLeech ?? false,
    nextReview: progress.nextReview?.toISOString?.() ?? (progress.nextReview as unknown as string | undefined),
    lastReviewed: progress.lastReviewed?.toISOString?.() ?? (progress.lastReviewed as unknown as string | undefined),
  };
}

export function parseSteps(value: string): number[] {
  if (!value) return [];
  return value
    .split(',')
    .map(step => step.trim())
    .filter(Boolean)
    .map(step => {
      const numeric = Number(step);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return null;
      }
      return numeric;
    })
    .filter((n): n is number => n !== null);
}

export function stateToPersistence(state: AnkiCardState): PersistableCardState {
  return {
    easeFactor: state.easeFactor,
    interval: state.interval,
    repetitions: state.repetitions,
    status: state.status,
    stepIndex: state.stepIndex,
    lapses: state.lapses,
    previousInterval: state.previousInterval,
    isLeech: state.isLeech,
    lastReviewed: state.lastReviewed ? new Date(state.lastReviewed) : null,
    nextReview: state.nextReview ? new Date(state.nextReview) : null,
  };
}

function handleAgain(
  state: AnkiCardState,
  previousState: AnkiCardState,
  settings: AnkiSettings,
  now: Date,
): { nextReview: Date | null; isLapse: boolean } {
  const wasReview = previousState.status === 'review';
  const wasRelearning = previousState.status === 'relearning';
  const isLapse = wasReview;

  if (wasReview) {
    state.lapses = previousState.lapses + 1;
    state.easeFactor = Math.max(MIN_EASE, previousState.easeFactor - 0.2);
    state.previousInterval = Math.max(previousState.interval, settings.minimumInterval);
    const relapseInterval = settings.relearningSteps.length > 0
      ? Math.max(settings.minimumInterval, Math.round(state.previousInterval * settings.lapseMultiplier))
      : Math.max(settings.minimumInterval, Math.round(state.previousInterval * settings.lapseMultiplier));

    state.interval = relapseInterval;
    state.status = settings.relearningSteps.length > 0 ? 'relearning' : 'review';
    state.stepIndex = 0;

    if (settings.relearningSteps.length > 0) {
      const minutes = settings.relearningSteps[0];
      return { nextReview: addMinutes(now, minutes), isLapse };
    }

    return { nextReview: addDays(now, state.interval), isLapse };
  }

  if (wasRelearning) {
    state.stepIndex = 0;
    state.status = 'relearning';
    return {
      nextReview: addMinutes(now, settings.relearningSteps[0] ?? settings.learningSteps[0] ?? 10),
      isLapse,
    };
  }

  // New or learning card
  state.status = 'learning';
  state.stepIndex = 0;
  state.interval = 0;
  return {
    nextReview: addMinutes(now, settings.learningSteps[0] ?? settings.relearningSteps[0] ?? 1),
    isLapse,
  };
}

function handleHard(
  state: AnkiCardState,
  previousState: AnkiCardState,
  settings: AnkiSettings,
  now: Date,
): Date | null {
  const wasReview = previousState.status === 'review';

  if (wasReview) {
    const prevInterval = Math.max(previousState.interval, settings.minimumInterval);
    const hardInterval = Math.max(prevInterval + 1, Math.round(prevInterval * settings.hardMultiplier));
    const adjusted = applyIntervalBounds(hardInterval * settings.intervalModifier, settings);

    state.interval = adjusted;
    state.status = 'review';
    state.stepIndex = 0;
    state.easeFactor = Math.max(MIN_EASE, previousState.easeFactor - 0.15);
    state.repetitions = previousState.repetitions + 1;
    state.previousInterval = prevInterval;

    return addDays(now, adjusted);
  }

  if (previousState.status === 'relearning') {
    const idx = Math.max(0, previousState.stepIndex);
    const multiplier = settings.learningHardIntervalMultiplier;
    const steps = settings.relearningSteps.length > 0 ? settings.relearningSteps : settings.learningSteps;
    const minutes = steps[Math.min(idx, steps.length - 1)] ?? 10;
    state.status = 'relearning';
    state.stepIndex = idx;
    return addMinutes(now, minutes * multiplier);
  }

  // New/learning card: repeat current step with multiplier
  const steps = settings.learningSteps;
  const idx = Math.max(0, Math.min(previousState.stepIndex, steps.length - 1));
  const minutes = steps[idx] ?? steps[steps.length - 1] ?? 10;
  state.status = 'learning';
  state.stepIndex = idx;
  return addMinutes(now, minutes * settings.learningHardIntervalMultiplier);
}

function handleGood(
  state: AnkiCardState,
  previousState: AnkiCardState,
  settings: AnkiSettings,
  now: Date,
): { nextReview: Date | null; didGraduate: boolean } {
  if (previousState.status === 'review') {
    const prevInterval = Math.max(previousState.interval, settings.minimumInterval);
    let interval = Math.round(prevInterval * previousState.easeFactor * settings.intervalModifier);
    interval = Math.max(interval, prevInterval + 1);
    interval = applyIntervalBounds(interval, settings);

    state.interval = interval;
    state.status = 'review';
    state.stepIndex = 0;
    state.easeFactor = previousState.easeFactor;
    state.repetitions = previousState.repetitions + 1;
    state.previousInterval = prevInterval;
    return { nextReview: addDays(now, interval), didGraduate: false };
  }

  if (previousState.status === 'relearning') {
    const steps = settings.relearningSteps.length > 0 ? settings.relearningSteps : settings.learningSteps;
    const lastStepIndex = steps.length - 1;
    const currentIndex = Math.max(0, Math.min(previousState.stepIndex, lastStepIndex));

    if (currentIndex < lastStepIndex) {
      state.status = 'relearning';
      state.stepIndex = currentIndex + 1;
      return { nextReview: addMinutes(now, steps[state.stepIndex]), didGraduate: false };
    }

    state.status = 'review';
    state.stepIndex = 0;
    const baseInterval = Math.max(previousState.interval, settings.minimumInterval);
    const adjusted = applyIntervalBounds(baseInterval * settings.intervalModifier, settings);
    state.interval = adjusted;
    state.repetitions = previousState.repetitions + 1;
    state.previousInterval = baseInterval;
    return { nextReview: addDays(now, adjusted), didGraduate: false };
  }

  // New or learning card
  const steps = settings.learningSteps;
  const lastStepIndex = steps.length - 1;
  const currentIndex = Math.max(0, Math.min(previousState.stepIndex, lastStepIndex));

  if (currentIndex < lastStepIndex) {
    state.status = 'learning';
    state.stepIndex = currentIndex + 1;
    return { nextReview: addMinutes(now, steps[state.stepIndex]), didGraduate: false };
  }

  // Graduate to review
  state.status = 'review';
  state.stepIndex = 0;
  const interval = applyIntervalBounds(settings.graduatingInterval * settings.intervalModifier, settings);
  state.interval = interval;
  state.easeFactor = previousState.easeFactor || settings.startingEase;
  state.repetitions = previousState.repetitions + 1;
  state.previousInterval = previousState.interval;

  return { nextReview: addDays(now, interval), didGraduate: true };
}

function handleEasy(
  state: AnkiCardState,
  previousState: AnkiCardState,
  settings: AnkiSettings,
  now: Date,
): { nextReview: Date | null; didGraduate: boolean } {
  state.easeFactor = Math.max(MIN_EASE, previousState.easeFactor + 0.15);

  if (previousState.status === 'review') {
    const prevInterval = Math.max(previousState.interval, settings.minimumInterval);
    let interval = prevInterval * state.easeFactor * settings.intervalModifier * settings.easyBonus;
    interval = Math.max(interval, prevInterval + 1);
    interval = applyIntervalBounds(interval, settings);

    state.interval = interval;
    state.status = 'review';
    state.stepIndex = 0;
    state.repetitions = previousState.repetitions + 1;
    state.previousInterval = prevInterval;
    return { nextReview: addDays(now, interval), didGraduate: false };
  }

  if (previousState.status === 'relearning') {
    state.status = 'review';
    state.stepIndex = 0;
    const baseInterval = Math.max(previousState.interval, settings.minimumInterval);
    let interval = baseInterval * settings.easyBonus;
    interval = applyIntervalBounds(interval * settings.intervalModifier, settings);
    state.interval = interval;
    state.repetitions = previousState.repetitions + 1;
    state.previousInterval = baseInterval;
    return { nextReview: addDays(now, interval), didGraduate: false };
  }

  // New card - graduate immediately with easy bonus
  state.status = 'review';
  state.stepIndex = 0;
  const baseInterval = Math.max(settings.easyInterval, settings.minimumInterval);
  const interval = applyIntervalBounds(baseInterval * settings.easyBonus * settings.intervalModifier, settings);
  state.interval = interval;
  state.repetitions = previousState.repetitions + 1;
  state.previousInterval = previousState.interval;

  return { nextReview: addDays(now, interval), didGraduate: true };
}

function updateLeech(state: AnkiCardState, settings: AnkiSettings, isLapse: boolean): boolean {
  if (!isLapse) {
    return false;
  }

  if (state.lapses >= settings.leechThreshold) {
    state.isLeech = true;
    if (settings.leechAction === 'suspend') {
      state.status = 'suspended';
      state.nextReview = null;
    }
    return true;
  }

  return false;
}

function createBaseState(settings: AnkiSettings): AnkiCardState {
  return {
    easeFactor: settings.startingEase,
    interval: 0,
    repetitions: 0,
    status: 'new',
    stepIndex: 0,
    lapses: 0,
    previousInterval: 0,
    isLeech: false,
    nextReview: null,
    lastReviewed: null,
  };
}

function mergeStates(base: AnkiCardState, override?: Partial<AnkiCardState>): AnkiCardState {
  if (!override) {
    return { ...base };
  }

  return {
    ...base,
    ...override,
    status: override.status ?? base.status,
    stepIndex: override.stepIndex ?? base.stepIndex,
    lapses: override.lapses ?? base.lapses,
    previousInterval: override.previousInterval ?? base.previousInterval,
    isLeech: override.isLeech ?? base.isLeech,
  };
}

function normaliseDate(value?: Date | string | number): Date {
  if (!value) return new Date();
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

function gradeToAction(grade: AnkiGrade): SchedulingResult['action'] {
  switch (grade) {
    case 0:
      return 'again';
    case 1:
      return 'hard';
    case 2:
      return 'good';
    case 3:
      return 'easy';
    default:
      return 'good';
  }
}

function normaliseSteps(input: number[] | undefined | null, fallback: number[]): number[] {
  const steps = Array.isArray(input) ? input.filter(step => Number.isFinite(step) && step > 0) : [];
  if (steps.length === 0) {
    return [...fallback];
  }
  return steps.map(step => Number(step));
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function addMinutes(base: Date, minutes: number): Date {
  const mins = Number.isFinite(minutes) ? minutes : 1;
  const result = new Date(base);
  result.setTime(result.getTime() + mins * MILLIS_PER_MINUTE);
  return result;
}

function addDays(base: Date, days: number): Date {
  const dayValue = Number.isFinite(days) ? days : 1;
  return addMinutes(base, dayValue * 1440);
}

function applyIntervalBounds(rawInterval: number, settings: AnkiSettings): number {
  const sanitized = Number.isFinite(rawInterval) ? rawInterval : settings.minimumInterval;
  const rounded = Math.round(Math.max(sanitized, settings.minimumInterval) * 100) / 100;
  return Math.min(rounded, settings.maximumInterval);
}
