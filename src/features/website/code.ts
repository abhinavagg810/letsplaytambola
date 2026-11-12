/** Longest code the box accepts (codes are 5 characters; the design allows 6 to be forgiving). */
export const CODE_INPUT_MAX = 6;

/**
 * Turns whatever was typed or pasted into a game code: uppercase letters and digits only.
 * Also accepts a pasted share link ("https://letsplaytambola.com/g/K7RQ2", "…#g=K7RQ2") and pulls the code out of it.
 */
export function normalizeCode(raw: string): string {
  const text = raw.trim();
  const fromLink = text.match(/(?:\/g\/|[#?&]g=)([A-Za-z0-9]+)/);
  let code = text;
  if (fromLink) {
    code = fromLink[1];
  } else if (/:\/\/|\.[a-z]{2,}\//i.test(text)) {
    // Some other link: use its last path segment.
    code = text.split(/[?#]/)[0].split('/').filter(Boolean).pop() ?? '';
  }
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_INPUT_MAX);
}
