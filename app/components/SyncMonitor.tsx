'use client';

import { useState, useEffect } from 'react';
import { robustSyncManager } from '@/app/lib/robustSyncManager';
import type { SyncMetrics, SyncConflict } from '@/app/lib/robustSyncManager';

interface SyncMonitorProps {
  className?: string;
  showDetails?: boolean;
}

export default function SyncMonitor({ className = '', showDetails = false }: SyncMonitorProps) {
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const updateStatus = () => {
      setMetrics(robustSyncManager.getSyncMetrics());
      setConflicts(robustSyncManager.getConflicts());
      setIsOnline(navigator.onLine);
    };

    // Initial update
    updateStatus();

    // Set up periodic updates
    const interval = setInterval(updateStatus, 1000);

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleForceSync = async () => {
    try {
      const success = await robustSyncManager.forcSync();
      if (success) {
        setMetrics(robustSyncManager.getSyncMetrics());
      }
    } catch (error) {
      console.error('Force sync failed:', error);
    }
  };

  const handleClearQueue = () => {
    robustSyncManager.clearSyncQueue();
    setMetrics(robustSyncManager.getSyncMetrics());
  };

  const getSyncStatusIcon = () => {
    if (!isOnline) return '📴';
    if (!metrics) return '⏳';
    if (metrics.pendingOperations > 0) return '🔄';
    if (conflicts.length > 0) return '⚠️';
    return '✅';
  };

  const getSyncStatusText = () => {
    if (!isOnline) return '离线';
    if (!metrics) return '加载中...';
    if (metrics.pendingOperations > 0) return `同步中 (${metrics.pendingOperations})`;
    if (conflicts.length > 0) return `冲突 (${conflicts.length})`;
    return '已同步';
  };

  const getSyncStatusColor = () => {
    if (!isOnline) return 'text-red-600 bg-red-100';
    if (!metrics) return 'text-gray-600 bg-gray-100';
    if (metrics.pendingOperations > 0) return 'text-blue-600 bg-blue-100';
    if (conflicts.length > 0) return 'text-yellow-600 bg-yellow-100';
    return 'text-green-600 bg-green-100';
  };

  const formatLastSync = (timestamp: string | null) => {
    if (!timestamp) return '从未同步';

    const date = new Date(timestamp);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);

    if (diffMinutes < 1) return '刚刚';
    if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} 小时前`;
    return `${Math.floor(diffMinutes / 1440)} 天前`;
  };

  if (!showDetails) {
    // Compact status indicator
    return (
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getSyncStatusColor()} ${className}`}>
        <span className="text-lg">{getSyncStatusIcon()}</span>
        <span>{getSyncStatusText()}</span>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow-lg border ${className}`}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{getSyncStatusIcon()}</span>
          <div>
            <h3 className="font-semibold text-gray-900">同步状态</h3>
            <p className={`text-sm ${getSyncStatusColor().split(' ')[0]}`}>
              {getSyncStatusText()}
            </p>
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isExpanded && metrics && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100">
          {/* Sync Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{metrics.pendingOperations}</div>
              <div className="text-xs text-gray-600">待同步</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{conflicts.length}</div>
              <div className="text-xs text-gray-600">冲突</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{metrics.networkLatency}ms</div>
              <div className="text-xs text-gray-600">延迟</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{Math.round(metrics.syncDuration / 1000)}s</div>
              <div className="text-xs text-gray-600">同步时长</div>
            </div>
          </div>

          {/* Last Sync Information */}
          <div className="bg-gray-50 rounded-lg p-3">
            <h4 className="font-medium text-gray-900 mb-2">上次同步</h4>
            <p className="text-sm text-gray-600">
              {formatLastSync(metrics.lastSuccessfulSync)}
            </p>
          </div>

          {/* Conflicts */}
          {conflicts.length > 0 && (
            <div className="bg-yellow-50 rounded-lg p-3">
              <h4 className="font-medium text-yellow-900 mb-2 flex items-center gap-2">
                <span>⚠️</span>
                同步冲突 ({conflicts.length})
              </h4>
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {conflicts.slice(0, 3).map((conflict, index) => (
                  <div key={index} className="text-sm text-yellow-800 bg-yellow-100 rounded px-2 py-1">
                    <div className="font-medium">{conflict.entityType} 冲突</div>
                    <div className="text-xs">{conflict.conflictType} - {new Date(conflict.timestamp).toLocaleString()}</div>
                  </div>
                ))}
                {conflicts.length > 3 && (
                  <div className="text-xs text-yellow-700">还有 {conflicts.length - 3} 个冲突...</div>
                )}
              </div>
            </div>
          )}

          {/* Recent Errors */}
          {metrics.syncErrors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3">
              <h4 className="font-medium text-red-900 mb-2 flex items-center gap-2">
                <span>❌</span>
                最近错误
              </h4>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {metrics.syncErrors.slice(-3).map((error, index) => (
                  <div key={index} className="text-xs text-red-700 bg-red-100 rounded px-2 py-1 font-mono">
                    {error.length > 60 ? `${error.substring(0, 60)}...` : error}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleForceSync}
              disabled={!isOnline}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              强制同步
            </button>
            {metrics.pendingOperations > 0 && (
              <button
                onClick={handleClearQueue}
                className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
              >
                清空队列
              </button>
            )}
          </div>

          {/* Network Status */}
          <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-100">
            网络状态: {isOnline ? '🟢 在线' : '🔴 离线'}
          </div>
        </div>
      )}
    </div>
  );
}