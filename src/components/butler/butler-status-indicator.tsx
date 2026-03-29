/**
 * Butler Status Indicator — small icon in the header showing butler phase.
 * Colors: gray (disabled), green (idle), blue pulse (running), amber pulse (reasoning).
 * Click → open butler project. Right-click → toggle enable/disable.
 */
'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useButler } from '@/hooks/use-butler';
import { useButlerNotifications } from '@/hooks/use-butler-notifications';
import { useProjectStore } from '@/stores/project-store';
import { useFloatingWindowsStore } from '@/stores/floating-windows-store';
import { useTaskStore } from '@/stores/task-store';
import { useButlerStore } from '@/stores/butler-store';
import type { ButlerNotificationItem } from '@/stores/butler-store';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { AlertCircle, Bell, Calendar, Clock, Plus } from 'lucide-react';

const MAX_DISPLAY_NOTIFICATIONS = 5;

function formatRelativeTime(timestamp: number, t: ReturnType<typeof useTranslations>): string {
  const now = Date.now();
  const diff = Math.max(0, now - timestamp);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t('justNow');
  if (minutes < 60) return t('minutesAgo', { m: minutes.toString() });
  if (hours < 24) return t('hoursAgo', { h: hours.toString() });
  return t('daysAgo', { d: days.toString() });
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function ButlerStatusIndicator() {
  const t = useTranslations('butler');
  const { enabled, phase, projectId, enable, disable } = useButler();
  const { notifications, unreadCount, markAllRead, clearNotifications, requestPermission, permission } = useButlerNotifications();
  const { setActiveProjectId, selectedProjectIds, setSelectedProjectIds } = useProjectStore();

  const phaseColor = !enabled
    ? 'text-muted-foreground'
    : phase === 'reasoning'
      ? 'text-amber-500'
      : phase === 'running'
        ? 'text-blue-500'
        : 'text-green-500';

  const isPulsing = enabled && (phase === 'running' || phase === 'reasoning');

  const statusLabel = !enabled
    ? t('disabled')
    : t(`status_${phase}`);

  const handleClick = () => {
    if (projectId) {
      // Select only the butler project so kanban shows its tasks
      setSelectedProjectIds([projectId]);
      setActiveProjectId(projectId);
      const url = new URL(window.location.href);
      url.searchParams.set('project', projectId);
      window.history.pushState({}, '', url.toString());
    }
  };

  const handleNotificationClick = (notification: ButlerNotificationItem) => {
    // Open floating window if taskId exists, otherwise navigate to project
    if (notification.taskId && notification.projectId) {
      useFloatingWindowsStore.getState().openWindow(notification.taskId, 'chat', notification.projectId);
      useTaskStore.getState().setSelectedTaskId(notification.taskId);
      // Also navigate to the project
      setSelectedProjectIds([notification.projectId]);
      setActiveProjectId(notification.projectId);
    } else if (notification.projectId) {
      setSelectedProjectIds([notification.projectId]);
      setActiveProjectId(notification.projectId);
      const url = new URL(window.location.href);
      url.searchParams.set('project', notification.projectId);
      window.history.pushState({}, '', url.toString());
    }
  };

  const displayLimit = Math.max(unreadCount, MAX_DISPLAY_NOTIFICATIONS);
  const displayNotifications = notifications.slice(0, displayLimit);

  const handleStartButlerTask = () => {
    if (!projectId) return;
    useButlerStore.getState().setCreateTaskDialogOpen(true);
  };

  const handleEnableToggle = async () => {
    if (!enabled) {
      // Auto-request notification permission when enabling butler
      await requestPermission();
      enable();
    } else {
      disable();
    }
  };

  const handleDropdownOpenChange = (open: boolean) => {
    if (open && unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <DropdownMenu onOpenChange={handleDropdownOpenChange}>
      <TooltipProvider>
        <Tooltip>
          <DropdownMenuTrigger asChild>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClick}
                className="shrink-0 relative"
              >
                <Bot className={cn('h-4 w-4', phaseColor, isPulsing && 'animate-pulse')} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-medium bg-purple-500 text-white rounded-full">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
          </DropdownMenuTrigger>
          <TooltipContent>
            <p>Butler: {statusLabel}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <DropdownMenuContent align="center" className="w-80">
        {displayNotifications.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-sm font-semibold text-muted-foreground flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Bell className="h-3.5 w-3.5" />
                {t('notifications')}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); clearNotifications(); }}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {t('clearAll')}
              </button>
            </div>
            {displayNotifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={cn(
                  "flex flex-col items-start gap-1 px-2 py-2 cursor-pointer",
                  notification.read && "opacity-60"
                )}
              >
                <div className="flex items-start gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className={cn(
                        "text-sm truncate",
                        notification.read ? "font-normal" : "font-semibold"
                      )}>{notification.title}</span>
                      {!notification.read && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      )}
                    </div>
                    <p className={cn(
                      "text-xs truncate",
                      notification.read ? "text-muted-foreground/60" : "text-muted-foreground"
                    )}>
                      {truncateText(notification.body, 80)}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock className="h-2.5 w-2.5" />
                        {formatRelativeTime(notification.timestamp, t)}
                      </div>
                      {notification.projectName && (
                        <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">
                          {notification.projectName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        )}
        {displayNotifications.length === 0 && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            {t('noNotifications')}
          </div>
        )}
        {projectId && (
          <>
            <DropdownMenuItem onClick={handleStartButlerTask}>
              <Plus className="h-4 w-4 mr-2" />
              {t('startTask')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => useButlerStore.getState().setSchedulerDialogOpen(true)}>
              <Calendar className="h-4 w-4 mr-2" />
              {t('schedulerMenu')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onClick={handleClick}>
          {t('openProject')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleEnableToggle}>
          {enabled ? t('disable') : t('enable')}
        </DropdownMenuItem>
        {enabled && permission === 'denied' && (
          <DropdownMenuItem className="text-amber-600" disabled>
            <AlertCircle className="h-4 w-4 mr-2" />
            Notifications blocked
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
