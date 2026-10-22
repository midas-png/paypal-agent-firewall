#!/bin/bash
# Double-click to install, build and start Agent Payment Firewall on http://localhost:8787
cd "$(dirname "$0")" || exit 1
if ! command -v npm >/dev/null 2>&1; then
  echo "Node.js not found. Install it from https://nodejs.org (v20+) and run again."
  read -r -p "Press Enter to close"; exit 1
fi
set -e
npm install
npm run build
(sleep 6 && open "http://localhost:8787") &
npm start
