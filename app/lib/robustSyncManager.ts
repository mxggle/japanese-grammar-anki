'use client';

import { localStatsManager } from './localStats';
import { clientDB } from './clientDB';
import { userSettingsManager } from './userSettings';
import { scheduleCard, type AnkiCardState, type AnkiSettings } from './srs/ankiScheduler';

// Enhanced interfaces for robust syncing
export interface SyncableEntity {
  id: string;
  version: number;
  lastModified: string;
  syncStatus: 'pending' | 'syncing' | 'synced' | 'conflict';
  checksum?: string;
}

export interface ProgressRecord extends SyncableEntity {
  cardId: string;
  userId: string;
  grade: number;
  interval: number;
  easeFactor: number;
  repetitions: number;
  status: AnkiCardState['status'];
  stepIndex: number;
  lapses: number;
  previousInterval: number;
  isLeech: boolean;
  nextReview?: string | null;
  studyTimeSeconds: number;
  sessionId: string;
  settings: AnkiSettings;
}

export interface StudySession extends SyncableEntity {
  userId: string;
  mode: 'study' | 'review' | 'browse';
  startTime: string;
  endTime?: string;
  progressRecords: ProgressRecord[];
  deviceId: string;
}

export interface SyncConflict {
  entityId: string;
  entityType: 'progress' | 'session' | 'stats';
  localVersion: unknown;
  serverVersion: unknown;
  conflictType: 'version' | 'concurrent' | 'data';
  timestamp: string;
}

export interface SyncOperation {
  id: string;
  type: 'create' | 'update' | 'delete';
  entityType: 'progress' | 'session' | 'stats';
  entityId: string;
  payload: unknown;
  timestamp: string;
  retryCount: number;
  priority: 'high' | 'medium' | 'low';
}

export interface SyncMetrics {
  lastSuccessfulSync: string | null;
  pendingOperations: number;
  conflictsCount: number;
  syncErrors: string[];
  networkLatency: number;
  syncDuration: number;
}

class RobustSyncManager {
  private userId: string | null = null;
  private deviceId: string;
  private syncQueue: SyncOperation[] = [];
  private conflicts: SyncConflict[] = [];
  private syncInProgress = false;
  private syncLock = false;
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private metrics: SyncMetrics = {
    lastSuccessfulSync: null,
    pendingOperations: 0,
    conflictsCount: 0,
    syncErrors: [],
    networkLatency: 0,
    syncDuration: 0
  };

  // Network and connectivity monitoring
  private isOnline = true;
  private networkQuality: 'good' | 'fair' | 'poor' = 'good';
  private syncIntervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.deviceId = this.generateDeviceId();
    this.setupNetworkMonitoring();
    this.setupPeriodicSync();
    this.loadQueueFromStorage();
  }

  private generateDeviceId(): string {
    let deviceId = localStorage.getItem('deviceId');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('deviceId', deviceId);
    }
    return deviceId;
  }

  private setupNetworkMonitoring() {
    if (typeof window === 'undefined') return;

    // Monitor online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.triggerSync('network_reconnect');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });

    // Monitor network quality
    if ('connection' in navigator) {
      type NetworkInformation = {
        effectiveType?: string;
        addEventListener?: (type: string, listener: () => void) => void;
      };

      const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
      const updateNetworkQuality = () => {
        const effectiveType = connection.effectiveType;
        if (effectiveType === '4g') {
          this.networkQuality = 'good';
        } else if (effectiveType === '3g') {
          this.networkQuality = 'fair';
        } else {
          this.networkQuality = 'poor';
        }
      };

      connection?.addEventListener?.('change', updateNetworkQuality);
      updateNetworkQuality();
    }

    this.isOnline = navigator.onLine;
  }

  private setupPeriodicSync() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    // Adaptive sync interval based on network quality
    const getInterval = () => {
      switch (this.networkQuality) {
        case 'good': return 30000; // 30 seconds
        case 'fair': return 60000; // 1 minute
        case 'poor': return 120000; // 2 minutes
        default: return 30000;
      }
    };

    this.syncIntervalId = setInterval(() => {
      if (this.isOnline && !this.syncInProgress && this.syncQueue.length > 0) {
        this.triggerSync('periodic');
      }
    }, getInterval());
  }

  setUserId(userId: string) {
    this.userId = userId;
    localStatsManager.setUserId(userId);
    userSettingsManager.setUserId(userId);
    this.loadQueueFromStorage();
  }

  // Enhanced operation queueing with priority and deduplication
  private enqueueOperation(operation: Omit<SyncOperation, 'id' | 'timestamp' | 'retryCount'>): string {
    const operationId = `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Check for duplicate operations
    const existingIndex = this.syncQueue.findIndex(
      op => op.entityType === operation.entityType &&
            op.entityId === operation.entityId &&
            op.type === operation.type
    );

    const newOperation: SyncOperation = {
      ...operation,
      id: operationId,
      timestamp: new Date().toISOString(),
      retryCount: 0
    };

    if (existingIndex >= 0) {
      // Replace existing operation with newer one
      this.syncQueue[existingIndex] = newOperation;
    } else {
      // Add new operation and sort by priority
      this.syncQueue.push(newOperation);
      this.sortQueueByPriority();
    }

    this.saveQueueToStorage();
    this.updateMetrics();
    return operationId;
  }

  private sortQueueByPriority() {
    const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
    this.syncQueue.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      // Secondary sort by timestamp
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });
  }

  // Save study progress with conflict detection
  async saveProgress(cardId: string, grade: number, studyTimeSeconds: number, sessionId: string): Promise<string> {
    if (!this.userId) throw new Error('User not authenticated');

    const progressId = `progress_${this.userId}_${cardId}_${Date.now()}`;
    const now = new Date().toISOString();

    const settings = userSettingsManager.getSrsSettings();
    const existingProgress = await this.getExistingProgress(cardId);
    const previousState = existingProgress ? mapStoredProgressToState(existingProgress, settings) : undefined;
    const schedulingResult = scheduleCard({
      previousState,
      grade: Math.max(0, Math.min(3, grade)) as 0 | 1 | 2 | 3,
      settings,
      now: new Date(now)
    });
    const state = schedulingResult.state;
    const learnedNewCard = schedulingResult.wasNewCard && state.status !== 'new';
    const isReviewCard = previousState ? previousState.status === 'review' || previousState.status === 'relearning' : false;

    const progressRecord: ProgressRecord = {
      id: progressId,
      cardId,
      userId: this.userId,
      grade,
      interval: state.interval,
      easeFactor: state.easeFactor,
      repetitions: state.repetitions,
      status: state.status,
      stepIndex: state.stepIndex,
      lapses: state.lapses,
      previousInterval: state.previousInterval,
      isLeech: state.isLeech,
      nextReview: state.nextReview ?? null,
      studyTimeSeconds,
      sessionId,
      version: (existingProgress?.version ?? 0) + 1,
      lastModified: now,
      syncStatus: 'pending',
      checksum: this.calculateChecksum({
        cardId,
        grade,
        interval: state.interval,
        easeFactor: state.easeFactor,
        repetitions: state.repetitions,
        status: state.status,
        stepIndex: state.stepIndex,
        studyTimeSeconds
      })
    };

    // Save locally first
    await this.saveProgressLocally(progressRecord);

    // Update local stats immediately
    localStatsManager.saveCardProgress(
      cardId,
      grade,
      state,
      studyTimeSeconds,
      { learnedNewCard, isReviewCard }
    );

    // Queue for sync
    const operationId = this.enqueueOperation({
      type: 'update',
      entityType: 'progress',
      entityId: progressId,
      payload: progressRecord,
      priority: 'high'
    });

    // Trigger immediate sync if online and not currently syncing
    if (this.isOnline && !this.syncInProgress) {
      this.triggerSync('user_action');
    }

    return operationId;
  }

  private calculateChecksum(data: Record<string, unknown>): string {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  // Main sync orchestration with conflict resolution
  private async triggerSync(trigger: string): Promise<boolean> {
    if (!this.userId || !this.isOnline || this.syncLock) {
      return false;
    }

    this.syncLock = true;
    this.syncInProgress = true;
    const syncStartTime = Date.now();

    try {
      console.log(`Starting sync triggered by: ${trigger}`);

      // Process operations in batches
      const batchSize = this.networkQuality === 'good' ? 10 : 5;
      const operations = this.syncQueue.slice(0, batchSize);

      if (operations.length === 0) {
        return true;
      }

      // Group operations by type for efficient processing
      const groupedOps = this.groupOperationsByType(operations);

      // Process each group with conflict resolution
      for (const [entityType, ops] of Object.entries(groupedOps)) {
        await this.processOperationGroup(entityType, ops);
      }

      // Update metrics
      this.metrics.syncDuration = Date.now() - syncStartTime;
      this.metrics.lastSuccessfulSync = new Date().toISOString();
      this.updateMetrics();

      return true;

    } catch (error) {
      console.error('Sync failed:', error);
      this.metrics.syncErrors.push(`${new Date().toISOString()}: ${error}`);
      this.handleSyncFailure(error);
      return false;
    } finally {
      this.syncInProgress = false;
      this.syncLock = false;
    }
  }

  private groupOperationsByType(operations: SyncOperation[]): Record<string, SyncOperation[]> {
    return operations.reduce((groups, op) => {
      if (!groups[op.entityType]) {
        groups[op.entityType] = [];
      }
      groups[op.entityType].push(op);
      return groups;
    }, {} as Record<string, SyncOperation[]>);
  }

  private async processOperationGroup(entityType: SyncOperation['entityType'], operations: SyncOperation[]): Promise<void> {
    for (const operation of operations) {
      try {
        const success = await this.processOperation(operation);
        if (success) {
          this.removeFromQueue(operation.id);
        } else {
          await this.handleOperationFailure(operation);
        }
      } catch (error) {
        console.error(`Operation ${operation.id} failed:`, error);
        await this.handleOperationFailure(operation);
      }
    }
  }

  private async processOperation(operation: SyncOperation): Promise<boolean> {
    const startTime = Date.now();

    try {
      let response: Response;

      switch (operation.entityType) {
        case 'progress':
          response = await this.syncProgressRecord(operation);
          break;
        case 'session':
          response = await this.syncSession(operation);
          break;
        case 'stats':
          response = await this.syncStats(operation);
          break;
        default:
          throw new Error(`Unknown entity type: ${operation.entityType}`);
      }

      this.metrics.networkLatency = Date.now() - startTime;

      if (response.ok) {
        const result = await response.json();
        await this.handleSuccessfulSync(operation, result);
        return true;
      } else {
        if (response.status === 409) {
          // Conflict detected
          const serverData = await response.json();
          await this.handleConflict(operation, serverData);
        }
        return false;
      }
    } catch (error) {
      console.error(`Sync operation failed:`, error);
      return false;
    }
  }

  private async syncProgressRecord(operation: SyncOperation): Promise<Response> {
    const payload = operation.payload as ProgressRecord;

    return fetch('/api/progress', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
        'X-Operation-ID': operation.id,
        'X-Client-Version': payload.version?.toString() ?? '1'
      },
      body: JSON.stringify({
        cardId: payload.cardId,
        grade: payload.grade,
        studyTimeSeconds: payload.studyTimeSeconds,
        sessionId: payload.sessionId,
        checksum: payload.checksum,
        lastModified: payload.lastModified,
        settings: payload.settings
      })
    });
  }

  private async syncSession(operation: SyncOperation): Promise<Response> {
    const { payload } = operation;

    return fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
        'X-Operation-ID': operation.id
      },
      body: JSON.stringify(payload)
    });
  }

  private async syncStats(operation: SyncOperation): Promise<Response> {
    const { payload } = operation;

    return fetch('/api/stats', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-ID': this.deviceId,
        'X-Operation-ID': operation.id
      },
      body: JSON.stringify(payload)
    });
  }

  private async handleConflict(operation: SyncOperation, serverData: unknown): Promise<void> {
    const conflict: SyncConflict = {
      entityId: operation.entityId,
      entityType: operation.entityType,
      localVersion: operation.payload,
      serverVersion: serverData,
      conflictType: 'version',
      timestamp: new Date().toISOString()
    };

    this.conflicts.push(conflict);
    this.metrics.conflictsCount++;

    // Implement conflict resolution strategy
    const resolution = await this.resolveConflict(conflict);

    if (resolution && operation.entityType === 'progress') {
      operation.payload = resolution;
      operation.retryCount = 0;
    } else if (operation.entityType === 'progress') {
      const payload = operation.payload as ProgressRecord;
      payload.syncStatus = 'conflict';
    }
  }

  private async resolveConflict(conflict: SyncConflict): Promise<ProgressRecord | null> {
    // Implement different resolution strategies based on conflict type
    switch (conflict.conflictType) {
      case 'version':
        return this.resolveVersionConflict(conflict);
      case 'concurrent':
        return this.resolveConcurrentConflict(conflict);
      case 'data':
        return this.resolveDataConflict(conflict);
      default:
        return null;
    }
  }

  private resolveVersionConflict(conflict: SyncConflict): ProgressRecord | null {
    if (conflict.entityType !== 'progress') {
      return null;
    }

    const local = conflict.localVersion as ProgressRecord | undefined;
    const server = conflict.serverVersion as ProgressRecord | undefined;

    if (!local || !server || !local.lastModified || !server.lastModified) {
      return null;
    }

    const localTime = new Date(local.lastModified).getTime();
    const serverTime = new Date(server.lastModified).getTime();

    if (localTime > serverTime) {
      return {
        ...local,
        version: Math.max(local.version ?? 0, server.version ?? 0) + 1
      };
    }

    return null; // Accept server version
  }

  private resolveConcurrentConflict(conflict: SyncConflict): ProgressRecord | null {
    if (conflict.entityType !== 'progress') {
      return null;
    }

    const local = conflict.localVersion as ProgressRecord | undefined;
    const server = conflict.serverVersion as ProgressRecord | undefined;

    if (!local || !server) {
      return local ?? server ?? null;
    }

    return {
      ...server,
      ...local,
      version: Math.max(local.version ?? 0, server.version ?? 0) + 1,
      lastModified: new Date().toISOString()
    };
  }

  private resolveDataConflict(conflict: SyncConflict): ProgressRecord | null {
    if (conflict.entityType !== 'progress') {
      return null;
    }
    return conflict.localVersion as ProgressRecord | null;
  }

  private async handleSuccessfulSync(operation: SyncOperation, result: unknown): Promise<void> {
    // Update local storage with server response
    if (operation.entityType === 'progress') {
      const payload = (result as { data?: ProgressRecord })?.data;
      if (payload) {
        await this.updateLocalProgress(operation.entityId, payload);
      }
    }

    // Mark as synced
    if (operation.entityType === 'progress') {
      const payload = operation.payload as ProgressRecord;
      payload.syncStatus = 'synced';
      payload.lastSynced = new Date().toISOString();
    }
  }

  private async handleOperationFailure(operation: SyncOperation): Promise<void> {
    operation.retryCount++;

    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, operation.retryCount), 30000);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    if (operation.retryCount < 5) {
      // Schedule retry
      const timeoutId = setTimeout(() => {
        this.retryTimeouts.delete(operation.id);
        if (this.isOnline) {
          this.triggerSync('retry');
        }
      }, delay);

      this.retryTimeouts.set(operation.id, timeoutId);
    } else {
      // Max retries exceeded, mark as failed
      if (operation.entityType === 'progress') {
        (operation.payload as ProgressRecord).syncStatus = 'conflict';
      }
      this.metrics.syncErrors.push(`Operation ${operation.id} failed after max retries`);
    }
  }

  private removeFromQueue(operationId: string): void {
    this.syncQueue = this.syncQueue.filter(op => op.id !== operationId);
    this.saveQueueToStorage();
    this.updateMetrics();
  }

  private saveQueueToStorage(): void {
    if (!this.userId) return;

    const key = `syncQueue_${this.userId}`;
    localStorage.setItem(key, JSON.stringify(this.syncQueue));
  }

  private loadQueueFromStorage(): void {
    if (!this.userId) return;

    const key = `syncQueue_${this.userId}`;
    const stored = localStorage.getItem(key);

    if (stored) {
      try {
        this.syncQueue = JSON.parse(stored);
        this.sortQueueByPriority();
      } catch (error) {
        console.error('Failed to load sync queue:', error);
        this.syncQueue = [];
      }
    }
  }

  private updateMetrics(): void {
    this.metrics.pendingOperations = this.syncQueue.length;

    // Save metrics to storage
    if (this.userId) {
      const key = `syncMetrics_${this.userId}`;
      localStorage.setItem(key, JSON.stringify(this.metrics));
    }
  }

  private async saveProgressLocally(progress: ProgressRecord): Promise<void> {
    try {
      // Save to IndexedDB
      await clientDB.saveCardProgress(this.userId!, progress.cardId, progress);

      // Save to localStorage as backup
      const key = `progress_${this.userId}_${progress.cardId}`;
      localStorage.setItem(key, JSON.stringify(progress));
    } catch (error) {
      console.error('Failed to save progress locally:', error);
    }
  }

  private async getExistingProgress(cardId: string): Promise<ProgressRecord | null> {
    try {
      return await clientDB.getCardProgress(this.userId!, cardId) as ProgressRecord | null;
    } catch (error) {
      console.warn('Failed to load progress from IndexedDB, checking localStorage fallback:', error);
      const key = `progress_${this.userId}_${cardId}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) as ProgressRecord : null;
    }
  }

  private async updateLocalProgress(progressId: string, serverData: ProgressRecord): Promise<void> {
    try {
      await clientDB.saveCardProgress(this.userId!, serverData.cardId, {
        ...serverData,
        syncStatus: 'synced',
        lastSynced: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to update local progress:', error);
    }
  }

  // Public API methods
  getSyncMetrics(): SyncMetrics {
    return { ...this.metrics };
  }

  getConflicts(): SyncConflict[] {
    return [...this.conflicts];
  }

  async forcSync(): Promise<boolean> {
    return this.triggerSync('manual');
  }

  hasUnsyncedData(): boolean {
    return this.syncQueue.length > 0;
  }

  getPendingOperationsCount(): number {
    return this.syncQueue.length;
  }

  clearSyncQueue(): void {
    this.syncQueue = [];
    this.saveQueueToStorage();
    this.updateMetrics();
  }

  // Cleanup method
  destroy(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
    }

    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
  }
}

function mapStoredProgressToState(progress: Record<string, unknown> | null | undefined, settings: AnkiSettings): AnkiCardState {
  if (!progress) {
    return {
      easeFactor: settings.startingEase,
      interval: 0,
      repetitions: 0,
      status: 'new',
      stepIndex: 0,
      lapses: 0,
      previousInterval: 0,
      isLeech: false,
      lastReviewed: null,
      nextReview: null
    };
  }

  const data = progress as Record<string, unknown>;

  const getNumber = (value: unknown, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;

  const parseDate = (value: unknown) => {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    return null;
  };

  return {
    easeFactor: getNumber(data.easeFactor, settings.startingEase),
    interval: getNumber(data.interval, 0),
    repetitions: getNumber(data.repetitions, 0),
    status: (data.status as AnkiCardState['status']) ?? 'new',
    stepIndex: getNumber(data.stepIndex, 0),
    lapses: getNumber(data.lapses, 0),
    previousInterval: getNumber(data.previousInterval, 0),
    isLeech: Boolean(data.isLeech),
    lastReviewed: parseDate(data.lastReviewed ?? data.timestamp),
    nextReview: parseDate(data.nextReview)
  };
}

export const robustSyncManager = new RobustSyncManager();
