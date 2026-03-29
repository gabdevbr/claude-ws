'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { PromptInput } from '@/components/task/prompt-input';
import { useTaskStore } from '@/stores/task-store';
import { useButlerStore } from '@/stores/butler-store';
import { useFloatingWindowsStore } from '@/stores/floating-windows-store';
import { useAttachmentStore } from '@/stores/attachment-store';
import { useContextMentionStore } from '@/stores/context-mention-store';
import { useProjectStore } from '@/stores/project-store';

const TEMP_TASK_PREFIX = '__butler_dialog_temp__';

/**
 * Dialog for creating a Butler task. Only creates the task when the user
 * submits their first message — no data is persisted until then.
 */
export function CreateButlerTaskDialog() {
  const t = useTranslations('kanban');
  const tButler = useTranslations('butler');
  const { createTask } = useTaskStore();
  const { projects } = useProjectStore();
  const projectId = useButlerStore(s => s.projectId);
  const open = useButlerStore(s => s.createTaskDialogOpen);
  const setOpen = useButlerStore(s => s.setCreateTaskDialogOpen);
  const draftButlerTaskMessage = useButlerStore(s => s.draftButlerTaskMessage);
  const setDraftButlerTaskMessage = useButlerStore(s => s.setDraftButlerTaskMessage);
  const clearDraftButlerTaskMessage = useButlerStore(s => s.clearDraftButlerTaskMessage);
  const { getUploadedFileIds, clearFiles, getPendingFiles, moveFiles, hasUploadingFiles } = useAttachmentStore();
  const { buildPromptWithMentions, getMentions, clearMentions } = useContextMentionStore();

  const [chatPrompt, setChatPrompt] = useState(draftButlerTaskMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tempTaskId, setTempTaskId] = useState('');

  const projectPath = projectId ? projects.find(p => p.id === projectId)?.path : undefined;

  // Restore draft and generate new temp task ID when dialog opens
  useEffect(() => {
    if (open) {
      setChatPrompt(draftButlerTaskMessage);
      setTempTaskId(`${TEMP_TASK_PREFIX}${Date.now()}`);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!chatPrompt.trim()) {
      setError(t('messageRequired'));
      return;
    }
    if (!projectId) return;
    if (tempTaskId && hasUploadingFiles(tempTaskId)) {
      setError(t('waitFileUpload'));
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Process @file mentions
      let finalPrompt = chatPrompt.trim();
      let descriptionForTask = chatPrompt.trim();
      let processedPrompt: string | undefined;

      const mentions = tempTaskId ? getMentions(tempTaskId) : [];
      if (mentions.length > 0 && tempTaskId) {
        const mentionResult = buildPromptWithMentions(tempTaskId, finalPrompt);
        finalPrompt = mentionResult.finalPrompt;
        descriptionForTask = mentionResult.displayPrompt;
        processedPrompt = finalPrompt;
      }

      // Get uploaded file IDs
      const fileIds = tempTaskId ? getUploadedFileIds(tempTaskId) : [];
      const pendingFileMeta = fileIds.length > 0 && tempTaskId
        ? getPendingFiles(tempTaskId)
            .filter(f => f.status === 'uploaded' && !f.tempId.startsWith('local-'))
            .map(f => ({ tempId: f.tempId, originalName: f.originalName, mimeType: f.mimeType, size: f.size }))
        : undefined;

      // Use message as title (auto-renamed later by stream handler)
      const maxLen = 80;
      const title = descriptionForTask.length > maxLen
        ? descriptionForTask.slice(0, maxLen) + '...'
        : descriptionForTask;

      const task = await createTask(projectId, title, descriptionForTask, pendingFileMeta);

      // Move files from temp to real task
      if (tempTaskId && fileIds.length > 0) {
        moveFiles(tempTaskId, task.id);
      }
      if (tempTaskId) clearMentions(tempTaskId);

      // Open floating window and auto-start
      useFloatingWindowsStore.getState().openWindow(task.id, 'chat', projectId);
      useTaskStore.getState().setSelectedTaskId(task.id);
      useTaskStore.getState().setPendingAutoStartTask(
        task.id,
        processedPrompt,
        fileIds.length > 0 ? fileIds : undefined,
      );

      // Reset, clear draft, and close
      setChatPrompt('');
      setTempTaskId('');
      clearDraftButlerTaskMessage();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreate'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isSubmitting) return;
    if (!newOpen) {
      // Save draft text to store before closing
      setDraftButlerTaskMessage(chatPrompt);
      if (tempTaskId) {
        clearFiles(tempTaskId);
        clearMentions(tempTaskId);
      }
      setError(null);
      setTempTaskId('');
    }
    setOpen(newOpen);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] overflow-visible" onKeyDown={handleKeyDown}>
        <DialogHeader>
          <DialogTitle>{tButler('startTask')}</DialogTitle>
          <DialogDescription>
            {t('createNewTaskDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 w-full max-w-full">
          <PromptInput
            key={open ? `butler-task-input-${tempTaskId}` : 'closed'}
            onSubmit={() => handleSubmit()}
            onChange={setChatPrompt}
            placeholder={t('typeForCommands')}
            disabled={isSubmitting}
            hideSendButton
            hideStats
            taskId={tempTaskId}
            projectPath={projectPath}
            initialValue={draftButlerTaskMessage}
            autoSelect={!!draftButlerTaskMessage}
            minRows={15}
            maxRows={15}
          />

          {error && (
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !chatPrompt.trim()}
              className="bg-primary hover:bg-primary/90"
            >
              {isSubmitting ? t('starting') : t('startNow')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
