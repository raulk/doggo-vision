#!/usr/bin/env bash
# Builds two single-file outputs from src/:
#   site/index.html        standalone site (GitHub Pages; camera works over https)
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
<link rel="canonical" href="https://raulk.github.io/dogsight/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Dogsight">
<meta property="og:title" content="Dogsight: see the world through a dog's eyes">
<meta property="og:description" content="Dichromat colour, low acuity, night vision and eye conditions, rendered live over your camera. An estimate, not a diagnosis.">
<meta property="og:url" content="https://raulk.github.io/dogsight/">
<meta property="og:image" content="https://raulk.github.io/dogsight/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="A dog's silhouette in the foreground looking into a garden, which is rendered the way a 15-year-old dog sees it: soft, veiled, with muted yellow and blue colour. Title: See the world through a dog's eyes.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Dogsight: see the world through a dog's eyes">
<meta name="twitter:description" content="Dichromat colour, low acuity, night vision and eye conditions, rendered live over your camera. An estimate, not a diagnosis.">
<meta name="twitter:image" content="https://raulk.github.io/dogsight/og.jpg">
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
