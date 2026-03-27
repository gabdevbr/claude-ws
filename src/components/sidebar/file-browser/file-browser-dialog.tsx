'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronUp, Home, RefreshCw, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { FileBrowserListing, type FileBrowserEntry } from './file-browser-listing';

interface FileBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (filePath: string) => void;
  initialPath?: string;
}

/**
 * Dialog for browsing the entire filesystem and selecting a file to open.
 * Similar to FolderBrowserDialog but shows files alongside directories.
 * Directories navigate deeper; clicking a file selects it; "Open" opens it in the editor.
 */
export function FileBrowserDialog({ open, onOpenChange, onFileSelect, initialPath }: FileBrowserDialogProps) {
  const t = useTranslations('sidebar');
  const tCommon = useTranslations('common');

  const [currentPath, setCurrentPath] = useState(initialPath || '');
  const [directories, setDirectories] = useState<FileBrowserEntry[]>([]);
  const [files, setFiles] = useState<FileBrowserEntry[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [homePath, setHomePath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(true);

  const fetchDirectory = useCallback(async (path?: string, hidden?: boolean) => {
    setLoading(true);
    setError('');
    setSelectedFile(null);
    const shouldShowHidden = hidden ?? showHidden;
    try {
      const params = new URLSearchParams({ includeFiles: 'true' });
      if (path) params.set('path', path);
      if (shouldShowHidden) params.set('showHidden', 'true');
      const response = await fetch(`/api/filesystem?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load directory');
      setCurrentPath(data.currentPath);
      setDirectories(data.directories || []);
      setFiles(data.files || []);
      setParentPath(data.parentPath);
      setHomePath(data.homePath);
      setManualPath(data.currentPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchDirectory(initialPath || undefined);
  }, [open, initialPath, fetchDirectory]);

  const handleToggleHidden = useCallback(() => {
    const next = !showHidden;
    setShowHidden(next);
    fetchDirectory(currentPath || undefined, next);
  }, [showHidden, currentPath, fetchDirectory]);

  const handleSelectFile = useCallback((entry: FileBrowserEntry) => {
    setSelectedFile(entry.path);
  }, []);

  const handleOpenFile = useCallback((entry: FileBrowserEntry) => {
    onFileSelect(entry.path);
    onOpenChange(false);
  }, [onFileSelect, onOpenChange]);

  const handleOpen = useCallback(() => {
    if (selectedFile) {
      onFileSelect(selectedFile);
      onOpenChange(false);
    }
  }, [selectedFile, onFileSelect, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[600px] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{t('openFile')}</DialogTitle>
          <DialogDescription>{t('browseAndSelectFile')}</DialogDescription>
        </DialogHeader>

        {/* Manual path input */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (manualPath.trim()) fetchDirectory(manualPath.trim()); }}
          className="flex gap-2"
        >
          <Input
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            placeholder="/path/to/directory"
            className="flex-1"
          />
          <Button type="submit" variant="outline" size="icon" disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        </form>

        {/* Navigation buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline" size="sm"
            onClick={() => parentPath && fetchDirectory(parentPath)}
            disabled={!parentPath || loading}
          >
            <ChevronUp className="h-4 w-4 mr-1" />{t('upDirectory')}
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => fetchDirectory(homePath)}
            disabled={loading}
          >
            <Home className="h-4 w-4 mr-1" />{t('homeDirectory')}
          </Button>
          <div className="flex-1" />
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <Checkbox
              checked={showHidden}
              onCheckedChange={handleToggleHidden}
            />
            <Eye className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('showHidden')}</span>
          </label>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950 p-2 rounded">{error}</div>
        )}

        {/* File/directory listing */}
        <FileBrowserListing
          loading={loading}
          directories={directories}
          files={files}
          selectedFile={selectedFile}
          onNavigate={fetchDirectory}
          onSelectFile={handleSelectFile}
          onOpenFile={handleOpenFile}
        />

        {/* Action buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleOpen} disabled={!selectedFile}>
            {t('openSelectedFile')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
