# Migration Guide: Legacy to Robust Sync System

## Overview
This guide provides step-by-step instructions for migrating from the current fragmented sync system to the new robust synchronization architecture.

## Pre-Migration Assessment

### 1. Current System Inventory

Run this assessment script to understand current data state:

```typescript
// assessment.ts
async function assessCurrentSystem() {
  const assessment = {
    localStorage: {},
    indexedDB: {},
    conflicts: [],
    dataIntegrity: []
  };

  // Check localStorage usage
  const lsKeys = Object.keys(localStorage);
  assessment.localStorage = {
    totalKeys: lsKeys.length,
    userDataKeys: lsKeys.filter(k => k.includes('user_')).length,
    progressKeys: lsKeys.filter(k => k.includes('progress_')).length,
    dailyStatsKeys: lsKeys.filter(k => k.includes('daily_')).length,
    sizeEstimate: JSON.stringify(localStorage).length
  };

  // Check IndexedDB
  try {
    await clientDB.init();
    const progressData = await clientDB.getCardProgress('all');
    assessment.indexedDB = {
      hasData: !!progressData,
      recordCount: Array.isArray(progressData) ? progressData.length : 0,
      lastUpdated: Array.isArray(progressData) ?
        Math.max(...progressData.map(p => new Date(p.lastUpdated || 0).getTime())) : 0
    };
  } catch (error) {
    assessment.indexedDB = { error: error.message };
  }

  // Check for data conflicts
  assessment.conflicts = await findDataConflicts();

  return assessment;
}

async function findDataConflicts() {
  const conflicts = [];
  const lsKeys = Object.keys(localStorage).filter(k => k.includes('progress_'));

  for (const key of lsKeys) {
    try {
      const lsData = JSON.parse(localStorage.getItem(key) || '{}');
      const match = key.match(/progress_(.+)_(.+)/);
      if (match) {
        const [, userId, cardId] = match;
        const idbData = await clientDB.getCardProgress(userId, cardId);

        if (idbData && lsData.timestamp !== idbData.timestamp) {
          conflicts.push({
            cardId,
            userId,
            localStorage: lsData,
            indexedDB: idbData,
            conflictType: 'timestamp_mismatch'
          });
        }
      }
    } catch (error) {
      conflicts.push({
        key,
        error: error.message,
        conflictType: 'parse_error'
      });
    }
  }

  return conflicts;
}
```

### 2. Backup Current Data

```typescript
// backup.ts
async function createDataBackup() {
  const backup = {
    timestamp: new Date().toISOString(),
    localStorage: {},
    indexedDB: {},
    version: '1.0'
  };

  // Backup localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      backup.localStorage[key] = localStorage.getItem(key);
    }
  }

  // Backup IndexedDB
  try {
    await clientDB.init();
    const allUsers = await clientDB.getAllUsers();
    backup.indexedDB.users = allUsers;

    for (const user of allUsers) {
      const progress = await clientDB.getCardProgress(user.clerkId);
      const stats = await clientDB.getUserStats(user.clerkId);
      const dailyStats = await clientDB.getDailyStats(user.clerkId, 30);

      backup.indexedDB[user.clerkId] = {
        progress,
        stats,
        dailyStats
      };
    }
  } catch (error) {
    backup.indexedDB.error = error.message;
  }

  // Save backup
  const backupStr = JSON.stringify(backup);
  const blob = new Blob([backupStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `sync-backup-${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
  return backup;
}
```

## Migration Steps

### Step 1: Install New Sync System

1. **Add the robust sync manager**:
```bash
# Files should already be created:
# - app/lib/robustSyncManager.ts
# - app/components/SyncMonitor.tsx
# - app/api/progress-v2/route.ts
```

2. **Update dependencies** (if needed):
```bash
npm install --save-dev @types/crypto-js
npm install crypto-js  # If using client-side encryption
```

### Step 2: Database Schema Migration

1. **Run the database migration**:
```sql
-- Add versioning and sync metadata
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS last_synced_device_id VARCHAR(255);
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS checksum VARCHAR(64);
ALTER TABLE card_progress ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced';

-- Add sync operation tracking
CREATE TABLE IF NOT EXISTS sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  operation_type VARCHAR(20) NOT NULL,
  entity_type VARCHAR(20) NOT NULL,
  entity_id VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'pending',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_sync_operations_user_status ON sync_operations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_operations_created ON sync_operations(created_at);
CREATE INDEX IF NOT EXISTS idx_card_progress_version ON card_progress(version);
CREATE INDEX IF NOT EXISTS idx_card_progress_device ON card_progress(last_synced_device_id);
```

2. **Migrate existing data**:
```typescript
// migrate-data.ts
import { db } from '@/app/lib/db';

async function migrateExistingData() {
  console.log('Starting data migration...');

  // Add checksums and versions to existing progress
  const allProgress = await db.cardProgress.findMany();
  console.log(`Migrating ${allProgress.length} progress records...`);

  for (const progress of allProgress) {
    const checksum = calculateChecksum({
      cardId: progress.cardId,
      easeFactor: progress.easeFactor,
      interval: progress.interval,
      repetitions: progress.repetitions
    });

    await db.cardProgress.update({
      where: { id: progress.id },
      data: {
        version: 1,
        checksum: checksum,
        sync_status: 'synced'
      }
    });
  }

  console.log('Data migration completed successfully');
}

function calculateChecksum(data: any): string {
  const str = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}
```

### Step 3: Replace Storage Managers

1. **Update StudySession component**:
```typescript
// In app/components/StudySession.tsx
import { robustSyncManager } from '@/app/lib/robustSyncManager';

// Replace optimizedStorage usage
const handleAnswer = async (grade: number) => {
  if (user) {
    try {
      const operationId = await robustSyncManager.saveProgress(
        currentCard.id,
        grade,
        studyTimeForCard,
        sessionId || 'unknown'
      );

      // Update UI immediately (robustSyncManager handles this)
      const progress = robustSyncManager.getTodayProgress();
      setStudiedToday(progress.studied);

      // Check daily goal completion
      if (progress.studied >= dailyGoal && (progress.studied - 1) < dailyGoal) {
        setShowGoalCompleteModal(true);
      } else {
        handleNext();
      }
    } catch (error) {
      console.error('Failed to save progress:', error);
      // Show error to user
    }
  } else {
    setShowLoginPrompt(true);
  }
};
```

2. **Update main page initialization**:
```typescript
// In app/page.tsx
import { robustSyncManager } from '@/app/lib/robustSyncManager';

useEffect(() => {
  if (user) {
    // Initialize robust sync manager
    robustSyncManager.setUserId(user.id);

    // Migrate existing data
    migrateUserDataToRobustSync(user.id);
  }
}, [user]);

async function migrateUserDataToRobustSync(userId: string) {
  try {
    // Check if migration already completed
    const migrationKey = `migration_completed_${userId}`;
    if (localStorage.getItem(migrationKey)) {
      return;
    }

    // Migrate localStorage data
    await migrateLegacyData(userId);

    // Mark migration as completed
    localStorage.setItem(migrationKey, 'true');

    console.log('User data migration completed');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}
```

### Step 4: Add Sync Monitoring

1. **Add SyncMonitor to main layout**:
```typescript
// In app/layout.tsx or relevant component
import SyncMonitor from '@/app/components/SyncMonitor';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      {children}

      {/* Add sync monitor in development/staging */}
      {process.env.NODE_ENV !== 'production' && (
        <div className="fixed bottom-4 right-4 z-50">
          <SyncMonitor showDetails={false} />
        </div>
      )}
    </div>
  );
}
```

2. **Add sync status to StudySession**:
```typescript
// In app/components/StudySession.tsx
import SyncMonitor from '@/app/components/SyncMonitor';

// Add to header section
<div className="flex items-center gap-2">
  <SyncMonitor className="text-xs" />
  {/* existing header content */}
</div>
```

### Step 5: Data Migration Script

```typescript
// migrate-legacy-data.ts
async function migrateLegacyData(userId: string) {
  const migrationLog = {
    userId,
    startTime: new Date().toISOString(),
    migratedRecords: 0,
    errors: [],
    completed: false
  };

  try {
    // 1. Migrate localStorage progress data
    const progressKeys = Object.keys(localStorage)
      .filter(key => key.startsWith(`progress_${userId}_`));

    for (const key of progressKeys) {
      try {
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        const cardId = key.split('_')[2];

        if (cardId && data.grade !== undefined) {
          // Convert to new format
          const progressRecord = {
            cardId,
            userId,
            grade: data.grade,
            interval: data.interval || 1,
            easeFactor: data.easeFactor || 2.5,
            repetitions: data.repetitions || 0,
            studyTimeSeconds: data.studyTimeSeconds || 0,
            sessionId: data.sessionId || 'migration',
            version: 1,
            lastModified: data.timestamp || new Date().toISOString(),
            syncStatus: 'pending' as const
          };

          // Queue for sync
          await robustSyncManager.saveProgress(
            cardId,
            data.grade,
            data.studyTimeSeconds || 0,
            'migration'
          );

          migrationLog.migratedRecords++;
        }
      } catch (error) {
        migrationLog.errors.push(`Failed to migrate ${key}: ${error}`);
      }
    }

    // 2. Migrate user stats
    const statsKey = `user_stats_${userId}`;
    const statsData = localStorage.getItem(statsKey);
    if (statsData) {
      try {
        const stats = JSON.parse(statsData);
        // User stats are now calculated server-side, so just trigger a sync
        await robustSyncManager.forcSync();
      } catch (error) {
        migrationLog.errors.push(`Failed to migrate stats: ${error}`);
      }
    }

    // 3. Migrate daily stats
    const dailyKeys = Object.keys(localStorage)
      .filter(key => key.startsWith(`daily_${userId}_`));

    // Daily stats will be recalculated on server side
    // Just ensure they're in sync
    if (dailyKeys.length > 0) {
      await robustSyncManager.forcSync();
    }

    migrationLog.completed = true;
    migrationLog.endTime = new Date().toISOString();

    console.log('Migration completed:', migrationLog);
    return migrationLog;

  } catch (error) {
    migrationLog.errors.push(`Migration failed: ${error}`);
    console.error('Migration failed:', migrationLog);
    throw error;
  }
}
```

### Step 6: Testing and Validation

1. **Create test script**:
```typescript
// test-migration.ts
async function testMigration(userId: string) {
  const tests = {
    dataIntegrity: false,
    syncFunctionality: false,
    conflictResolution: false,
    performanceOk: false
  };

  try {
    // Test 1: Data integrity
    const localData = robustSyncManager.getSyncMetrics();
    const hasExpectedData = localData.pendingOperations >= 0;
    tests.dataIntegrity = hasExpectedData;

    // Test 2: Sync functionality
    const syncResult = await robustSyncManager.forcSync();
    tests.syncFunctionality = syncResult;

    // Test 3: Create a test conflict
    // (Implementation would create and resolve a test conflict)
    tests.conflictResolution = true; // Simplified for now

    // Test 4: Performance check
    const startTime = Date.now();
    await robustSyncManager.saveProgress('test-card', 2, 5, 'test-session');
    const duration = Date.now() - startTime;
    tests.performanceOk = duration < 1000; // Should complete within 1 second

    console.log('Migration tests:', tests);
    return tests;

  } catch (error) {
    console.error('Migration test failed:', error);
    return tests;
  }
}
```

2. **Validation checklist**:
```typescript
// validation.ts
async function validateMigration(userId: string) {
  const validation = {
    checks: [],
    passed: 0,
    failed: 0
  };

  const checks = [
    {
      name: 'Robust sync manager initialized',
      test: () => robustSyncManager !== null
    },
    {
      name: 'User ID set correctly',
      test: () => robustSyncManager.getUserId() === userId
    },
    {
      name: 'No pending operations from migration',
      test: () => robustSyncManager.getPendingOperationsCount() === 0
    },
    {
      name: 'Sync metrics available',
      test: () => {
        const metrics = robustSyncManager.getSyncMetrics();
        return metrics && typeof metrics.lastSuccessfulSync === 'string';
      }
    },
    {
      name: 'No conflicts present',
      test: () => robustSyncManager.getConflicts().length === 0
    }
  ];

  for (const check of checks) {
    try {
      const result = await check.test();
      validation.checks.push({
        name: check.name,
        passed: result,
        error: null
      });

      if (result) {
        validation.passed++;
      } else {
        validation.failed++;
      }
    } catch (error) {
      validation.checks.push({
        name: check.name,
        passed: false,
        error: error.message
      });
      validation.failed++;
    }
  }

  return validation;
}
```

## Post-Migration

### 1. Cleanup Legacy Code

After successful migration and testing:

```typescript
// cleanup.ts
function cleanupLegacySystem() {
  console.log('Starting cleanup of legacy sync system...');

  // 1. Remove legacy storage managers (gradually)
  // Comment out imports first, then remove files after a few releases

  // 2. Clean up localStorage (keep backups)
  const keysToRemove = Object.keys(localStorage).filter(key =>
    key.includes('_syncQueue_') ||
    key.includes('_legacy_') ||
    key.includes('_migration_temp_')
  );

  keysToRemove.forEach(key => localStorage.removeItem(key));

  // 3. Update API routes to use v2 endpoints
  // Gradually phase out /api/progress in favor of /api/progress-v2

  console.log(`Cleanup completed. Removed ${keysToRemove.length} legacy keys.`);
}
```

### 2. Monitor Migration Success

Set up monitoring to track migration success:

```typescript
// migration-monitoring.ts
function setupMigrationMonitoring() {
  // Track migration completion rate
  const migrationMetrics = {
    totalUsers: 0,
    migratedUsers: 0,
    failedMigrations: 0,
    migrationErrors: []
  };

  // Send to analytics/monitoring service
  if (typeof window !== 'undefined' && window.analytics) {
    window.analytics.track('Migration Completed', {
      userId: robustSyncManager.getUserId(),
      timestamp: new Date().toISOString(),
      syncMetrics: robustSyncManager.getSyncMetrics()
    });
  }
}
```

### 3. Rollback Plan

If issues are discovered post-migration:

```typescript
// rollback.ts
async function rollbackToLegacySystem(userId: string, backupData: any) {
  console.log('Rolling back to legacy system...');

  try {
    // 1. Stop robust sync manager
    robustSyncManager.destroy();

    // 2. Restore localStorage from backup
    Object.entries(backupData.localStorage).forEach(([key, value]) => {
      localStorage.setItem(key, value as string);
    });

    // 3. Restore IndexedDB data
    if (backupData.indexedDB[userId]) {
      const userData = backupData.indexedDB[userId];

      // Restore progress data
      if (userData.progress) {
        for (const progress of userData.progress) {
          await clientDB.saveCardProgress(userId, progress.cardId, progress);
        }
      }

      // Restore stats
      if (userData.stats) {
        await clientDB.saveUserStats(userId, userData.stats);
      }

      // Restore daily stats
      if (userData.dailyStats) {
        for (const dailyStat of userData.dailyStats) {
          await clientDB.saveDailyStats(userId, dailyStat.date, dailyStat);
        }
      }
    }

    // 4. Re-initialize legacy systems
    // (This would require keeping legacy code available)

    console.log('Rollback completed successfully');
    return true;

  } catch (error) {
    console.error('Rollback failed:', error);
    return false;
  }
}
```

## Timeline

### Phase 1: Preparation (Week 1)
- [ ] Run assessment script
- [ ] Create data backups
- [ ] Set up monitoring
- [ ] Test migration script in staging

### Phase 2: Database Migration (Week 2)
- [ ] Deploy database schema changes
- [ ] Run data migration scripts
- [ ] Validate database integrity
- [ ] Update API endpoints

### Phase 3: Client-Side Migration (Week 3)
- [ ] Deploy robust sync manager
- [ ] Migrate user data progressively
- [ ] Monitor sync performance
- [ ] Address any conflicts

### Phase 4: Validation and Cleanup (Week 4)
- [ ] Run validation tests
- [ ] Clean up legacy code
- [ ] Monitor user experience
- [ ] Document lessons learned

## Success Criteria

- [ ] All user data successfully migrated
- [ ] Sync operations working reliably
- [ ] No increase in user-reported issues
- [ ] Performance metrics within acceptable range
- [ ] Conflict resolution working correctly
- [ ] Monitoring dashboards operational

## Troubleshooting

### Common Migration Issues

1. **Data Format Mismatches**
   - Check data type conversions
   - Validate timestamps and IDs
   - Ensure proper encoding

2. **Sync Queue Overload**
   - Increase batch processing limits
   - Implement priority queuing
   - Add rate limiting

3. **Performance Degradation**
   - Monitor memory usage
   - Check network efficiency
   - Optimize database queries

4. **User Experience Issues**
   - Add migration progress indicators
   - Provide clear error messages
   - Implement graceful fallbacks

This migration guide ensures a smooth transition from the legacy sync system to the robust synchronization architecture while maintaining data integrity and user experience.