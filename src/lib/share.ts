// Share links: the game URL, WhatsApp, the system share sheet and copy-to-clipboard.

function origin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  return typeof window !== 'undefined' ? window.location.origin : '';
}

/** The link players open: https://letsplaytambola.com/g/K7RQ2 */
export function gameUrl(code: string): string {
  return `${origin()}/g/${code.trim().toUpperCase()}`;
}

/** A link without "https://" for showing on screen: letsplaytambola.com/g/K7RQ2 */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
}

/** The WhatsApp message for inviting people (prototype copy). */
export function inviteText(gameName: string, code: string): string {
  return `Join my Tambola game “${gameName}”! Tap the link, type your name and you’re in:\n${gameUrl(code)}`;
}

/** Opens WhatsApp with the text ready to send to any chat. */
export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Is the system share sheet available on this device? (false on the server and on most desktops) */
export function canShareNative(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Open the system share sheet. Call from a tap.
 * 'shared' = handed over; 'cancelled' = the person closed the sheet; 'unavailable' = no share sheet here (offer Copy link).
 */
export async function shareNative(data: { title?: string; text?: string; url?: string }): Promise<'shared' | 'cancelled' | 'unavailable'> {
  if (!canShareNative()) return 'unavailable';
  try {
    await navigator.share(data);
    return 'shared';
  } catch (e) {
    return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}

/** Copy text to the clipboard. Resolves false when the browser refuses (then show the text to copy by hand). */
export async function copy(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the old way
  }
  try {
    // Works on plain http (a game on the home Wi-Fi) and in older in-app browsers.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Turn whatever was typed or pasted into a game code: "k7rq2", " K7 RQ2 ", "letsplaytambola.com/g/k7rq2",
 * "https://…/g/K7RQ2?x=1" and the prototype's "#g=K7RQ2" all give "K7RQ2".
 * Letters and digits only, upper case, at most 6 characters. '' when there is nothing usable.
 */
export function normaliseCode(input: string): string {
  let s = (input ?? '').trim();
  const fromLink = s.match(/(?:\/g\/|[#?&]g=)([A-Za-z0-9]+)/);
  if (fromLink) s = fromLink[1];
  else if (/[/.]/.test(s)) s = s.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}
