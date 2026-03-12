'use client';

import { cn } from '@/lib/utils';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

/** Renders a TodoWrite tool invocation as a visual task list with status indicators */
export function TodoListBlock({ todos }: { todos: TodoItem[] }) {
  const completed = todos.filter(t => t.status === 'completed');
  const open = todos.filter(t => t.status !== 'completed');

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs font-mono w-full max-w-full bg-zinc-900 dark:bg-zinc-950">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border/50 text-zinc-400">
        Tasks ({completed.length} done, {open.length} open)
      </div>

      {/* Todo items */}
      <div className="px-3 py-2 space-y-1">
        {todos.map((todo, index) => {
          const isCompleted = todo.status === 'completed';
          const isInProgress = todo.status === 'in_progress';

          return (
            <div key={index} className="flex items-start gap-2">
              {/* Status indicator */}
              <span className={cn(
                'shrink-0 w-4',
                isCompleted && 'text-green-500',
                isInProgress && 'text-yellow-500',
                !isCompleted && !isInProgress && 'text-zinc-500'
              )}>
                {isCompleted ? '✓' : isInProgress ? '⟳' : '☐'}
              </span>

              {/* Task number and content */}
              <span className={cn(
                'flex-1',
                isCompleted && 'text-zinc-500 line-through',
                isInProgress && 'text-zinc-100 font-medium',
                !isCompleted && !isInProgress && 'text-zinc-300'
              )}>
                <span className="text-zinc-500">#{index + 1}</span>{' '}
                {isInProgress ? (todo.activeForm || todo.content) : todo.content}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
