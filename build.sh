#!/usr/bin/env bash
# Builds two single-file outputs from src/:
#   site/index.html        standalone site (Cloudflare Pages; camera works over https)
#   dist/artifact.html     page body for the claude.ai artifact preview (no camera there)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p site dist
JS="src/shaders.js src/model.js src/samples.js src/app.js"
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0c0f14">\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}</style>\n'
  cat src/head.html
  printf '</head>\n<body>\n'
  cat src/body.html
  echo "<script>"; cat $JS; echo "</script>"
  printf '</body>\n</html>\n'
} > site/index.html

{ cat src/head.html src/body.html; echo "<script>"; cat $JS; echo "</script>"; } > dist/artifact.html
echo "built site/index.html and dist/artifact.html"
