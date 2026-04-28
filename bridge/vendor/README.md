# BossPay Bridge — integration pack

Use this folder as-is: install the tarball, verify the checksum, then wire your SabPaisa / AirPay (or other) handlers using the optional starters.

## Contents

| Item | Purpose |
|------|---------|
| `bosspay-bridge-node-<version>.tgz` | NPM package — `npm install` this file. |
| `SHA256.txt` | Verify the tarball before install. |
| `QUICKSTART.md` | Step-by-step: verify, install, env, HTTPS, callbacks, what to send BossPay. |
| `starters-reference/` | Example Supabase Edge + Express apps (copy what you need). |

Full API and troubleshooting: after install, open `node_modules/@bosspay/bridge-node/README.md`.
