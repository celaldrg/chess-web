/**
 * Clipboard and file download helpers for the PGN buttons (browser only).
 */

/**
 * Copies text, falling back to a hidden textarea when the async clipboard
 * API is missing or refused.
 * @param {string} text
 * @returns {Promise<boolean>} true when the text was copied
 */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return legacyCopy(text);
  }
}

function legacyCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.className = 'offscreen';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

/**
 * Saves text as a file through a temporary download link.
 * @param {string} filename
 * @param {string} text
 * @param {string} [type] MIME type
 */
export function downloadText(filename, text, type = 'application/x-chess-pgn') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.className = 'offscreen';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
