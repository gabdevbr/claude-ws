'use client';

import { useEffect, useState } from 'react';
import { SearchProvider } from '@/components/search/search-provider';
import { Header } from '@/components/header';
import dynamic from 'next/dynamic';
import { RightSidebar } from '@/components/right-sidebar';
import { QuestionsPanel } from '@/components/questions/questions-panel';
import { TeamView } from '@/components/team-view/team-view';
import { PluginList } from '@/components/agent-factory/plugin-list';
import { AccessAnywhereWizard } from '@/components/access-anywhere';
import { TerminalPanel } from '@/components/terminal/terminal-panel';
import { useProjectStore } from '@/stores/project-store';
import { useTaskStore } from '@/stores/task-store';
import { useButlerStore } from '@/stores/butler-store';
import { useFloatingWindowsStore } from '@/stores/floating-windows-store';
import { useTunnelStore } from '@/stores/tunnel-store';
import { useAgentFactoryUIStore } from '@/stores/agent-factory-ui-store';
import { useSettingsUIStore } from '@/stores/settings-ui-store';
import { useIsMobileViewport } from '@/hooks/use-mobile-viewport';
import { useKanbanUrlSyncAndDeepLinks } from '@/hooks/use-kanban-url-sync-and-deep-links';
import { useKanbanKeyboardShortcuts } from '@/hooks/use-kanban-keyboard-shortcuts';
import type { Task } from '@/types';
import { useTranslations } from 'next-intl';

// Lazy-load heavy components to isolate third-party chunks (@dnd-kit, @codemirror, @lezer)
// and avoid Turbopack HMR "module factory not available" errors from stale browser cache.
const Board = dynamic(
  () => import('@/components/kanban/board').then(m => ({ default: m.Board })),
  { ssr: false }
);
const CreateTaskDialog = dynamic(
  () => import('@/components/kanban/create-task-dialog').then(m => ({ default: m.CreateTaskDialog })),
  { ssr: false }
);
const TaskDetailPanel = dynamic(
  () => import('@/components/task/task-detail-panel').then(m => ({ default: m.TaskDetailPanel })),
  { ssr: false }
);
const FloatingChatWindowsContainer = dynamic(
  () => import('@/components/task/floating-chat-windows-container').then(m => ({ default: m.FloatingChatWindowsContainer })),
  { ssr: false }
);
const SettingsPage = dynamic(
  () => import('@/components/settings/settings-page').then(m => ({ default: m.SettingsPage })),
  { ssr: false }
);
const SetupDialog = dynamic(
  () => import('@/components/settings/setup-dialog').then(m => ({ default: m.SetupDialog })),
  { ssr: false }
);
const SidebarPanel = dynamic(
  () => import('@/components/sidebar/sidebar-panel').then(m => ({ default: m.SidebarPanel })),
  { ssr: false }
);
const FileTabsPanel = dynamic(
  () => import('@/components/sidebar/file-browser/file-tabs-panel').then(m => ({ default: m.FileTabsPanel })),
  { ssr: false }
);
const DiffTabsPanel = dynamic(
  () => import('@/components/sidebar/git-changes/diff-tabs-panel').then(m => ({ default: m.DiffTabsPanel })),
  { ssr: false }
);

function KanbanApp() {
  const tCommon = useTranslations('common');
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { open: agentFactoryOpen } = useAgentFactoryUIStore();
  const { open: settingsOpen } = useSettingsUIStore();
  const isMobile = useIsMobileViewport();

  const { projects, selectedProjectIds, loading: projectLoading, error: projectError } = useProjectStore();
  const { selectedTask, setSelectedTask, setPendingAutoStartTask, setSelectedTaskId } = useTaskStore();
  const butlerEnabled = useButlerStore(s => s.enabled);
  const butlerProjectId = useButlerStore(s => s.projectId);

  const autoShowSetup = !projectLoading && !projectError && projects.length === 0;

  // Initialise stores on mount
  useEffect(() => {
    useProjectStore.persist.rehydrate();
    useProjectStore.getState().fetchProjects();
    const { initSocketListeners, fetchStatus } = useTunnelStore.getState();
    initSocketListeners();
    fetchStatus();
  }, []);

  // Fetch tasks when project selection changes
  useEffect(() => {
    if (!projectLoading) {
      let projectIds = selectedProjectIds;
      // Auto-include butler project when butler is enabled and user has selected specific projects
      // Skip when all-projects mode (empty array) — butler tasks already included in that mode
      if (butlerEnabled && butlerProjectId && projectIds.length > 0 && !projectIds.includes(butlerProjectId)) {
        projectIds = [...projectIds, butlerProjectId];
      }
      useTaskStore.getState().fetchTasks(projectIds);
    }
  }, [selectedProjectIds, projectLoading, butlerEnabled, butlerProjectId]);

  // Re-fetch when butler status changes (handles delayed socket connection)
  // This fixes timing issue where butler:status arrives after initial render
  useEffect(() => {
    if (!projectLoading && butlerEnabled && butlerProjectId && selectedProjectIds.length > 0) {
      if (!selectedProjectIds.includes(butlerProjectId)) {
        useTaskStore.getState().fetchTasks([...selectedProjectIds, butlerProjectId]);
      }
    }
  }, [butlerEnabled, butlerProjectId, projectLoading, selectedProjectIds]);

  // Mobile: redirect panel selection to floating window
  useEffect(() => {
    if (isMobile && selectedTask) {
      const { openWindow } = useFloatingWindowsStore.getState();
      openWindow(selectedTask.id, 'chat', selectedTask.projectId);
      setSelectedTask(null);
    }
  }, [isMobile, selectedTask, setSelectedTask]);

  // URL sync and task deep-link resolution
  useKanbanUrlSyncAndDeepLinks();

  // Global keyboard shortcuts
  useKanbanKeyboardShortcuts({
    selectedTask,
    setSelectedTask,
    onCreateTask: () => setCreateTaskOpen(true),
  });

  const handleTaskCreated = (task: Task, startNow: boolean, processedPrompt?: string, fileIds?: string[]) => {
    if (startNow) {
      const { preferFloating, openWindow } = useFloatingWindowsStore.getState();
      if (preferFloating) {
        openWindow(task.id, 'chat', task.projectId);
        setSelectedTaskId(task.id);
      } else {
        setSelectedTask(task);
      }
      setPendingAutoStartTask(task.id, processedPrompt, fileIds);
    }
  };

  if (projectLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <img src="/logo.svg" alt="Logo" className="h-8 w-8 animate-spin" />
          <span>{tCommon('loadingApp')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        onCreateTask={() => setCreateTaskOpen(true)}
        onAddProject={() => setSetupOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <div className="flex flex-1 overflow-hidden min-h-0">
        <SidebarPanel />
        <FileTabsPanel />
        <DiffTabsPanel />

        <main className="flex-1 overflow-auto min-w-0">
          {projects.length > 0 ? (
            <Board onCreateTask={() => setCreateTaskOpen(true)} searchQuery={searchQuery} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-muted-foreground mb-4">{tCommon('noProjectsConfigured')}</p>
                <button
                  onClick={() => setSetupOpen(true)}
                  className="text-primary underline hover:no-underline"
                >
                  {tCommon('setUpProject')}
                </button>
              </div>
            </div>
          )}
        </main>

        {selectedTask && !isMobile && <TaskDetailPanel />}
      </div>

      <TerminalPanel />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onTaskCreated={handleTaskCreated}
      />
      <SetupDialog open={setupOpen || autoShowSetup} onOpenChange={setSetupOpen} />

      {agentFactoryOpen && (
        <div className="fixed inset-0 z-50 bg-background"><PluginList /></div>
      )}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-background"><SettingsPage /></div>
      )}

      <RightSidebar
        projectId={selectedProjectIds[0]}
        onCreateTask={() => setCreateTaskOpen(true)}
      />
      <QuestionsPanel />

      {/* Team View - agent team sidebar (replaces WorkflowPanel) */}
      <TeamView />

      {/* Access Anywhere Wizard */}
      <AccessAnywhereWizard />
      <FloatingChatWindowsContainer />
    </div>
  );
}

export default function Home() {
  return (
    <SearchProvider>
      <KanbanApp />
    </SearchProvider>
  );
}
