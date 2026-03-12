/**
 * Git status map reader - runs `git status --porcelain` and parses output into a
 * per-file status map plus a list of untracked directory prefixes.
 * Extracted from tree-and-content.ts to keep files under 200 lines.
 */
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type GitFileStatusCode = 'M' | 'A' | 'D' | 'R' | 'U';

export interface GitStatusResult {
  fileStatus: Map<string, GitFileStatusCode>;
  untrackedDirs: string[];
}

/**
 * Run `git status --porcelain` in the given directory and return a map of
 * relative file paths to their status codes, plus a list of untracked dir prefixes.
 */
export async function getGitStatusMap(cwd: string): Promise<GitStatusResult> {
  const fileStatus = new Map<string, GitFileStatusCode>();
  const untrackedDirs: string[] = [];
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd, timeout: 5000 });
    for (const line of stdout.trim().split('\n')) {
      if (!line || line.length < 3) continue;
      const indexStatus = line[0];
      const worktreeStatus = line[1];
      let filePath = line.slice(3).trim();
      if (filePath.includes(' -> ')) filePath = filePath.split(' -> ')[1];
      if (indexStatus === '?' && worktreeStatus === '?') {
        if (filePath.endsWith('/')) untrackedDirs.push(filePath.slice(0, -1));
        else fileStatus.set(filePath, 'U');
        continue;
      }
      const status = indexStatus !== ' ' ? indexStatus : worktreeStatus;
      if (status === 'M' || status === 'A' || status === 'D' || status === 'R') {
        fileStatus.set(filePath, status as GitFileStatusCode);
      } else if (status === 'U') {
        fileStatus.set(filePath, 'U');
      } else {
        fileStatus.set(filePath, 'M');
      }
    }
  } catch {
    // Not a git repo or git command failed — return empty maps
  }
  return { fileStatus, untrackedDirs };
}
