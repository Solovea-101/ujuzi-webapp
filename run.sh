#!/usr/bin/env bash
# Clean-clone helper: install, build and start Ujuzi on http://localhost:3000.
# With no DATABASE_URL the app keeps its data in memory, so no database is needed.
set -euo pipefail
cd "$(dirname "$0")"

node -e 'const [maj, min] = process.versions.node.split(".").map(Number); if (maj < 20 || (maj === 20 && min < 9)) { console.error("Node.js 20.9 or newer is required (found " + process.version + ")"); process.exit(1); }'

[ -f .env ] || { cp .env.example .env && echo "Created .env from .env.example"; }
npm install
npm run build
exec npm start
