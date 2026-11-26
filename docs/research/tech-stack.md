# Dog Vision Simulator: Libraries, Techniques and Recommended Stack

Research date: 25 November 2026. Versions and licences below were read from the npm registry on that date; bundle sizes were measured from the published tarballs (gzip -9, unminified unless stated) unless another source is named. Companion to `research/dog-vision-catalog.md`, whose Synthesis §S3 defines the 12-stage shader pipeline this stack has to run.

---

## 0. TL;DR

**Recommended stack**

| Layer | Pick | Why |
|---|---|---|
| Rendering core | **Hand-written WebGL2 fragment passes, with `twgl.js` 7 (MIT, ~7 KB gz) as the only helper** | The pipeline is pure 2D image processing (no scene graph, no compute strictly needed). WebGL2 runs on effectively every phone, including Firefox Android and older Android where WebGPU is still off. Tiny, no framework lock-in, easy to port. |
| Upgrade path | **WebGPU behind a feature flag**, for compute-only extras (FFT glare/bloom, histograms for auto-exposure) | WebGPU is default in Chrome/Edge (desktop + Android 12+), Safari 26 (macOS/iOS/iPadOS) and Firefox (Windows, Apple-silicon macOS); still off on Firefox Android, most Linux and older Android. |
| Alternative if a 3D "walk as a dog" mode becomes a goal | **three.js r187 `WebGPURenderer` + TSL `RenderPipeline`** (MIT) | One TSL node graph compiles to WGSL or GLSL with automatic WebGL2 fallback; brings a scene graph for wide-FOV reprojection. Costs ~250–550 KB gz and the renderer is still labelled experimental. |
| Camera / images | `getUserMedia` + `requestVideoFrameCallback`; `createImageBitmap` for stills; `exifr` (MIT) for focal length → pixels-per-degree | All native; exifr is the de-facto EXIF reader. |
| Recording / export | Canvas `captureStream` + `MediaRecorder` for quick clips; **Mediabunny** (MPL-2.0, active) for WebCodecs MP4/WebM | Mediabunny is the maintained successor to mp4-muxer/webm-muxer. |
| Colour model | Own 3×3 matrices in linear RGB (dog cone fundamentals, per catalog §1.5); Machado 2009 / Viénot 1999 matrices only as cross-checks | Human-deuteranope simulators are a close but wrong proxy for dogs (catalog §1.4). |
| Eye-photo ML (later) | **ONNX Runtime Web 1.31** (MIT) with WebGPU EP and WASM fallback; custom detector + classifier/segmenter trained in PyTorch and exported to ONNX | Framework-neutral, best op coverage, smallest JS shim. Use **Transformers.js 4.3** for quick zero-shot prototyping. MediaPipe face/iris landmarkers are human-only and won't find dog eyes. |
| Tooling | Vite + `vite-plugin-glsl` (MIT) for `#include` in shaders; `@webgpu/types` for the WebGPU path | Keeps shader stages as separate files. |

**Avoid or be careful with**: `regl` (no WebGL2, last release Nov 2024), `picogl` (unmaintained since 2022), `gpu.js` (GPGPU, not for image pipelines), **LYGIA** shader library (Prosperity licence: free for non-commercial only, commercial use needs a paid patron licence), **Ultralytics YOLO** weights/code (AGPL-3.0, or paid enterprise licence) and any GitHub repo without a licence.

---

## 1. GPU layer: WebGL2 vs WebGPU

### 1.1 Platform support (late 2026)

From the gpuweb [Implementation Status wiki](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status) (edited 2 Oct 2026):

| Platform | WebGPU default? |
|---|---|
| Chrome/Edge desktop: Windows, macOS, ChromeOS | Yes, since 113 |
| Chrome Linux | Intel Gen12+ since 144; NVIDIA on Wayland since 147; others behind a flag |
| Chrome Android | Android 12+ on ARM/Qualcomm/Intel GPUs since 121; Imagination GPUs on Android 16+ since 139; Samsung Xclipse "TBD" |
| Safari 26 (macOS Tahoe, iOS 26, iPadOS 26, visionOS 26) | Yes. Reports say Safari 26 on macOS 15 still has it off ([enterno.io](https://enterno.io/en/s/research-webgpu-adoption-browsers-2026)) |
| Firefox desktop | Windows since 141; Apple-silicon macOS since 145; Linux Nightly only; Intel Macs not by default |
| Firefox Android | Behind a flag |

caniuse-based estimate: ~84% of global page views fully supported, ~3% partial ([enterno.io](https://enterno.io/en/s/research-webgpu-adoption-browsers-2026), Aug 2026). WebGL2 is effectively universal (Safari since 15).

**Video into WebGPU**: `GPUDevice.importExternalTexture` takes an `HTMLVideoElement` or `VideoFrame`; the texture expires as soon as it is used (video element) or when the frame is closed ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/importExternalTexture)). WebKit's webcam-texture bug is fixed ([281680](https://bugs.webkit.org/show_bug.cgi?id=281680)); the documented workaround on older builds is `new VideoFrame(video)`. Firefox has shipped external textures on Windows and macOS, with Linux and Android still open ([Mozilla 1827116](https://bugzilla.mozilla.org/show_bug.cgi?id=1827116)).

**Implication**: for a phone-first webcam app, WebGL2 must be the baseline. WebGPU is a progressive enhancement, not the foundation, until Firefox Android and older Android catch up.

### 1.2 Library comparison

| Library | Version (npm, 25 Nov 2026) | Last publish | Licence | Size | Backends | Fit for Doggo |
|---|---|---|---|---|---|---|
| **Raw WebGL2** | — | — | — | ~0 | WebGL2 | Full control; the prototype thread already does this. |
| **twgl.js** | 7.0.0 | Jul 2025 | MIT | ~7 KB gz ([benchmark](https://awesome.ecosyste.ms/projects/github.com%2Fjsulpis%2Fwebgl-libs-comparison)) | WebGL1/2 | Thin helpers (programs, uniforms, framebuffers) over raw GL. **Best fit for the core.** Benchmark lists its WebGL2 coverage as "partial" (it targets both), which is fine for full-screen passes. |
| **OGL** | 1.0.11 | Jan 2025 | Unlicense | 29 KB min+gz total; core 8 KB ([README](https://raw.githubusercontent.com/oframe/ogl/master/README.md)) | WebGL1/2 | Minimal three-like API with `Post` helper. Good alternative; slow release cadence. |
| **three.js** | 0.187.0 (r187) | 30 Oct 2026 | MIT | `three.webgpu.js` 258 KB + `three.core.js` 283 KB gz (unminified, before tree-shaking); WebGL-only `three.module.js` 126 KB gz | WebGPU with auto WebGL2 fallback; WebGLRenderer still maintained | TSL compiles to WGSL or GLSL. r183 renamed `PostProcessing` → `RenderPipeline` ([cinevva](https://app.cinevva.com/news/2026-03-18-threejs-r183-render-pipeline)). Effects are TSL nodes chained from `pass(scene, camera)`; built-ins include FXAA, TRAA, LUT3D, DOF, bloom, rgbShift ([manual](https://threejs.org/manual/en/webgpu-postprocessing)). Manual still calls WebGPURenderer "experimental" ([manual](https://threejs.org/manual/pages/webgpurenderer)). **Best if a 3D mode is wanted.** |
| **pmndrs/postprocessing** | 6.39.6 | Nov 2026 | Zlib | — | WebGL (three WebGLRenderer) only | Large effect library (bloom, blur, DOF, LUT, vignette, noise, god rays, chromatic aberration). No WebGPU yet per [README](https://github.com/pmndrs/postprocessing). Useful only in a three WebGL setup. |
| **PixiJS** | 8.23.0 | 20 Nov 2026 | MIT | 249 KB gz (`pixi.min.mjs`) | WebGL2 + WebGPU | 2D engine; custom `Filter` needs both a GLSL `glProgram` and a WGSL `gpuProgram` for dual support ([guide](https://pixijs.com/8.x/guides/components/filters.md)). Built-ins: Blur, ColorMatrix, Displacement, Noise; `pixi-filters` 6.1.5 adds motion/radial/zoom/tilt-shift blur, RGB split etc. Overkill for one full-screen pipeline, and you'd write every shader twice. |
| **luma.gl** | `@luma.gl/core` 9.4.2 | 24 Nov 2026 | MIT | — | WebGPU + WebGL2 | vis.gl (deck.gl) foundation. Ships shader passes: Gaussian/triangle blur, bloom, tilt-shift, zoom blur, DOF, depth-aware blur, and an experimental **FFT convolution bloom (WebGPU only)** ([docs](https://luma.gl/docs/api-reference/shadertools/shader-passes/bloom)). Worth reading for technique; heavier API than twgl. |
| **TypeGPU** | 0.12.11 | 23 Nov 2026 | MIT | — | WebGPU; experimental `@typegpu/gl` WebGL2 fallback (render subset, no compute) ([0.12 post](https://docs.swmansion.com/TypeGPU/blog/typegpu-012/)) | Type-safe WGSL from TypeScript (`'use gpu'` functions). Very active (Software Mansion), pre-1.0. **Good choice for the WebGPU compute add-ons**; not yet for the baseline. |
| **regl** | 2.1.1 | Nov 2024 | MIT | 42 KB gz | WebGL1 only (benchmark) | No WebGL2; avoid. |
| **picogl** | 0.17.9 | Jun 2022 | MIT | — | WebGL2 | Unmaintained; avoid. |
| **gpu.js** | 2.24.1 | Sep 2026 | MIT | — | WebGL | GPGPU kernels from JS; not designed for image pipelines; avoid. |

---

## 2. Camera, image and video pipeline

- **Live camera**: `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } })` → `<video playsinline muted autoplay>` (iOS needs `playsinline` + `muted`). Drive rendering with `video.requestVideoFrameCallback` so you upload each new frame exactly once, instead of polling at rAF rate.
- **Upload**: WebGL2 `texImage2D(video)` (or `texSubImage2D` into a fixed texture). Use `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` and decode sRGB → linear in the first pass (catalog stage 0). WebGPU: `importExternalTexture` (zero-copy) each frame.
- **Stills**: `createImageBitmap(file, { imageOrientation: 'from-image', colorSpaceConversion: 'none' })` handles EXIF rotation off the main thread.
- **Field of view**: the catalog works in degrees (`px_per_deg = width_px / camera_hfov_deg`). Read `FocalLengthIn35mmFormat` with **exifr** 7.1.3 (MIT; stable but last release 2022) → `hfov = 2·atan(36 / (2·f35))`. For live camera there's no reliable FOV API; default to ~65–70° for phone main cameras and expose a slider.
- **Off-main-thread**: `OffscreenCanvas` + worker works for both WebGL2 and WebGPU; `VideoFrame` is transferable. Worth it once the UI gets busy.
- **Recording**: `canvas.captureStream()` + `MediaRecorder` is the 20-line option. For proper MP4 export, **Mediabunny** 1.66 (MPL-2.0, published 24 Nov 2026) wraps WebCodecs muxing/encoding. MPL-2.0 is file-level copyleft: fine to use unmodified in a closed app.
- **HDR / wide gamut**: canvases can be `display-p3`; for v1, keep sRGB in/out and linear internally.

---

## 3. Existing vision-simulation work worth reusing

### 3.1 Colour (dichromacy)

- **Machado, Oliveira & Fernandes 2009** ([project page](https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html)): precomputed 3×3 RGB matrices for protan/deutan/tritan at severities 0.0–1.0 in 0.1 steps (1.0 = dichromacy), interpolated linearly between steps; one matrix multiply per pixel. The page notes a typo in Eqs. 17–18 but says the published matrices are correct. No licence stated for the table: cite it; numbers are facts, but confirm before redistributing the table verbatim.
- **Viénot, Brettel & Mollon 1999** and **Brettel 1997**: the other standard models. Brettel uses two half-planes and is the most accurate for full dichromats. All three model a *human* deuteranope/protanope.
- **For dogs**, the catalog (§1.4–1.5) derives the matrix from dog cone fundamentals (λmax ≈ 429 and 555 nm). That is the right approach; use Machado deuteranopia only as a sanity check. The human models assume human L/M peak spacing and luminance weighting, which dogs don't share.
- Reference implementations: [ndesmic/cvd-sim](https://github.com/ndesmic/cvd-sim) (SVG/JS/GLSL/WGSL; no licence shown, so read, don't copy), DaltonLens write-ups (well-known reference comparing the models; not re-fetched today).

### 3.2 Animal and dog vision projects

| Project | What | Licence | Reuse |
|---|---|---|---|
| [chengwq95/cat-dog-vision-simulator](https://github.com/chengwq95/cat-dog-vision-simulator) | Three.js r128 single-file 3D house; full-screen shader with dichromatic colour, depth blur, wide-angle warp, night gain, grain | MIT | Most reusable code found; a useful reference for the 3D/wide-FOV mode. Not research-grade (no cited matrices). |
| [bartosjiri/dogvision](https://github.com/bartosjiri/dogvision) | SvelteKit colour-only dog filter, after András Péter's "Dog Vision" | none shown | Don't copy |
| [loplex/dog-vision](https://github.com/loplex/dog-vision) | Dog + 17 mammals, camera/photo/video | none shown | Don't copy |
| [mmichal9/Animal_Vision_Simulator](https://github.com/mmichal9/Animal_Vision_Simulator) | Android camera filters from Shadertoy | Apache-2.0 | Method undocumented |
| **AcuityView** (Caves & Johnsen 2017, [page](https://caves-lab.eemb.ucsb.edu/tools/acuity-view)) | R package: FFT → multiply by MTF for acuity in cycles/degree at a viewing distance → inverse FFT. Also in **micaToolbox/QCPA** (ImageJ) and **pavo** (R) | check CRAN DESCRIPTION | **Method** is the scientific reference for our acuity stage. A Gaussian with matching cut-off is a close, much cheaper real-time stand-in; validate against AcuityView offline. |
| **OpenVisSim** (Jones et al. 2020, [paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC7064490), [repo](https://github.com/git-iason/OpenVisSim)) | Unity gaze-contingent sim of glaucoma, AMD, diabetic retinopathy etc. using per-pixel blur maps from perimetry | GPL-3.0; marked deprecated (2021) | Technique reference only for field-loss masks (catalog stage 9). |

Nothing found combines breed/age/condition parameters. Doggo's parameter model from the catalog is the novel part.

---

## 4. Techniques for each pipeline stage

Mapped to catalog §S3 stages. All run as full-screen fragment passes on WebGL2; ★ marks where WebGPU compute adds something.

| Stage | Technique | Notes |
|---|---|---|
| 0, 12 sRGB ↔ linear | Exact piecewise sRGB in shader, RGBA16F intermediate targets | `EXT_color_buffer_float` (or `_half_float`) is near-universal on WebGL2; fall back to RGBA8 + dithering. |
| 1 Geometry | Fisheye/equirect reprojection in a fragment shader; nose silhouette as an SDF mask | Real 3D only needs three.js if you go to a walk-around mode. |
| 2, 3, 9 Masks (lids, corneal opacities, scotomas, tunnel vision) | Procedural SDF/noise masks, or small artist textures; combine by `min` (field) and multiply (transmission) | Blur the mask, not the image, for out-of-focus occluders: cheap and matches optics. |
| 3, 5 Haze / scatter (corneal edema, cataract, nuclear sclerosis) | `out = T·img + (1−T)·blur_wide(img)` plus additive veil from a heavily blurred luminance | Wide blur from a mip pyramid (below). Cap additive haze at 0.95 per catalog. |
| 4, 10 Glare / bloom / halos | **Dual-Kawase or downsample/upsample bloom pyramid** (the Call of Duty / Unreal "physically based bloom" style): 5–7 mips, ~13-tap down, 9-tap tent up | Cheap, stable on mobile. Halos: ring kernel added at one mip level. ★ FFT convolution with a measured or analytic PSF (luma.gl has a WebGPU FFT bloom to learn from) for a physically shaped glare. |
| 6 Defocus / acuity | Separable Gaussian (two passes) at fixed σ; quadrature-summed σ from refraction + base acuity | At σ > ~8 px, blur a downsampled copy instead (cost stays flat). Bokeh shape is irrelevant for an eye with small pupil; Gaussian is fine. |
| 8 Spatially varying blur (visual streak vs area centralis) | **Mip-pyramid lerp**: build a Gaussian pyramid once, then per pixel sample `textureLod` at `lod = log2(σ(x,y)/σ0)` | Kraus & Strengert's pyramidal method ([EG 2007](https://www.cs.cit.tum.de/cg/research/publications/2007/depth-of-field-rendering-by-pyramidal-image-processing/)) is the reference; plain trilinear mip sampling has blocky artefacts, so use a proper Gaussian pyramid (or 3×3 tent upsampling) rather than `generateMipmap`. This is the single most important technique for the dog-specific look. |
| 7 Colour (dichromacy, rod/mesopic mix) | 3×3 matrices in linear RGB; `mix(T_dog·rgb, rod·rgb, m)` | Pure ALU, negligible cost. |
| 8 CSF thresholding | Band-pass via differences of pyramid levels (Laplacian pyramid), attenuate each band by a CSF gain | Same pyramid as above; dog CSF shape is Speculative per catalog. |
| 10 Noise | Luminance-dependent Poisson-like noise from a blue-noise texture, offset per frame | Blue noise avoids the "TV static" look; animate with a golden-ratio offset. |
| 10 Adaptation / auto-exposure | Average log-luminance from the smallest mip; ★ compute histogram on WebGPU | Smooth over time (stage 11). |
| 11 Temporal | Ping-pong previous-frame texture for rod smoothing and pupil/dark-adaptation lag; floaters as a few sprite quads | `requestVideoFrameCallback` gives real frame times for time constants. |

**Performance budget**: at 1280×720 on a mid-range phone, a pyramid (~1.33× pixels total), ~4 full-res passes and ~10 small mip passes fits easily in 60 fps on WebGL2. Rendering internally at 0.5–0.75× resolution is invisible here because the dog image is blurred anyway; this is the biggest single performance lever.

**Shader libraries**: LYGIA (`lygia` 1.4.1) has good blur/colour/SDF functions in GLSL and WGSL, but its **Prosperity licence permits only non-commercial use** without a paid patron licence. Read it for ideas; write our own. `glslify` (MIT) is stale (Dec 2024); prefer `vite-plugin-glsl` 1.6.4 (MIT, active) for includes.

---

## 5. On-device ML for the eye-photo detector (future)

### 5.1 Runtimes

| Runtime | Version (25 Nov 2026) | Licence | Size (measured) | Backends | Fit |
|---|---|---|---|---|---|
| **ONNX Runtime Web** | 1.31.1 (12 Nov 2026) | MIT | JS `ort.webgpu.min.mjs` 21 KB gz; WASM 3.7 MB gz (CPU) / 6.7 MB gz (JSEP, WebGPU-capable) | WebGPU, WASM (SIMD+threads), WebNN, WebGL (legacy) | **Recommended.** Takes any PyTorch export; WASM supports all ONNX ops, GPU EPs a subset ([PkgPulse](https://www.pkgpulse.com/guides/transformersjs-vs-onnx-runtime-web-2026)). |
| **Transformers.js** | 4.3.2 (latest tag; 4.4.0-next.1 pre-release) | Apache-2.0 | 124 KB gz JS + the ORT WASM it uses | WebGPU (`device: 'webgpu'`), WASM default | Built on ORT Web. Great for **prototyping** with Hub models: zero-shot image classification (CLIP/SigLIP), detection, segmentation, feature extraction. v4 brought a new WebGPU runtime co-developed with the ORT team ([Groundy](https://groundy.com/articles/transformers-js-v4-moves-transformer-inference-into-the-browser/)). |
| **LiteRT.js** (`@litertjs/core`) | 2.6.0 (22 Oct 2026) | Apache-2.0 | WASM ~3.0 MB gz | XNNPACK (CPU, WASM), ML Drift (WebGPU), WebNN (experimental) | Google's successor to TF.js for running models, released 9 Jul 2026; runs `.tflite`; claims 5–60× over CPU baselines ([ITmedia](https://atmarkit.itmedia.co.jp/ait/articles/2608/18/news049.html)). Manual fallback, float32/int32 I/O only ([Vucense](https://vucense.com/dev-corner/litert-js-google-web-ai-inference-2026/)). Good if you train in TF/Keras or want Google's mobile path too. |
| **MediaPipe Tasks Vision** | 1.2.3 (22 Nov 2026) | Apache-2.0 | 43 KB gz JS + 4.0 MB gz WASM | CPU / GPU delegate | Ready-made tasks (face/hand/pose landmarkers, image classifier/segmenter/embedder, interactive segmenter, object detector) ([README](https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/README.md)). **Face/iris landmarkers are trained on human faces and won't localise dog eyes.** The **Interactive Segmenter** (tap a point → mask) is useful as a *UI aid*: the user taps the eye, we get a mask to crop. Custom classifiers/detectors via MediaPipe Model Maker `.tflite`. |
| **TensorFlow.js** | 4.22.0 (Jan 2025; 4.23 RC) | Apache-2.0 | — | WebGL, WebGPU, WASM | No stable release in ~22 months; Google now positions LiteRT.js as its evolution. Don't start new work on it. |

All of them need a WASM fallback on iOS for reliability; Nearform reports iOS killing tabs that load large models ([Nearform](https://nearform.com/digital-community/web-ai-runtimes-five-ways-to-run-a-language-model-in-the-browser/)). Keep vision models small (≤20 MB, ideally int8/fp16 ≤ 10 MB).

### 5.2 Model approach

A two-stage design fits the catalog's detector → shader JSON schema (Part III):

1. **Eye localisation**: a small detector trained on dog-eye boxes, or the MediaPipe Interactive Segmenter with a user tap. Licence-safe detector families: **YOLOX** or **RT-DETR / D-FINE** (Apache-2.0) exported to ONNX. **Ultralytics YOLOv8/11 are AGPL-3.0**, which would force the whole web app's source open (or a paid licence).
2. **Condition heads**: a MobileNetV3/EfficientNet-Lite or small ViT classifier (multi-label: cataract, nuclear sclerosis, corneal opacity, cherry eye, etc.), plus optionally a U-Net-style segmenter for opacity extent and location. Output maps to shader parameters (opacity strength, position on cornea → field position).
3. **Prototyping without data**: zero-shot CLIP/SigLIP via Transformers.js gives a rough baseline, but expect it to be weak on veterinary conditions.

### 5.3 Evidence and data (thin)

- MobileNetV2 at 128×128 on 5 eye classes (glaucoma, cherry eye, iris atrophy, conjunctivitis, cataract) + 4 skin classes: ~86% validation accuracy, 1,223 Kaggle images with *visually inferred* labels; inference ran server-side ([Open Vet J 2026, PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13314084/)). Shows feasibility, not clinical validity.
- U-Net + ResNet34 segmentation of corneal edema, episcleral congestion, epiphora, cherry eye on 145 clinic images: mean IoU ~67% ([Heliyon 2024](https://www.researchgate.net/publication/384230369_Diagnosis_of_ophthalmologic_diseases_in_canines_based_on_images_using_neural_networks_for_image_segmentation)).
- Other 2025–26 work exists (YOLOv11 + autoencoder canine eye disease, ACM 2025; canine cataract clustering, Springer 2026; ultrasound cataract classification, *Animals* 2025) but I couldn't read the full texts.
- **No well-licensed public canine eye dataset was found.** Korea's AI Hub has a large pet eye-disease image set (from memory, not re-verified today; access is restricted and licence terms need checking). Plan on partnering with a veterinary ophthalmology clinic for labelled data.

---

## 6. Recommended stack, with reasoning

1. **Core renderer: WebGL2 + twgl.js, one fragment shader per catalog stage, RGBA16F ping-pong targets and a shared Gaussian pyramid.** The work is image-space and the target is phones; WebGL2 reaches every device, twgl removes boilerplate for ~7 KB, and nothing locks us into an engine. This also matches what the prototype thread is building, so it can grow into the product.
2. **Structure for a second backend.** Keep each stage's maths in small, backend-neutral functions and the parameters in one typed uniform block (matching the catalog's JSON schema). That makes a later WGSL port (by hand or via TypeGPU) mechanical.
3. **WebGPU as an enhancement** (TypeGPU 0.12, MIT): FFT-based physically shaped glare/halos and GPU histograms for adaptation, enabled when `navigator.gpu.requestAdapter()` returns an adapter. Revisit making WebGPU primary when Firefox Android ships it.
4. **Switch to three.js r187 (WebGPURenderer + TSL RenderPipeline) only if** we add an immersive 3D mode (walk-around scene, true wide-FOV reprojection, binocular overlap). TSL then gives one shader source for both backends, at ~0.25–0.5 MB gz and an "experimental" renderer.
5. **Media**: getUserMedia + requestVideoFrameCallback; createImageBitmap for photos; exifr for FOV; MediaRecorder now, Mediabunny for MP4 export.
6. **ML later**: PyTorch → ONNX → **ONNX Runtime Web** (WebGPU, WASM fallback), Apache/MIT-licensed model families only; Transformers.js for early zero-shot experiments; MediaPipe Interactive Segmenter as a tap-to-select-eye helper. Load models lazily so the simulator itself stays under ~100 KB of JS.
7. **Science references, not code**: Machado 2009 / Brettel / Viénot as cross-checks for the colour stage; AcuityView (FFT × MTF) as the offline ground truth for the acuity stage; OpenVisSim for field-loss masks. Re-implement; don't copy unlicensed code; avoid LYGIA and Ultralytics licences.

### Open questions

- Is a 3D "walk as a dog" mode in scope? It is the one thing that would change the core recommendation (to three.js TSL).
- Commercial or non-commercial? It affects LYGIA, Ultralytics and any dataset terms.
- Should the app be installable (PWA) or wrapped natively later? If native, LiteRT (TFLite) shares models between web and mobile; ONNX Runtime also has mobile builds.

---

## Sources

- gpuweb Implementation Status: https://github.com/gpuweb/gpuweb/wiki/Implementation-Status
- WebGPU adoption 2026: https://enterno.io/en/s/research-webgpu-adoption-browsers-2026 ; https://webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/
- MDN importExternalTexture: https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/importExternalTexture
- WebKit 281680: https://bugs.webkit.org/show_bug.cgi?id=281680 ; Mozilla 1827116: https://bugzilla.mozilla.org/show_bug.cgi?id=1827116
- three.js WebGPURenderer manual: https://threejs.org/manual/pages/webgpurenderer ; post-processing: https://threejs.org/manual/en/webgpu-postprocessing ; r183 RenderPipeline: https://app.cinevva.com/news/2026-03-18-threejs-r183-render-pipeline ; 2026 changes: https://www.utsubo.com/blog/threejs-2026-what-changed
- TypeGPU 0.12: https://docs.swmansion.com/TypeGPU/blog/typegpu-012/
- OGL README: https://raw.githubusercontent.com/oframe/ogl/master/README.md ; regl README: https://raw.githubusercontent.com/regl-project/regl/main/README.md
- WebGL library size benchmark: https://awesome.ecosyste.ms/projects/github.com%2Fjsulpis%2Fwebgl-libs-comparison
- PixiJS filters guide: https://pixijs.com/8.x/guides/components/filters.md ; pixi-filters releases: https://www.github.com/pixijs/filters/releases
- pmndrs/postprocessing: https://github.com/pmndrs/postprocessing
- luma.gl shader passes: https://luma.gl/docs/api-reference/shadertools/shader-passes/bloom
- Kraus & Strengert 2007 pyramidal DOF: https://www.cs.cit.tum.de/cg/research/publications/2007/depth-of-field-rendering-by-pyramidal-image-processing/
- Machado 2009 CVD simulation: https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
- ndesmic/cvd-sim: https://github.com/ndesmic/cvd-sim
- AcuityView: https://caves-lab.eemb.ucsb.edu/tools/acuity-view
- OpenVisSim: https://github.com/git-iason/OpenVisSim ; https://pmc.ncbi.nlm.nih.gov/articles/PMC7064490
- Dog/animal vision repos: https://github.com/chengwq95/cat-dog-vision-simulator ; https://github.com/bartosjiri/dogvision ; https://github.com/loplex/dog-vision ; https://github.com/mmichal9/Animal_Vision_Simulator
- ORT Web vs Transformers.js: https://www.pkgpulse.com/guides/transformersjs-vs-onnx-runtime-web-2026
- Transformers.js v4: https://groundy.com/articles/transformers-js-v4-moves-transformer-inference-into-the-browser/
- Web AI runtimes overview: https://nearform.com/digital-community/web-ai-runtimes-five-ways-to-run-a-language-model-in-the-browser/
- LiteRT.js: https://vucense.com/dev-corner/litert-js-google-web-ai-inference-2026/ ; https://atmarkit.itmedia.co.jp/ait/articles/2608/18/news049.html ; https://github.com/google-ai-edge/LiteRT
- MediaPipe Tasks Vision: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/README.md ; https://developers.google.com/edge/mediapipe/solutions/vision/interactive_segmenter/web_js
- Canine eye ML: https://pmc.ncbi.nlm.nih.gov/articles/PMC13314084/ ; https://www.researchgate.net/publication/384230369_Diagnosis_of_ophthalmologic_diseases_in_canines_based_on_images_using_neural_networks_for_image_segmentation
- npm registry (versions, licences, publish dates) and published tarballs (sizes), read 25 Nov 2026.
