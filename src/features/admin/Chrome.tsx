'use client';
// The admin frame: a left sidebar that stays put (collapsible; a drawer on phones), a top bar with the breadcrumb, the
// global date range, compare, "loaded at" + refresh and sign out, and a bottom tab bar on phones.
// The date range lives in the URL (?range=…&cmp=1), so every link here carries it along.
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import { cx } from '@/components/cx';
import { NAV, sectionOf } from './nav';
import type { NavItem } from './nav';
import { SignOutButton } from './SignOutButton';
import styles from './ui.module.css';

const RANGES: [string, string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days']];
const RANGE_KEYS = ['range', 'from', 'to', 'cmp'];
const COLLAPSE_KEY = 'lpt:admin:nav';

function Icon({ d }: { d: string }) {
  return (
    <svg className={styles.navIcon} viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const istClock = (ms: number): string => {
  const d = new Date(ms + 5.5 * 3600_000);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** `badges`: a count to show beside a section, by its href (e.g. unread messages). */
export function AdminChrome({ email, minDay, maxDay, badges, children }: { email: string; minDay: string; maxDay: string; badges?: Record<string, number>; children: ReactNode }) {
  const pathname = usePathname() ?? '/admin';
  const search = useSearchParams();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const customRef = useRef<HTMLDetailsElement>(null);
  const query = search?.toString() ?? '';

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // storage blocked: stay expanded
    }
  }, []);
  // A new page (or new filters) has just been rendered by the server.
  useEffect(() => {
    setLoadedAt(Date.now());
    setDrawer(false);
    if (customRef.current) customRef.current.open = false;
  }, [pathname, query]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        // not remembered
      }
      return !c;
    });
  };

  const rangeKey = search?.get('range') === 'custom' && (search.get('from') || search.get('to')) ? 'custom' : RANGES.some(([k]) => k === search?.get('range')) ? search!.get('range')! : '7d';
  const cmp = search?.get('cmp') === '1';
  // What a link to another section carries: the range and the compare switch.
  const carried = new URLSearchParams();
  for (const k of RANGE_KEYS) {
    const v = search?.get(k);
    if (v) carried.set(k, v);
  }
  const navHref = (item: NavItem): string => {
    const s = carried.toString();
    return s ? `${item.href}?${s}` : item.href;
  };
  // What a range button changes: only the range, keeping this page's own filters (but going back to page 1).
  const here = (change: (p: URLSearchParams) => void): string => {
    const p = new URLSearchParams(query);
    p.delete('page');
    change(p);
    const s = p.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  const rangeHref = (key: string): string => here((p) => {
    p.delete('from');
    p.delete('to');
    if (key === '7d') p.delete('range');
    else p.set('range', key);
  });
  const cmpHref = here((p) => (cmp ? p.delete('cmp') : p.set('cmp', '1')));
  const kept = [...new URLSearchParams(query)].filter(([k]) => !['range', 'from', 'to', 'page'].includes(k));

  const section = sectionOf(pathname);
  const leaf = section && pathname !== section.href ? decodeURIComponent(pathname.slice(section.href.length + 1)) : '';
  const ranged = section?.ranged ?? false;

  const refresh = () => {
    startRefresh(async () => {
      try {
        // Drop the server's 30-second cache of aggregates, then render this page again.
        await fetch('/api/admin/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
      } catch {
        // still re-render
      }
      router.refresh();
      setLoadedAt(Date.now());
    });
  };

  const nav = (onNavigate?: () => void) => (
    <nav className={styles.sideNav} aria-label="Admin sections">
      {NAV.map((group) => (
        <div key={group.title} className={styles.navGroup}>
          <div className={styles.navGroupTitle}>{group.title}</div>
          {group.items.map((item) => (
            <Link key={item.href} href={navHref(item)} prefetch={false} className={styles.navItem} aria-current={section?.href === item.href ? 'page' : undefined} title={badges?.[item.href] ? `${item.label} — ${badges[item.href]} unread` : item.label} onClick={onNavigate}>
              <Icon d={item.icon} />
              <span className={styles.navLabel}>{item.label}</span>
              {badges?.[item.href] ? (
                <span className={styles.navBadge}>
                  {badges[item.href] > 99 ? '99+' : badges[item.href]}
                  <span className="visually-hidden"> unread</span>
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  const tabs = ['/admin', '/admin/games', '/admin/players', '/admin/funnels'];

  return (
    <div className={styles.shell} data-collapsed={collapsed ? 'true' : undefined}>
      <a href="#admin-main" className={styles.skip}>Skip to the page</a>

      <aside className={styles.sidebar}>
        <div className={styles.sideHead}>
          {/* A plain link (full page load) keeps this out of the client router's cache. */}
          <a href="/admin" className={styles.brand} title="Letsplaytambola admin">
            <span className={styles.brandBall} aria-hidden="true">L</span>
            <span className={styles.brandText}>Letsplaytambola <span className={styles.brandTag}>Admin</span></span>
          </a>
        </div>
        {nav()}
        <button type="button" className={styles.collapseBtn} onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}>
          <Icon d={collapsed ? 'M8 5l5 5-5 5' : 'M12 5l-5 5 5 5'} />
          <span className={styles.navLabel}>Collapse</span>
        </button>
      </aside>

      {drawer ? (
        <div className={styles.drawerScrim} onClick={() => setDrawer(false)}>
          <div className={styles.drawer} role="dialog" aria-modal="true" aria-label="Admin sections" onClick={(e) => e.stopPropagation()}>
            <div className={styles.drawerHead}>
              <span className={styles.brandText}>Letsplaytambola <span className={styles.brandTag}>Admin</span></span>
              <button type="button" className={styles.iconBtn} onClick={() => setDrawer(false)} aria-label="Close the menu" autoFocus>
                <Icon d="M5 5l10 10M15 5 5 15" />
              </button>
            </div>
            {nav(() => setDrawer(false))}
            <div className={styles.drawerFoot}>
              <span className={styles.whoEmail} title={email}>{email}</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.body}>
        <header className={styles.topbar}>
          <div className={styles.topRow}>
            <button type="button" className={cx(styles.iconBtn, styles.menuBtn)} onClick={() => setDrawer(true)} aria-label="Open the menu" aria-expanded={drawer}>
              <Icon d="M3 5h14M3 10h14M3 15h14" />
            </button>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <ol>
                <li><Link href={navHref(NAV[0].items[0])} prefetch={false}>Admin</Link></li>
                {section ? (
                  <li aria-current={leaf ? undefined : 'page'}>
                    {leaf ? <Link href={navHref(section)} prefetch={false}>{section.label}</Link> : section.label}
                  </li>
                ) : null}
                {leaf ? <li aria-current="page" className={styles.crumbLeaf}>{leaf}</li> : null}
              </ol>
            </nav>
            <div className={styles.topActions}>
              <span className={styles.loaded} title="When this page's numbers were loaded (India time)">
                {loadedAt ? <>Updated <time dateTime={new Date(loadedAt).toISOString()}>{istClock(loadedAt)}</time></> : 'Loading…'}
              </span>
              <button type="button" className={styles.topBtn} onClick={refresh} disabled={refreshing} aria-label="Refresh the numbers on this page">
                <Icon d="M16 10a6 6 0 1 1-1.8-4.3M16 3v3h-3" />
                <span className={styles.topBtnText}>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
              <span className={styles.who}>
                <span className={styles.whoEmail} title={email}><span className="visually-hidden">Signed in as </span>{email}</span>
                <SignOutButton />
              </span>
            </div>
          </div>

          <div className={styles.rangeRow} data-off={ranged ? undefined : 'true'}>
            <div className={styles.rangeSeg} role="group" aria-label="Date range (India time)">
              {RANGES.map(([key, label]) => (
                <Link key={key} href={rangeHref(key)} prefetch={false} className={styles.rangeLink} aria-current={rangeKey === key ? 'true' : undefined}>
                  {label}
                </Link>
              ))}
              <details className={styles.custom} ref={customRef}>
                <summary className={styles.rangeLink} aria-current={rangeKey === 'custom' ? 'true' : undefined}>
                  {rangeKey === 'custom' ? `${search?.get('from') ?? '…'} → ${search?.get('to') ?? '…'}` : 'Custom'}
                </summary>
                <form className={styles.customForm} method="get" action={pathname}>
                  <input type="hidden" name="range" value="custom" />
                  {kept.map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
                  <label className={styles.customField}>
                    <span>From</span>
                    <input type="date" name="from" defaultValue={search?.get('from') ?? ''} min={minDay} max={maxDay} required />
                  </label>
                  <label className={styles.customField}>
                    <span>To</span>
                    <input type="date" name="to" defaultValue={search?.get('to') ?? ''} min={minDay} max={maxDay} required />
                  </label>
                  <button type="submit" className={styles.customApply}>Apply</button>
                  <p className={styles.customHint}>India days, at most 90 — nothing older is kept.</p>
                </form>
              </details>
            </div>
            <Link href={cmpHref} prefetch={false} className={styles.cmp} role="switch" aria-checked={cmp} title="Show the change against the period of the same length just before">
              <span className={styles.cmpKnob} aria-hidden="true" />
              Compare to previous period
            </Link>
            {!ranged ? <span className={styles.rangeNote}>The date range does not apply to this page.</span> : null}
          </div>
        </header>

        <main id="admin-main" className={styles.main} tabIndex={-1}>
          {children}
        </main>
      </div>

      <nav className={styles.tabbar} aria-label="Main sections">
        {NAV.flatMap((g) => g.items).filter((i) => tabs.includes(i.href)).map((item) => (
          <Link key={item.href} href={navHref(item)} prefetch={false} className={styles.tab} aria-current={section?.href === item.href ? 'page' : undefined}>
            <Icon d={item.icon} />
            {item.label}
          </Link>
        ))}
        <button type="button" className={styles.tab} onClick={() => setDrawer(true)} aria-current={section && !tabs.includes(section.href) ? 'page' : undefined}>
          <Icon d="M3 5h14M3 10h14M3 15h14" />
          More
        </button>
      </nav>
    </div>
  );
}
