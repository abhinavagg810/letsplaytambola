#!/usr/bin/env node
// Runs after `expo export --platform web` (see `npm run build:web`). Works on dist/ only — never edits sources.
//  1. Puts the real site address (EXPO_PUBLIC_WEB_URL) into the link-preview tags of dist/index.html.
//  2. Fills the universal-link files in dist/.well-known from APPLE_TEAM_ID / ANDROID_SHA256_FINGERPRINTS
//     when those are set (handy on Vercel/Netlify); otherwise leaves whatever is in public/.well-known.
//  3. Warns loudly if placeholders are still there. With REQUIRE_APP_LINKS=1 that is an error.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
try { require('@expo/env').load(root, { silent: true }); } catch { /* .env is optional */ }

const DEFAULT_URL = 'https://letsplaytambola.app';
const dist = path.join(root, 'dist');
const file = (...p) => path.join(dist, ...p);
if (!fs.existsSync(file('index.html'))) { console.error('web-postbuild: dist/index.html not found — run `expo export --platform web` first'); process.exit(1); }

const site = (process.env.EXPO_PUBLIC_WEB_URL || DEFAULT_URL).replace(/\/+$/, '');
const html = fs.readFileSync(file('index.html'), 'utf8');
fs.writeFileSync(file('index.html'), html.split(DEFAULT_URL).join(site));
console.log(`web-postbuild: link-preview tags point at ${site}`);

const warnings = [];
if (!/property="og:image"/.test(html)) warnings.push('dist/index.html has no og:image tag (is public/index.html missing?)');

const aasaPath = file('.well-known', 'apple-app-site-association');
const linksPath = file('.well-known', 'assetlinks.json');
if (!fs.existsSync(aasaPath) || !fs.existsSync(linksPath)) {
  warnings.push('dist/.well-known is missing apple-app-site-association or assetlinks.json');
} else {
  const aasa = JSON.parse(fs.readFileSync(aasaPath, 'utf8'));     // also proves the files are valid JSON
  const links = JSON.parse(fs.readFileSync(linksPath, 'utf8'));

  const team = (process.env.APPLE_TEAM_ID || '').trim();
  if (team) for (const d of aasa.applinks.details) d.appIDs = d.appIDs.map((id) => id.replace(/^[^.]+\./, `${team}.`));
  const prints = (process.env.ANDROID_SHA256_FINGERPRINTS || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (prints.length) for (const l of links) l.target.sha256_cert_fingerprints = prints;
  fs.writeFileSync(aasaPath, JSON.stringify(aasa, null, 2) + '\n');
  fs.writeFileSync(linksPath, JSON.stringify(links, null, 2) + '\n');

  const ids = aasa.applinks.details.flatMap((d) => d.appIDs);
  if (ids.some((id) => !/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(id))) warnings.push('apple-app-site-association: Apple Team ID not filled in — links will not open the iPhone app');
  const fps = links.flatMap((l) => l.target.sha256_cert_fingerprints);
  if (!fps.length || fps.some((f) => !/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f))) warnings.push('assetlinks.json: SHA-256 fingerprint(s) not filled in — links will not open the Android app');
}

for (const w of warnings) console.warn(`web-postbuild: WARNING ${w}`);
if (warnings.length) {
  console.warn('web-postbuild: the website itself works without these; see docs/RELEASE.md step 6.');
  if (process.env.REQUIRE_APP_LINKS === '1') process.exit(1);
}
