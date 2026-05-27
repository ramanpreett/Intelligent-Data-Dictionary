#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const files = ['package-lock.json', 'yarn.lock'];
for (const f of files) {
  const p = path.join(root, f);
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (err) {
    // ignore
  }
}

const ua = process.env.npm_config_user_agent || '';
if (!/^pnpm\//.test(ua)) {
  console.error('Use pnpm instead');
  process.exit(1);
}

process.exit(0);
