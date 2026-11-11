import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Static settings live in app.json; this file adds the parts that depend on the web domain, so that
 * https://<domain>/g/CODE opens the installed app (iOS universal links, Android App Links).
 * The domain comes from EXPO_PUBLIC_WEB_URL — the same variable the app uses to build invite links.
 * The matching server-side files are public/.well-known/* (see docs/RELEASE.md, step 6).
 */
export const DEFAULT_WEB_URL = 'https://letsplaytambola.app'; // placeholder until the owner confirms the domain

export default ({ config }: ConfigContext): ExpoConfig => {
  const host = new URL(process.env.EXPO_PUBLIC_WEB_URL || DEFAULT_WEB_URL).host;
  return {
    ...config,
    name: config.name ?? 'Letsplaytambola',
    slug: config.slug ?? 'letsplaytambola',
    ios: { ...config.ios, associatedDomains: [`applinks:${host}`] },
    android: {
      ...config.android,
      intentFilters: [
        { action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'], data: [{ scheme: 'https', host, pathPrefix: '/g/' }] },
      ],
    },
  };
};
