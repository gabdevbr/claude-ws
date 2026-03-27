'use client';

import { Folder, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileIcon } from './file-icon';
import { useTranslations } from 'next-intl';

export interface FileBrowserEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

interface FileBrowserListingProps {
  loading: boolean;
  directories: FileBrowserEntry[];
  files: FileBrowserEntry[];
  selectedFile: string | null;
  onNavigate: (path: string) => void;
  onSelectFile: (entry: FileBrowserEntry) => void;
  onOpenFile: (entry: FileBrowserEntry) => void;
}

/**
 * Scrollable listing of directories and files for the file browser dialog.
 * Directories navigate on click; files are selectable (highlighted on click, opened on double-click).
 */
export function FileBrowserListing({
  loading,
  directories,
  files,
  selectedFile,
  onNavigate,
  onSelectFile,
  onOpenFile,
}: FileBrowserListingProps) {
  const t = useTranslations('sidebar');

  const isEmpty = directories.length === 0 && files.length === 0;

  return (
    <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
      <ScrollArea className="h-full">
        {loading ? (
          <div className="flex items-center justify-center h-[200px]">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isEmpty ? (
          <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
            {t('emptyDirectory')}
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {/* Directories first */}
            {directories.map((dir) => (
              <button
                key={dir.path}
                onDoubleClick={() => onNavigate(dir.path)}
                onClick={() => onNavigate(dir.path)}
                className="w-full flex items-center gap-2 p-2 rounded-md hover:bg-muted transition-colors text-left min-w-0"
              >
                <Folder className="h-4 w-4 text-blue-500 shrink-0" />
                <span className="truncate text-sm">{dir.name}</span>
              </button>
            ))}

            {/* Files */}
            {files.map((file) => {
              const isSelected = selectedFile === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => onSelectFile(file)}
                  onDoubleClick={() => onOpenFile(file)}
                  className={`w-full flex items-center gap-2 p-2 rounded-md transition-colors text-left min-w-0 ${
                    isSelected
                      ? 'bg-primary/10 ring-1 ring-primary/30'
                      : 'hover:bg-muted'
                  }`}
                >
                  <FileIcon name={file.name} type="file" isExpanded={false} className="h-4 w-4 shrink-0" />
                  <span className="truncate text-sm flex-1">{file.name}</span>
                  {file.size !== undefined && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
