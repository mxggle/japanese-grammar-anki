import type { DailyStats as SyncDailyStats, UserProgress, UserStats as SyncUserStats } from './unifiedStorage';

interface StoredCardProgress extends UserProgress {
  id?: number;
  userId: string;
  lastUpdated?: string;
}

interface StoredUserStats extends SyncUserStats {
  userId: string;
  lastUpdated?: string;
}

interface StoredDailyStats extends SyncDailyStats {
  id?: number;
  userId: string;
  lastUpdated?: string;
}

// Client-side database using IndexedDB for offline storage
class ClientDatabase {
  private dbName = 'japanese-grammar-anki';
  private version = 1;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create stores
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'clerkId' });
          userStore.createIndex('email', 'email', { unique: true });
        }

        if (!db.objectStoreNames.contains('cardProgress')) {
          const progressStore = db.createObjectStore('cardProgress', { keyPath: 'id', autoIncrement: true });
          progressStore.createIndex('userId_cardId', ['userId', 'cardId'], { unique: true });
        }

        if (!db.objectStoreNames.contains('userStats')) {
          db.createObjectStore('userStats', { keyPath: 'userId' });
        }

        if (!db.objectStoreNames.contains('dailyStats')) {
          const dailyStore = db.createObjectStore('dailyStats', { keyPath: 'id', autoIncrement: true });
          dailyStore.createIndex('userId_date', ['userId', 'date'], { unique: true });
        }
      };
    });
  }

  async saveCardProgress(userId: string, cardId: string, progress: UserProgress): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cardProgress'], 'readwrite');
      const store = transaction.objectStore('cardProgress');
      const index = store.index('userId_cardId');

      const getRequest = index.get([userId, cardId]);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;

        const data: StoredCardProgress = {
          ...(existing ?? {}),
          userId,
          ...progress,
          cardId,
          lastUpdated: new Date().toISOString()
        };

        if (existing?.id !== undefined) {
          data.id = existing.id;
        }

        const putRequest = store.put(data);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  async getCardProgress(userId: string, cardId?: string): Promise<StoredCardProgress | StoredCardProgress[] | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['cardProgress'], 'readonly');
      const store = transaction.objectStore('cardProgress');
      const index = store.index('userId_cardId');

      if (cardId) {
        const request = index.get([userId, cardId]);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result as StoredCardProgress | undefined);
      } else {
        const request = index.getAll(IDBKeyRange.bound([userId], [userId, {}]));
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve((request.result as StoredCardProgress[]) || []);
      }
    });
  }

  async saveUserStats(userId: string, stats: SyncUserStats): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['userStats'], 'readwrite');
      const store = transaction.objectStore('userStats');

      const data: StoredUserStats = {
        userId,
        ...stats,
        lastUpdated: new Date().toISOString()
      };

      const request = store.put(data);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getUserStats(userId: string): Promise<StoredUserStats | undefined> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['userStats'], 'readonly');
      const store = transaction.objectStore('userStats');

      const request = store.get(userId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as StoredUserStats | undefined);
    });
  }

  async saveDailyStats(userId: string, date: string, stats: SyncDailyStats): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['dailyStats'], 'readwrite');
      const store = transaction.objectStore('dailyStats');
      const index = store.index('userId_date');

      // First try to get existing record
      const getRequest = index.get([userId, date]);
      getRequest.onsuccess = () => {
        const existing = getRequest.result;
        const data: StoredDailyStats = {
          ...existing,
          userId,
          ...stats,
          date,
          lastUpdated: new Date().toISOString()
        };

        const putRequest = store.put(data);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getDailyStats(userId: string, days: number = 30): Promise<StoredDailyStats[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['dailyStats'], 'readonly');
      const store = transaction.objectStore('dailyStats');
      const index = store.index('userId_date');

      const request = index.getAll(IDBKeyRange.bound([userId], [userId, {}]));
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = (request.result as StoredDailyStats[]) || [];
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const filtered = results.filter(item =>
          new Date(item.date) >= cutoffDate
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        resolve(filtered);
      };
    });
  }
}

export const clientDB = new ClientDatabase();
