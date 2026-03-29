import { useState, useEffect } from 'react';
import * as taskApiService from '@/lib/services/task-api-service';

export interface TaskStats {
  totalTokens: number;
  totalCostUSD: number;
  totalTurns: number;
  totalDurationMs: number;
  totalAdditions: number;
  totalDeletions: number;
  filesChanged: number;
  contextUsed: number;
  contextLimit: number;
  contextPercentage: number;
}

// Polls /api/tasks/:id/stats every 5s while mounted
export function useTaskStats(taskId?: string) {
  const [taskStats, setTaskStats] = useState<TaskStats | null>(null);

  useEffect(() => {
    if (!taskId) return;

    const controller = new AbortController();

    const fetchStats = async () => {
      try {
        const data = await taskApiService.getTaskStats(taskId, { signal: controller.signal });
        setTaskStats(data);
      } catch (error) {
        // Ignore abort errors (component unmount) and network errors (server restart)
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, [taskId]);

  return taskStats;
}
