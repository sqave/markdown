// Snippet Bridge — converts VS Code snippet JSON to CodeMirror format
// VS Code format: { prefix, body: ["line1", "$1 text $2"], description }
// CodeMirror format: snippet("line1\n${1} text ${2}")

import { snippet } from '@codemirror/autocomplete';

/**
 * Convert a VS Code snippet body array to a CodeMirror snippet string.
 * VS Code uses $1, $2, ${1:placeholder} — CodeMirror uses the same syntax.
 * @param {string[]} body - VS Code snippet body lines
 * @returns {string} CodeMirror-compatible snippet template
 */
function convertBody(body) {
  return body.join('\n')
    // VS Code uses $0 for final cursor; CodeMirror does too
    // Tab stops $1, $2, ${1:default} work in both
    // Only difference: VS Code variables like $TM_FILENAME — we strip those
    .replace(/\$\{?TM_\w+\}?/g, '');
}

/**
 * Convert a VS Code snippet JSON object to CodeMirror completions.
 * @param {object} snippetJson - Parsed VS Code snippet JSON
 * @returns {Array<{ label: string, detail: string, apply: Function }>}
 */
export function convertSnippets(snippetJson) {
  const completions = [];

  for (const [name, entry] of Object.entries(snippetJson)) {
    const prefixes = Array.isArray(entry.prefix) ? entry.prefix : [entry.prefix];
    const body = Array.isArray(entry.body) ? entry.body : [entry.body];
    const template = convertBody(body);

    for (const prefix of prefixes) {
      if (!prefix) continue;
      completions.push({
        label: prefix,
        detail: entry.description || name,
        type: 'snippet',
        apply: snippet(template),
      });
    }
  }

  return completions;
}

/**
 * Create a CodeMirror autocompletion source from VS Code snippets.
 * @param {Array} completions - Result of convertSnippets()
 * @returns {Function} CodeMirror completion source function
 */
export function snippetCompletionSource(completions) {
  return (context) => {
    const word = context.matchBefore(/\w+/);
    if (!word && !context.explicit) return null;

    return {
      from: word ? word.from : context.pos,
      options: completions,
      validFor: /^\w*$/,
    };
  };
}
