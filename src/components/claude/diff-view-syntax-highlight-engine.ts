// Syntax highlighting engine for diff view using highlight.js
// Registers common languages and provides enhanced TypeScript/JS highlighting

import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import bash from 'highlight.js/lib/languages/bash';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import markdown from 'highlight.js/lib/languages/markdown';

// Register all supported languages
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', css);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('rs', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);

/** Map a file extension to a highlight.js language identifier */
export function getLanguageFromPath(filePath?: string): string | undefined {
  if (!filePath) return undefined;
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
    css: 'css', scss: 'css', html: 'html', json: 'json', md: 'markdown',
    sh: 'bash', bash: 'bash', yml: 'yaml', yaml: 'yaml', sql: 'sql',
  };
  return langMap[ext];
}

/**
 * Post-process highlighted TypeScript/JavaScript HTML to add colors for
 * patterns that highlight.js misses (type annotations, generics, property names)
 */
function enhanceTypeScriptHighlighting(html: string, language?: string): string {
  if (!language || !['typescript', 'ts', 'tsx', 'javascript', 'js', 'jsx'].includes(language)) {
    return html;
  }

  let result = html;

  // Type annotations - match PascalCase after : that are not already wrapped
  result = result.replace(
    /(:(?:\s*)(?:<[^>]*>)?(?:\s*))([A-Z][a-zA-Z0-9_]*(?:\[\])?)/g,
    (match, prefix, typeName) => {
      if (prefix.includes('hljs-')) return match;
      return `${prefix}<span class="hljs-type">${typeName}</span>`;
    }
  );

  // Generic type parameters: <TypeName, AnotherType>
  result = result.replace(
    /(&lt;)([A-Z][a-zA-Z0-9_,\s]*?)(&gt;)/g,
    (match, open, types, close) => {
      const wrappedTypes = types.split(',').map((t: string) => {
        const trimmed = t.trim();
        if (trimmed.match(/^[A-Z][a-zA-Z0-9_]*$/)) {
          return `<span class="hljs-type">${trimmed}</span>`;
        }
        return trimmed;
      }).join(', ');
      return `${open}${wrappedTypes}${close}`;
    }
  );

  // Interface/Type property names (identifier followed by : or ?)
  result = result.replace(
    /^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\??:)/gm,
    (match, indent, propName, colon) => {
      const keywords = ['if', 'else', 'for', 'while', 'return', 'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'export', 'import', 'from', 'default', 'extends', 'implements'];
      if (keywords.includes(propName)) return match;
      return `${indent}<span class="hljs-property">${propName}</span>${colon}`;
    }
  );

  return result;
}

/** Escape HTML special characters */
export function escapeHtml(code: string): string {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Highlight a code string with syntax coloring; falls back to HTML-escaped plain text */
export function highlightCode(code: string, language?: string): string {
  if (!language) {
    return escapeHtml(code);
  }
  try {
    const result = hljs.highlight(code, { language, ignoreIllegals: true });
    return enhanceTypeScriptHighlighting(result.value, language);
  } catch {
    return escapeHtml(code);
  }
}
