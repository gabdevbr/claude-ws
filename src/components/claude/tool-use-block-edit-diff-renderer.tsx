'use client';

import { DiffView } from '@/components/claude/diff-view';

interface EditBlockProps {
  input: any;
  result?: string;
  isError?: boolean;
}

/** Renders an Edit tool invocation as a side-by-side diff view */
export function EditBlock({ input, result: _result, isError: _isError }: EditBlockProps) {
  if (!input?.old_string && !input?.new_string) {
    return null;
  }

  return (
    <DiffView
      oldText={input.old_string || ''}
      newText={input.new_string || ''}
      filePath={input.file_path}
    />
  );
}
