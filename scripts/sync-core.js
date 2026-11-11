#!/usr/bin/env node
// Copies the shared game engine into the Supabase functions folder so the `game` Edge Function
// bundles exactly the code the app runs. The copy is git-ignored; run before every deploy
// (`npm run deploy:functions` does it for you).
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'packages', 'game-core', 'src');
const dest = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'core');

fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, {
  recursive: true,
  filter: (p) => !/__tests__|\.test\.ts$/.test(path.relative(src, p)),
});
console.log(`sync-core: ${path.relative(process.cwd(), src)} -> ${path.relative(process.cwd(), dest)}`);
