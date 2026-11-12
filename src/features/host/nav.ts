// Small navigation helpers for the setup screens.

/** True when the Back button of the browser would stay on this site. */
export function canGoBackInSite(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const nav = (window as unknown as { navigation?: { canGoBack?: boolean; currentEntry?: { index: number } | null; entries?: () => { url: string | null }[] } }).navigation;
    if (nav && typeof nav.entries === 'function' && nav.currentEntry) {
      // The Navigation API only lists entries of this site.
      return nav.currentEntry.index > 0 && nav.canGoBack !== false;
    }
    return window.history.length > 1 && !!document.referrer && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}

let prizesOpenedFromSetup = false;

/** Remember that /host/prizes was opened from /host in this page session (so "Done" can simply go back). */
export function markPrizesOpenedFromSetup(on: boolean): void {
  prizesOpenedFromSetup = on;
}

export function wasPrizesOpenedFromSetup(): boolean {
  return prizesOpenedFromSetup;
}

/**
 * On phones the keyboard can cover the field being typed in. Call from onFocus: once the keyboard is up,
 * the field is scrolled to the middle of what is still visible.
 */
export function keepInView(e: { currentTarget: HTMLElement }): void {
  const el = e.currentTarget;
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: coarse)').matches) return;
  window.setTimeout(() => {
    if (document.activeElement === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 320);
}
