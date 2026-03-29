/**
 * Butler module public API.
 * Re-exports the butler manager factory and core types.
 */
export { createButlerManager } from './butler-manager';
export type { ButlerManager } from './butler-manager';
export type {
  ButlerConfig,
  ButlerState,
  ButlerPhase,
  ButlerDependencies,
  ButlerAction,
  ButlerActionType,
  ButlerNotification,
  ButlerNotificationType,
  ButlerEvent,
  PersonaFiles,
  WorkspaceSnapshot,
  ScheduledTask,
} from './butler-types';
export { createButlerSchedulerService } from './butler-scheduler-service';
export type { ButlerSchedulerService } from './butler-scheduler-service';
