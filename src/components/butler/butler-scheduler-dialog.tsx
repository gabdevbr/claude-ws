/**
 * Butler Scheduler Management Dialog.
 * Lists all scheduled tasks with status, allows enable/disable, edit, and delete.
 * Fetches from GET /api/butler/schedules, mutates via PATCH/DELETE /api/butler/schedules/[id].
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useButlerStore } from '@/stores/butler-store';
import {
  Calendar,
  ClipboardCopy,
  Loader2,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
  Check,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ScheduledTask } from '@/lib/butler/butler-types';
import { cronToHumanReadable, getSchedulerDescription } from '@/lib/butler/cron-to-human-readable';

type SchedulerStatus = 'active' | 'stopped' | 'stale';

function getSchedulerStatus(task: ScheduledTask): SchedulerStatus {
  if (!task.enabled) return 'stopped';
  // If enabled but nextRunAt is null or far in the past, mark as stale
  if (task.nextRunAt && task.nextRunAt < Date.now() - 60_000 * 10) return 'stale';
  return 'active';
}

function StatusBadge({ status }: { status: SchedulerStatus }) {
  const t = useTranslations('butler');
  const config = {
    active: { label: t('schedulerActive'), className: 'bg-green-500/15 text-green-600 border-green-500/20' },
    stopped: { label: t('schedulerStopped'), className: 'bg-muted text-muted-foreground border-muted' },
    stale: { label: t('schedulerStale'), className: 'bg-amber-500/15 text-amber-600 border-amber-500/20' },
  }[status];
  return <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', config.className)}>{config.label}</Badge>;
}

function formatTime(ts: number | null): string {
  if (!ts) return '-';
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Inline edit row for cron expression */
function SchedulerRow({
  task,
  onToggle,
  onDelete,
  onUpdateCron,
}: {
  task: ScheduledTask;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateCron: (id: string, cron: string) => void;
}) {
  const t = useTranslations('butler');
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [cronDraft, setCronDraft] = useState(task.cronExpression);
  const [copied, setCopied] = useState(false);
  const status = getSchedulerStatus(task);
  const description = getSchedulerDescription(task.actionType, task.actionPayload);
  const humanReadable = editing ? cronToHumanReadable(cronDraft) : cronToHumanReadable(task.cronExpression);

  const handleCopyCommand = async () => {
    if (!description) return;
    await navigator.clipboard.writeText(description);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleSave = () => {
    if (cronDraft.trim() && cronDraft.trim() !== task.cronExpression) {
      onUpdateCron(task.id, cronDraft.trim());
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setCronDraft(task.cronExpression);
    setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1.5 p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors">
      {/* Top row: action type + status + controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">{task.actionType.replace(/_/g, ' ')}</span>
            <StatusBadge status={status} />
          </div>
          {description && (
            <div className="flex items-center gap-1 min-w-0 group">
              <code className="text-[11px] text-muted-foreground truncate bg-muted/50 px-1 py-0.5 rounded" title={description}>
                {description}
              </code>
              <button
                onClick={handleCopyCommand}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-muted rounded"
                title={t('schedulerCopyCommand')}
              >
                {copied
                  ? <Check className="h-3 w-3 text-green-600" />
                  : <ClipboardCopy className="h-3 w-3 text-muted-foreground" />
                }
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onToggle(task.id, !task.enabled)}
            title={task.enabled ? t('schedulerDisable') : t('schedulerEnable')}
          >
            {task.enabled
              ? <PowerOff className="h-3.5 w-3.5 text-muted-foreground" />
              : <Power className="h-3.5 w-3.5 text-green-600" />
            }
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setEditing(!editing)}
            title={t('schedulerEdit')}
          >
            <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {confirmingDelete ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => { onDelete(task.id); setConfirmingDelete(false); }}
                title={t('schedulerConfirmDelete')}
              >
                <Check className="h-3.5 w-3.5 text-destructive" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setConfirmingDelete(false)}
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setConfirmingDelete(true)}
              title={t('schedulerDelete')}
            >
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {/* Cron expression row with human-readable description */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          {editing ? (
            <div className="flex items-center gap-1 flex-1">
              <Input
                value={cronDraft}
                onChange={(e) => setCronDraft(e.target.value)}
                className="h-6 text-xs px-1.5 py-0 flex-1 font-mono"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') handleCancel();
                }}
              />
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSave}>
                <Check className="h-3 w-3 text-green-600" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCancel}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{task.cronExpression}</code>
              <span className="text-[11px] italic">{humanReadable}</span>
            </>
          )}
        </div>
        {/* Live preview while editing */}
        {editing && (
          <span className="text-[11px] italic text-muted-foreground/70 pl-5">
            {humanReadable}
          </span>
        )}
      </div>

      {/* Last run / Next run */}
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground/70">
        <span>{t('schedulerLastRun')}: {formatTime(task.lastRunAt)}</span>
        <span>{t('schedulerNextRun')}: {formatTime(task.nextRunAt)}</span>
      </div>
    </div>
  );
}

export function ButlerSchedulerDialog() {
  const t = useTranslations('butler');
  const open = useButlerStore((s) => s.schedulerDialogOpen);
  const setOpen = useButlerStore((s) => s.setSchedulerDialogOpen);

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/butler/schedules');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on open
  useEffect(() => {
    if (open) fetchTasks();
  }, [open, fetchTasks]);

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/butler/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    } catch {
      fetchTasks();
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/butler/schedules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch {
      fetchTasks();
    }
  };

  const handleUpdateCron = async (id: string, cronExpression: string) => {
    try {
      const res = await fetch(`/api/butler/schedules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cronExpression }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === id ? data.task : t)));
    } catch {
      fetchTasks();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[520px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <Calendar className="h-4 w-4" />
            {t('schedulerTitle')}
            <Button variant="ghost" size="icon" className="h-7 w-7 ml-1" onClick={fetchTasks} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-2 mt-2">
          {loading && tasks.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t('schedulerLoading')}
            </div>
          )}

          {error && (
            <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
              {error}
            </div>
          )}

          {!loading && !error && tasks.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              {t('schedulerEmpty')}
            </div>
          )}

          {tasks.map((task) => (
            <SchedulerRow
              key={task.id}
              task={task}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onUpdateCron={handleUpdateCron}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
