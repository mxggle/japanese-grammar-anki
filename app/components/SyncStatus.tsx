'use client';

import { useState, useEffect } from 'react';
import { optimizedStorage } from '@/app/lib/optimizedStorage';

interface SyncStatusProps {
  className?: string;
}

export default function SyncStatus({ className = '' }: SyncStatusProps) {
  const [syncStats, setSyncStats] = useState({
    pendingUpdates: 0,
    lastSyncTime: null as string | null,
    nextSyncScheduled: false
  });
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const updateSyncStatus = () => {
      const stats = optimizedStorage.getSyncStats();
      setSyncStats(stats);
      setIsOffline(optimizedStorage.isOffline());
    };

    // Update immediately
    updateSyncStatus();

    // Update every 5 seconds
    const interval = setInterval(updateSyncStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    try {
      await optimizedStorage.forcSync();
      // Update status after sync
      const stats = optimizedStorage.getSyncStats();
      setSyncStats(stats);
    } catch (error) {
      console.error('Manual sync failed:', error);
    }
  };

  if (isOffline) {
    return (
      <div className={`bg-orange-100 border border-orange-400 text-orange-700 px-3 py-2 rounded ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm">📴 离线模式</span>
            {syncStats.pendingUpdates > 0 && (
              <span className="ml-2 text-xs bg-orange-200 px-2 py-1 rounded">
                {syncStats.pendingUpdates} 项待同步
              </span>
            )}
          </div>
        </div>
        <div className="text-xs mt-1 text-orange-600">
          数据将在重新连接时自动同步
        </div>
      </div>
    );
  }

  if (syncStats.pendingUpdates > 0) {
    return (
      <div className={`bg-blue-100 border border-blue-400 text-blue-700 px-3 py-2 rounded ${className}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-sm">⏳ 有数据待同步</span>
            <span className="ml-2 text-xs bg-blue-200 px-2 py-1 rounded">
              {syncStats.pendingUpdates} 项
            </span>
          </div>
          <button
            onClick={handleManualSync}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700"
          >
            立即同步
          </button>
        </div>
        {syncStats.lastSyncTime && (
          <div className="text-xs mt-1 text-blue-600">
            上次同步: {new Date(syncStats.lastSyncTime).toLocaleTimeString('zh-CN')}
          </div>
        )}
      </div>
    );
  }

  return null; // No sync status to show
}