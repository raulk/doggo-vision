# doggo-vision

A browser simulator of how a specific dog sees: dichromat colour, low acuity with breed-dependent retinal topography, night vision, and 24 eye conditions. It runs as WebGL2 shaders over a photo, a video or the live camera.

**Live site:** https://doggo-vision.unstoppablesys.workers.dev/ (open it on a phone and tap **Live camera**).

This is an illustration, not a measured percept and not a diagnosis.

## How it works

One composite shader follows the light path through the eye, in this order: lids, tear film and cornea, chamber and iris, lens, optics, dichromat colour, retinal acuity map, field loss, gain/glare/noise, then temporal effects. Spatially varying blur samples a Gaussian mip pyramid. Each stage can be bypassed from the strip under the image.

The parameters come from the project's research catalog: the dog colour matrix, acuity in cycles per degree, streak vs area centralis by cephalic index, and lifespan-scaled ageing. Condition recipes use a 0 to 1 severity. The Data tab imports detector output (schema 0.1) and exports the profile, condition hypotheses and shader parameters in the same schema.

## Layout

- `src/` holds the sources: `head.html` (styles), `body.html` (markup), `shaders.js` (GLSL), `model.js` (profile → parameters, detector mapping), `samples.js` (procedural scenes), `app.js` (renderer and UI).
- `./build.sh` writes `site/index.html` (the deployed site) and `dist/artifact.html` (the claude.ai preview build).

Edit `src/`, run `./build.sh`, and commit both outputs. Cloudflare deploys on every push to `main`; `wrangler.jsonc` serves `site/` as static assets, with no build step.
