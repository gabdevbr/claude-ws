'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RunningDots, useRandomStatusVerb } from '@/components/ui/running-dots';
import { PendingQuestionIndicator } from '@/components/task/pending-question-indicator';
import { TrackedTasksBlock } from '@/components/claude/tracked-tasks-block';
import { AuthErrorMessage } from '@/components/auth/auth-error-message';
import { cn } from '@/lib/utils';
import type { ClaudeOutput, PendingFile } from '@/types';
import { useTranslations } from 'next-intl';
import { buildToolResultsMap, hasVisibleContent, findAuthError, findLastToolUseId, buildTrackedTasksFromMessages } from './conversation-view-utils';
import type { ActiveQuestion, ConversationTurn } from './conversation-view-utils';
import { useConversationAutoScroll } from './use-conversation-auto-scroll';
import { renderMessage } from './conversation-view-content-block-renderer';
import { ConversationHistoricalUserTurn } from './conversation-view-historical-user-turn';
import { ConversationHistoricalAssistantTurn } from './conversation-view-historical-assistant-turn';
import { ConversationViewStreamingPromptBubble } from './conversation-view-streaming-prompt-bubble';
import * as taskApiService from '@/lib/services/task-api-service';

interface ConversationViewProps {
  taskId: string;
  currentMessages: ClaudeOutput[];
  currentAttemptId: string | null;
  currentPrompt?: string;
  currentFiles?: PendingFile[];
  isRunning: boolean;
  sendError?: string | null;
  activeQuestion?: ActiveQuestion | null;
  onOpenQuestion?: () => void;
  className?: string;
  onHistoryLoaded?: (hasHistory: boolean) => void;
  lastFetchedTaskIdRef?: React.RefObject<string | null>;
  isFetchingRef?: React.RefObject<boolean>;
}

export function ConversationView({
  taskId,
  currentMessages,
  currentAttemptId,
  currentPrompt,
  currentFiles,
  isRunning,
  sendError,
  activeQuestion,
  onOpenQuestion,
  className,
  lastFetchedTaskIdRef,
  isFetchingRef,
}: ConversationViewProps) {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [historicalTurns, setHistoricalTurns] = useState<ConversationTurn[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const statusVerb = useRandomStatusVerb();
  const t = useTranslations('chat');

  const localLastFetchedTaskIdRef = useRef<string | null>(null);
  const localIsFetchingRef = useRef(false);
  const effectiveLastFetchedRef = lastFetchedTaskIdRef || localLastFetchedTaskIdRef;
  const effectiveIsFetchingRef = isFetchingRef || localIsFetchingRef;

  // MUST be called before any early returns per React Rules of Hooks
  const currentToolResultsMap = useMemo(() => buildToolResultsMap(currentMessages), [currentMessages]);
  const currentLastToolUseId = useMemo(() => findLastToolUseId(currentMessages), [currentMessages]);
  const trackedTasks = useMemo(() => buildTrackedTasksFromMessages(currentMessages), [currentMessages]);

  useConversationAutoScroll(scrollAreaRef, currentMessages, historicalTurns, isRunning, isLoading);

  const loadHistory = async (forceRefresh = false) => {
    if (!forceRefresh && effectiveLastFetchedRef.current === taskId) return;
    if (!forceRefresh && effectiveIsFetchingRef.current) return;
    effectiveLastFetchedRef.current = taskId;
    effectiveIsFetchingRef.current = true;
    try {
      if (!forceRefresh) setIsLoading(true);
      const data = await taskApiService.getTaskConversation(taskId);
      setHistoricalTurns((data as any)?.turns || []);
    } catch (error) {
      console.error('[ConversationView] Failed to load conversation history:', error);
    } finally {
      if (!forceRefresh) setIsLoading(false);
      effectiveIsFetchingRef.current = false;
    }
  };

  useEffect(() => { loadHistory(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevIsRunningRef = useRef(isRunning);
  useEffect(() => {
    const wasRunning = prevIsRunningRef.current;
    prevIsRunningRef.current = isRunning;
    if (wasRunning && !isRunning) loadHistory();
  }, [isRunning]); // eslint-disable-line react-hooks/exhaustive-deps

  const prevAttemptIdRef = useRef(currentAttemptId);
  useEffect(() => {
    const prevId = prevAttemptIdRef.current;
    prevAttemptIdRef.current = currentAttemptId;
    if (currentAttemptId && prevId && currentAttemptId !== prevId) loadHistory(true);
  }, [currentAttemptId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh history when the tab/window regains visibility, focus, or network restores
  // This catches missed socket events from tab switches, network blips, etc.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadHistory(true);
    };
    const handleFocus = () => loadHistory(true);
    const handleOnline = () => loadHistory(true);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isEmpty = !historicalTurns.length && !currentMessages.length && !isRunning && !sendError;
  if (isEmpty) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-muted-foreground', className)}>
        <p className="text-sm">No conversation yet</p>
        <p className="text-xs mt-1">Start by sending a prompt below</p>
      </div>
    );
  }

  const filteredHistoricalTurns = currentAttemptId && isRunning && currentMessages.length > 0
    ? historicalTurns.filter(turn => turn.attemptId !== currentAttemptId)
    : historicalTurns;

  // Optimistic UI: show prompt bubble immediately while waiting for server to assign attemptId
  // Also keep prompt visible when there's a send error so the error shows below it
  const isPendingStart = isRunning && !currentAttemptId && !!currentPrompt;
  const hasSendError = !!sendError && !!currentPrompt;
  const streamingVisible = isPendingStart || hasSendError || (currentAttemptId && (currentMessages.length > 0 || isRunning)
    && !filteredHistoricalTurns.some(turn => turn.attemptId === currentAttemptId && turn.type === 'assistant'));
  const showStreamingPrompt = streamingVisible
    && (isPendingStart || hasSendError || !filteredHistoricalTurns.some(turn => turn.attemptId === currentAttemptId && turn.type === 'user'))
    && !!currentPrompt;

  return (
    <ScrollArea ref={scrollAreaRef} className={cn('h-full w-full max-w-full overflow-x-hidden', className)}>
      <div className="space-y-6 p-4 pb-24 w-full max-w-full overflow-x-hidden box-border">
        {filteredHistoricalTurns.map((turn) =>
          turn.type === 'user'
            ? <ConversationHistoricalUserTurn key={`user-${turn.attemptId}`} turn={turn} />
            : <ConversationHistoricalAssistantTurn key={`assistant-${turn.attemptId}`} turn={turn} onOpenQuestion={onOpenQuestion} />
        )}

        {streamingVisible && (
          <>
            {showStreamingPrompt && (
              <ConversationViewStreamingPromptBubble prompt={currentPrompt!} files={currentFiles} />
            )}
            {sendError && (
              <div className="flex items-center gap-2 text-destructive text-sm py-1 px-1">
                <span className="font-medium">{t('sendError')}:</span>
                <span>{sendError}</span>
              </div>
            )}
            <div className="space-y-4 w-full max-w-full overflow-hidden">
              {currentMessages.map((msg, idx) =>
                renderMessage({ output: msg, index: idx, isStreaming: true, toolResultsMap: currentToolResultsMap, lastToolUseId: currentLastToolUseId, onOpenQuestion })
              )}
            </div>
            {trackedTasks && trackedTasks.length > 0 && (
              <TrackedTasksBlock tasks={trackedTasks} />
            )}
            {activeQuestion && onOpenQuestion && (
              <PendingQuestionIndicator questions={activeQuestion.questions} onOpen={onOpenQuestion} />
            )}
          </>
        )}

        {isRunning && !hasVisibleContent(currentMessages)
          && !filteredHistoricalTurns.some(turn => turn.attemptId === currentAttemptId && turn.type === 'assistant') && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-1">
            <RunningDots />
            <span className="font-mono text-[14px]" style={{ color: '#b9664a' }}>{statusVerb}...</span>
          </div>
        )}

        {(() => {
          const authError = findAuthError(currentMessages);
          return authError ? <AuthErrorMessage message={authError} className="mt-4" /> : null;
        })()}
      </div>
    </ScrollArea>
  );
}
