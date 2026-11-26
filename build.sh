#!/usr/bin/env bash
# Builds two single-file outputs from src/:
#   site/index.html        standalone site (Cloudflare Workers static assets; camera works over https)
#   dist/artifact.html     page body for the claude.ai artifact preview (no camera there)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p site dist
JS="src/shaders.js src/model.js src/samples.js src/app.js"
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="theme-color" content="#0c0f14">\n'
  cat <<'META'
<meta name="description" content="A browser simulator of how a dog sees: dichromat colour, low acuity, night vision and eye conditions, over a photo, a video or the live camera. An estimate, not a diagnosis.">
<link rel="canonical" href="https://doggo-vision.unstoppablesys.workers.dev/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Doggo Vision">
<meta property="og:title" content="Doggo Vision: see the world through a dog's eyes">
<meta property="og:description" content="Dichromat colour, low acuity, night vision and eye conditions, rendered live over your camera. An estimate, not a diagnosis.">
<meta property="og:url" content="https://doggo-vision.unstoppablesys.workers.dev/">
<meta property="og:image" content="https://doggo-vision.unstoppablesys.workers.dev/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A garden scene split in two: a human view on the left, and the same scene through a 15-year-old dog's eyes on the right, softer and veiled with muted colour.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Doggo Vision: see the world through a dog's eyes">
<meta name="twitter:description" content="Dichromat colour, low acuity, night vision and eye conditions, rendered live over your camera. An estimate, not a diagnosis.">
<meta name="twitter:image" content="https://doggo-vision.unstoppablesys.workers.dev/og.jpg">
META
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}</style>\n'
  cat src/head.html
  printf '</head>\n<body>\n'
  cat src/body.html
  echo "<script>"; cat $JS; echo "</script>"
  printf '</body>\n</html>\n'
} > site/index.html

{ cat src/head.html src/body.html; echo "<script>"; cat $JS; echo "</script>"; } > dist/artifact.html
echo "built site/index.html and dist/artifact.html"
