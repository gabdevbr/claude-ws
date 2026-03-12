'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getLanguageFromPath, highlightCode, escapeHtml } from './diff-view-syntax-highlight-engine';
import { computeDiff } from './diff-view-lcs-line-diff-algorithm';

interface DiffViewProps {
  oldText: string;
  newText: string;
  filePath?: string;
  className?: string;
}

export function DiffView({ oldText, newText, filePath, className }: DiffViewProps) {
  const diffLines = useMemo(() => computeDiff(oldText, newText), [oldText, newText]);
  const language = useMemo(() => getLanguageFromPath(filePath), [filePath]);

  const stats = useMemo(() => {
    const added = diffLines.filter(l => l.type === 'added').length;
    const removed = diffLines.filter(l => l.type === 'removed').length;
    return { added, removed };
  }, [diffLines]);

  return (
    <div className={cn('rounded-md border border-border overflow-hidden text-xs font-mono w-full max-w-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border w-full">
        <span className="text-muted-foreground truncate min-w-0 flex-1">{filePath || 'changes'}</span>
        <div className="flex items-center gap-2 text-[11px] shrink-0">
          {stats.added > 0 && (
            <span className="text-green-600 dark:text-green-400">+{stats.added}</span>
          )}
          {stats.removed > 0 && (
            <span className="text-red-600 dark:text-red-400">-{stats.removed}</span>
          )}
        </div>
      </div>

      {/* Diff content */}
      <div className="overflow-x-auto max-h-64 w-full max-w-full">
        <table className="w-full border-collapse">
          <tbody>
            {diffLines.map((line, idx) => {
              const highlightedContent = language && line.content
                ? highlightCode(line.content, language)
                : escapeHtml(line.content || '');

              return (
                <tr
                  key={idx}
                  className={cn(
                    line.type === 'added' && 'diff-row-added',
                    line.type === 'removed' && 'diff-row-removed'
                  )}
                >
                  {/* Line number */}
                  <td className="select-none text-right px-2 py-0 text-muted-foreground/50 border-r border-border/30 w-8 align-top">
                    {line.newLineNum || line.oldLineNum || ''}
                  </td>

                  {/* Change indicator */}
                  <td className={cn(
                    'select-none px-1 py-0 w-4 text-center align-top',
                    line.type === 'added' && 'text-green-600 dark:text-green-400',
                    line.type === 'removed' && 'text-red-600 dark:text-red-400'
                  )}>
                    {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                  </td>

                  {/* Content with syntax highlighting */}
                  <td className={cn(
                    'px-2 py-0 whitespace-pre-wrap break-all',
                    line.type === 'added' && 'diff-added',
                    line.type === 'removed' && 'diff-removed'
                  )}>
                    {line.content ? (
                      <span dangerouslySetInnerHTML={{ __html: highlightedContent }} />
                    ) : (
                      '\u00A0'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
