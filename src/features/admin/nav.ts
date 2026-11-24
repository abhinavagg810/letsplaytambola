// The admin's sections, shared by the sidebar, the phone drawer, the bottom tabs and the breadcrumb.
export interface NavItem {
  href: string;
  label: string;
  /** Path data for a 20×20 icon (stroke only). */
  icon: string;
  /** The global date range applies to this page. */
  ranged: boolean;
}
export interface NavGroup { title: string; items: NavItem[] }

export const NAV: NavGroup[] = [
  {
    title: 'Dashboard',
    items: [{ href: '/admin', label: 'Overview', icon: 'M3 10.5 10 4l7 6.5M5 9v7h4v-4h2v4h4V9', ranged: true }],
  },
  {
    title: 'Analysis',
    items: [
      { href: '/admin/acquisition', label: 'Acquisition', icon: 'M3 17 8 9l4 4 5-9M13 4h4v4', ranged: true },
      { href: '/admin/funnels', label: 'Funnels', icon: 'M3 4h14l-5 6v6l-4-2v-4z', ranged: true },
      { href: '/admin/geography', label: 'Geography', icon: 'M10 18s6-5.2 6-9.5A6 6 0 0 0 4 8.5C4 12.8 10 18 10 18zM10 10.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z', ranged: true },
      { href: '/admin/technology', label: 'Technology', icon: 'M6 2.5h8a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM9 15h2', ranged: true },
      { href: '/admin/engagement', label: 'Engagement', icon: 'M3 16V9m4.7 7V4m4.6 12v-5M17 16V7', ranged: true },
      { href: '/admin/retention', label: 'Retention', icon: 'M16 10a6 6 0 1 1-1.8-4.3M16 3v3h-3', ranged: false },
    ],
  },
  {
    title: 'Records',
    items: [
      { href: '/admin/games', label: 'Plays', icon: 'M3 5h14v10H3zM3 9h14M8 5v10', ranged: true },
      { href: '/admin/players', label: 'Players', icon: 'M7.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M13.5 9a2.5 2.5 0 1 0-1-4.8M15 12c1.8.5 3 2 3 4.5', ranged: false },
      { href: '/admin/events', label: 'Events', icon: 'M4 5h12M4 10h12M4 15h8', ranged: true },
      { href: '/admin/notify', label: 'Notify me', icon: 'M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13zM8.5 17.5a1.6 1.6 0 0 0 3 0', ranged: false },
      { href: '/admin/messages', label: 'Messages', icon: 'M3 5h14v10H3zM3.5 5.5 10 11l6.5-5.5', ranged: false },
    ],
  },
  {
    title: 'Settings',
    items: [{ href: '/admin/privacy', label: 'Data & privacy', icon: 'M10 2.5 4 5v4.5c0 4 2.6 6.8 6 8 3.4-1.200 6-4 6-8V5zM7.5 10l2 2 3-3.500', ranged: false }],
  },
];

export const NAV_ITEMS: NavItem[] = NAV.flatMap((g) => g.items);

/** The section a path belongs to ("/admin/games/K7RQ2" → Plays). */
export function sectionOf(path: string): NavItem | undefined {
  return NAV_ITEMS.filter((i) => (i.href === '/admin' ? path === '/admin' : path === i.href || path.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
