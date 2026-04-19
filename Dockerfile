# ── Stage 1: Build React frontend ───────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY package.json package-lock.json* ./
RUN npm install

COPY index.html vite.config.js eslint.config.js ./
COPY public/ public/
COPY src/ src/
COPY data.json ./

# Vite env vars must be available at build time
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SABPAISA_CLIENT_CODE
ARG VITE_SABPAISA_USERNAME
ARG VITE_SABPAISA_PASSWORD
ARG VITE_SABPAISA_AUTHENTICATION_KEY
ARG VITE_SABPAISA_AUTHENTICATION_IV
ARG VITE_SABPAISA_ENV

RUN npm run build

# ── Stage 2: Build bridge server (v4 — route ordering fix) ──────────
FROM node:20-alpine AS bridge-build

WORKDIR /app

COPY bridge/package.json bridge/package-lock.json* ./
COPY bridge/vendor/ vendor/

RUN npm install

COPY bridge/tsconfig.json ./
COPY bridge/src/ src/

RUN npm run build

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
