#!/usr/bin/env bash
# Build the standalone site and stage the same HTML for artifact previews.
set -euo pipefail
cd "$(dirname "$0")"
npm run build
mkdir -p dist
cp site/index.html dist/artifact.html
