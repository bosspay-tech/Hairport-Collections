# ── Stage 1: Build React frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html vite.config.js eslint.config.js ./
COPY public/ public/
COPY src/ src/
COPY data.json ./

# Vite env vars must be available at build time.
# ONLY add values that are safe to ship to the browser. SabPaisa creds
# are NOT in this list — they stay server-side (see bridge/.env.example).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run build

# ── Stage 2: Build bridge server (v4 — route ordering fix) ──────────
FROM node:20-alpine AS bridge-build

WORKDIR /app

COPY bridge/package.json bridge/package-lock.json* ./
COPY bridge/vendor/ vendor/

RUN npm install

COPY bridge/tsconfig.json ./
COPY bridge/src/ src/

# tsc compiles .ts → dist/, but doesn't copy .json assets. The customer pool
# is loaded at runtime via readFileSync next to the compiled JS, so we stage
# it into dist/ before the prod image copies dist/ over.
RUN npm run build && cp src/customer-pool.json dist/customer-pool.json

# ── Stage 3: Production image ──────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY bridge/package.json bridge/package-lock.json* ./
COPY bridge/vendor/ vendor/

RUN npm install --omit=dev

# Bridge server code
COPY --from=bridge-build /app/dist/ dist/

# React frontend static files
COPY --from=frontend-build /frontend/dist/ public/

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/server.js"]
