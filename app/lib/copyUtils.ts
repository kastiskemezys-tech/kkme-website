/**
 * Pure copy/format helpers — no UI state, no React imports.
 */

/** Copy text to clipboard. Returns true on success, false on failure. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Format rows as tab-separated table string for pasting into spreadsheets. */
export function formatTable(
  headers: string[],
  rows: Array<string[]>,
): string {
  const lines = [headers.join('\t')];
  for (const row of rows) {
    lines.push(row.join('\t'));
  }
  return lines.join('\n');
}
