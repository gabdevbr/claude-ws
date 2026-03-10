import path from 'path';

/**
 * Validate path stays within allowed root directory.
 * Prevents path traversal attacks like ../../../etc/passwd
 *
 * @param targetPath - User-provided path to validate
 * @param allowedRoot - Root directory that bounds allowed operations
 * @returns Resolved absolute path
 * @throws Error if path traversal detected
 */
export function validatePath(targetPath: string, allowedRoot: string): string {
  const resolved = path.resolve(targetPath);
  const relative = path.relative(allowedRoot, resolved);

  if (relative.startsWith('..')) {
    throw new Error('Path traversal detected');
  }

  return resolved;
}
