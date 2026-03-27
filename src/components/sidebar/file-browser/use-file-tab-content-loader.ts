'use client';

import { useState, useEffect, useRef } from 'react';
import type { FileContent } from './use-file-tab-state';

interface UseFileTabContentLoaderOptions {
  filePath: string;
  activeProjectPath: string | null | undefined;
  onLoaded: (content: FileContent) => void;
  onReset: () => void;
}

/**
 * Resolve basePath and relative path for the file content API.
 * If filePath is absolute and outside the project, use the file's parent dir as basePath.
 */
export function resolveFileApiPaths(filePath: string, projectPath: string) {
  const isAbsolute = filePath.startsWith('/');
  if (isAbsolute && !filePath.startsWith(projectPath + '/') && filePath !== projectPath) {
    const lastSlash = filePath.lastIndexOf('/');
    return {
      basePath: filePath.substring(0, lastSlash) || '/',
      relativePath: filePath.substring(lastSlash + 1),
    };
  }
  return { basePath: projectPath, relativePath: filePath };
}

/**
 * useFileTabContentLoader - Fetches file content from the server when filePath changes.
 * Calls onLoaded with the response data or onReset when filePath/project is cleared.
 * Extracted from use-file-tab-state to keep it under 200 lines.
 */
export function useFileTabContentLoader({
  filePath,
  activeProjectPath,
  onLoaded,
  onReset,
}: UseFileTabContentLoaderOptions) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!filePath || !activeProjectPath) {
      fetchedPathRef.current = null;
      onReset();
      return;
    }

    if (fetchedPathRef.current === filePath) return;

    console.log('[FileTabContent] Fetching file content', { filePath, timestamp: Date.now() });
    fetchedPathRef.current = filePath;

    const fetchContent = async () => {
      setLoading(true);
      setError(null);
      try {
        const { basePath, relativePath } = resolveFileApiPaths(filePath, activeProjectPath);
        const res = await fetch(
          `/api/files/content?basePath=${encodeURIComponent(basePath)}&path=${encodeURIComponent(relativePath)}`
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch file');
        }
        const data: FileContent = await res.json();
        onLoaded(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchContent();
  }, [filePath, activeProjectPath]);

  return { loading, error };
}
