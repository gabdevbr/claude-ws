'use client';

import { DiffView } from '@/components/claude/diff-view';

interface WriteBlockProps {
  input: any;
  result?: string;
  isError?: boolean;
}

/** Renders a Write tool invocation as a diff view (shows new file content) */
export function WriteBlock({ input, result: _result, isError: _isError }: WriteBlockProps) {
  if (!input?.content) {
    return null;
  }

  return (
    <DiffView
      oldText=""
      newText={input.content}
      filePath={input.file_path}
    />
  );
}
