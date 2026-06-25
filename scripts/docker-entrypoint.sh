#!/bin/sh
set -e

# Inject server env into the browser at container start (Coolify runtime vars).
node -e "
const fs = require('fs');
const env = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    '',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '',
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || '',
};
fs.writeFileSync(
  '/app/public/runtime-env.js',
  'window.__RUNTIME_ENV__=' + JSON.stringify(env) + ';',
);
console.log('[entrypoint] runtime-env.js written');
"

exec node server.js
