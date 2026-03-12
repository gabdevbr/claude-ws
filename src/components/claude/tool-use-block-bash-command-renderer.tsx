'use client';

import { useState } from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface BashBlockProps {
  command: string;
  output?: string;
  isError?: boolean;
}

/** Renders a bash command with collapsible output panel and copy button */
export function BashBlock({ command, output, isError }: BashBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasOutput = output && output.trim().length > 0;
  const outputLines = output?.split('\n').length || 0;

  return (
    <div className="rounded-md border border-border overflow-hidden text-xs font-mono w-full max-w-full">
      {/* Command header */}
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-2 bg-zinc-900 dark:bg-zinc-950 w-full max-w-full',
          hasOutput && 'cursor-pointer hover:bg-zinc-800 dark:hover:bg-zinc-900'
        )}
        onClick={() => hasOutput && setIsExpanded(!isExpanded)}
      >
        <Terminal className="size-3.5 text-zinc-400 shrink-0" />
        <code className="text-zinc-100 flex-1 truncate min-w-0">{command}</code>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            className="size-5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          </Button>
          {hasOutput && (
            <span className="text-zinc-500 text-[10px]">
              {outputLines} line{outputLines !== 1 ? 's' : ''}
            </span>
          )}
          {hasOutput && (
            isExpanded ? (
              <ChevronDown className="size-3 text-zinc-500" />
            ) : (
              <ChevronRight className="size-3 text-zinc-500" />
            )
          )}
        </div>
      </div>

      {/* Output */}
      {isExpanded && hasOutput && (
        <div className={cn(
          'px-3 py-2 bg-zinc-950 dark:bg-black max-h-48 overflow-auto',
          isError && 'text-red-400'
        )}>
          <pre className="text-zinc-300 whitespace-pre-wrap break-all text-[11px] leading-relaxed">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
