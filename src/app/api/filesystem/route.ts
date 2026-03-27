import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';

// GET /api/filesystem?path=/some/path - List directories
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    let dirPath = searchParams.get('path') || os.homedir();

    // Resolve ~ to home directory
    if (dirPath.startsWith('~')) {
      dirPath = dirPath.replace('~', os.homedir());
    }

    dirPath = path.resolve(dirPath);

    // Ensure path exists and is a directory
    if (!fs.existsSync(dirPath)) {
      return NextResponse.json({ error: 'Path does not exist' }, { status: 404 });
    }

    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 });
    }

    // Read directory contents
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    // Filter to only directories, exclude hidden by default
    const showHidden = searchParams.get('showHidden') === 'true';
    const includeFiles = searchParams.get('includeFiles') === 'true';

    const directories = entries
      .filter((entry) => {
        if (!entry.isDirectory()) return false;
        if (!showHidden && entry.name.startsWith('.')) return false;
        return true;
      })
      .map((entry) => ({
        name: entry.name,
        path: path.join(dirPath, entry.name),
        isDirectory: true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // Optionally include files in the response
    let files: { name: string; path: string; isDirectory: boolean; size: number }[] = [];
    if (includeFiles) {
      files = entries
        .filter((entry) => {
          if (!entry.isFile()) return false;
          if (!showHidden && entry.name.startsWith('.')) return false;
          return true;
        })
        .map((entry) => {
          const filePath = path.join(dirPath, entry.name);
          let size = 0;
          try { size = fs.statSync(filePath).size; } catch {}
          return { name: entry.name, path: filePath, isDirectory: false, size };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    // Get parent directory
    const parentPath = path.dirname(dirPath);
    const canGoUp = parentPath !== dirPath;

    return NextResponse.json({
      currentPath: dirPath,
      parentPath: canGoUp ? parentPath : null,
      directories,
      ...(includeFiles ? { files } : {}),
      homePath: os.homedir(),
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return NextResponse.json(
      { error: 'Failed to read directory' },
      { status: 500 }
    );
  }
}
