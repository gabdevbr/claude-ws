/**
 * Shared list of directory names excluded from file tree traversal and search.
 * Used by tree-and-content, mime-and-language-constants, and search helpers.
 */
export const EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build', '.turbo'] as const;

/** Extended exclusion list for content search (adds Python/cache dirs) */
export const SEARCH_EXCLUDED_DIRS = [...EXCLUDED_DIRS, '__pycache__', '.cache'] as const;
