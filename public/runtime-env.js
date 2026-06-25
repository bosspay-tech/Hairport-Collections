// Local dev: empty object — app uses process.env from .env
// Docker: overwritten at container start by scripts/docker-entrypoint.sh
window.__RUNTIME_ENV__ = window.__RUNTIME_ENV__ || {};
