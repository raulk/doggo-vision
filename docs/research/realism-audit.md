# Realism audit: "Senior, 15" presets

Audit of the simulator at commit `66d8de8` on `main`, which includes the build thread's corneal realism pass. It covers the author's dog: the "Senior, 15: both eyes" preset and the two per-eye presets. No code was changed. The mock-up of the proposed values is a scratch copy (`realism-audit/proposed.html`, not kept in the repo; its values landed in commit `e574629`).

Confidence labels: **Measured** = I measured it on the simulator. **Established** / **Probable** / **Speculative** = how solid the science is.

## 1. Bottom line

Measured on the current build, both eyes are far too blurry. Neither is too foggy overall. The fog is spread the wrong way, though, and several effects are counted two or three times.

| | Adult Labrador (control) | Clearer right eye | Cloudy left eye | Both eyes |
|---|---|---|---|---|
| Resolution limit now (grating test, Measured) | 6.5 cpd | **1.3 cpd** | **1.1 cpd** | 1.3 cpd |
| What a 15-year-old dog with these findings plausibly has | 6–12 cpd | **4.5–6 cpd** | **3–4.5 cpd** | ≈ clearer eye |
| Proposed mock-up (Measured) | 6.5 | 5.0 | 2.8 | 4.6 |

At 1.3 cpd, a human would be at about 20/450, close to "counting fingers". A dog that sees that badly cannot follow a thrown toy across a room. The renders of his own living room show it (those renders are not published). In the current version the furniture dissolves. In the proposed version the scene stays readable but looks veiled and soft, which matches a grade-2 corneal haze plus an old lens.

The two eyes also render almost identically, even though the photos show very different corneas. That's because shared age terms (lens blur, an age-cataract term, contrast cuts) swamp the per-eye differences.

## 2. What the photos show, and how it maps to parameters

From the seven photos (EXIF data was stripped on upload, so the camera settings can't be used):

- **Cloudy eye (left):** diffuse grey-blue stromal haze over most of the cornea, with a few small dark pigment dots near the centre. The iris and pupil are still visible through it. That puts the haze at about grade 2 on the Fantes scale (iris detail mildly obscured), not grade 3–4. No visible vascular ingrowth and no mucus discharge.
- **Clearer eye (right):** a mostly transparent cornea with a few small white focal opacities (scars), no visible pigment and no diffuse haze.
- **Both eyes:** a blue-grey lens sheen in the front-on photo, consistent with nuclear sclerosis. Eyes are wide open in every photo. There is no sign of squint.

| Parameter | Now | Proposed | Why |
|---|---|---|---|
| Lid squint, OS / OD | 0.35 / 0.25 | **0 / 0** (bright-light squint ≤ 0.1, only if he squints outdoors) | Eyes are wide open in every photo. A squint should come from observation, not from the diagnosis. |
| Mucus, OS / OD | 0.5 / 0.35 | **0 / 0** | No visible discharge. Turn it on only on days he has some. |
| Pigment, OS | 0.35 "diffuse" | **small central dots: luminance × 0.9, neutral** | Pigment absorbs light. It doesn't scatter it. A few dots covering about 10% of the pupil dim the image by about 10%. They don't tint or blur it. |
| Pigment, OD | 0.15 "temporal" (adds a field wedge) | **0** | The photos show white scars in this eye, not pigment. The wedge occluder should go. |
| Corneal scar, OS / OD | 0.55 / 0.15 | keep as the input, but drive **straylight** (section 3.2), not blur and contrast cuts | |
| Nuclear sclerosis | 0.5 / 0.45, plus age NS 1.0 | refraction −0.5 to −1 D, straylight +0.1 log, lens yellowing; **no blur term** | See 3.3 |
| Age cataract term (`catAge` 0.47) | on | **off for this dog** | The vet says it isn't cataract. This term is a population risk, not a finding. |

## 3. Prioritised changes

### P1. Calibrate blur to a target acuity, not to stacked "fraction" terms (largest error)

**What's wrong (Measured).** Static blur for the clearer eye is 0.27°: 0.17° from `catAge`, 0.14° from `nsC`, 0.06° from age NS, 0.03° from scars. Together with the baseline that totals about 1.4 cpd before contrast, haze and CSF are applied. The tear film then adds 0.12–0.18° more.

**What's physically correct.**
- Nuclear sclerosis barely blurs. It changes the lens's refractive index (a mild myopic shift) and yellows it. Veterinary consensus is that it causes little visual loss (**Established**). The 2024 study of 229 eyes quantifies the refractive shift (I couldn't open the full text, so that number is unverified).
- A grade-2 corneal haze in humans typically costs about 0.2–0.3 logMAR (**Probable**, from post-PRK haze grading).
- Dry eye adds about 0.06 logMAR on average over a 20 s blink-free interval, and more near its end (FVA 0.11 vs 0.05 logMAR; PMC10068140, **Established** in humans).

**How to implement.**
1. Express each eye's optical state as a target acuity, then derive the blur width from it: `σ_total = 0.389 / cpd_target` and `blurG = √(σ_total² − σ_baseline²)`. Use **5.5 cpd for the clearer eye and 4 cpd for the cloudy eye**, from an 8 cpd adult baseline.
2. Remove `catAge` from blur when the profile says "not cataract", and remove the `nsC` blur bucket.
3. Use the grating probe below as the regression test. Each preset must land within ±20% of its target.

### P2. Model fog as straylight with a 1/θ² spread, not as a uniform mix plus contrast cuts

**What's wrong (Measured, point-light test).** The current eye spreads 4–10× too much light into 0.5–8° around a light, from the Gaussian blur and bloom. Beyond that it adds nothing, because the haze is a mix toward the *image mean*, which is near zero in a dark scene. The core of a small light keeps only 10% of its energy (it should keep 40–70%). Separate contrast multipliers (×0.61 clearer, ×0.53 cloudy) then cut contrast again, on top of the haze, bloom and veil. That counts the same scattered light three times.

**What's physically correct.** Light scattered in the eye follows the CIE 2002 glare spread function. Over 1–30° its tail is roughly `L_veil/E = s/θ²`, and the straylight parameter `s` rises with age (**Established**: CIE 146:2002; van den Berg). Normal young eyes have log(s) of about 0.9 and scatter about 10% of the light. Straylight is stable until the 40s, rises about 0.15 log per decade, and doubles by 65. Pre-surgery cataract eyes aged 80–90 sit at about log(s) 1.57 (Łabuz 2015).

Proposed values (**Speculative** for dogs, using a 15-year-old dog as roughly an 80-year-old human):

| Eye | log(s) | Scattered fraction η = 1 − exp(−0.0086·s) |
|---|---|---|
| Clearer (age + nuclear sclerosis + small scars) | 1.45 | **0.22** |
| Cloudy (+ grade-2 stromal haze) | 1.75–1.85 | **0.40–0.45** |
| Either eye with the tear film broken up | +0.05–0.1 | +0.03–0.06 |

**How to implement.** A 1/θ² spread carries equal energy per octave of radius, so a **sum of pyramid levels with equal weights** reproduces it. I checked this: with η = 0.22 the mock-up matches `s/θ²` within about 25% at 1°, 2° and 4°.

```glsl
// straylight: equal weight per octave ≈ s/θ² between ~0.25° and the frame size
vec3 v = vec3(0.0); float n = 0.0;
for(int k = 3; k < 13; k++){ float fk = float(k); if(fk > uLevels - 1.0) break;
  vec4 t = textureLod(uPyr, uv, fk); v += t.rgb*(1.0 + t.a*uAS); n += 1.0; }
v = mix(v/max(n, 1.0), meanOutside, uOutFrac);  // light from outside the photo
c = mix(c, v, uEta);                            // energy-conserving
```

Then delete the haze mix, the optical `contrast` multipliers (keep about ×0.85 for retinal and neural ageing; de Rivera 2005 found aged beagles have raised contrast thresholds), `bloom`, and the scar/KCS factors on `veil`. Fit the level range to `ppd` so the kernel is in degrees, not pixels.

### P3. Glare needs real highlight energy

Night scenes are where straylight matters most to him, and there it depends on how bright the lamps really are. A street lamp is about 10³–10⁴ times brighter than the road, but an 8-bit photo clips it at 1. The pseudo-HDR "highlight energy" term should be calibrated so that clipped lamps get a plausible ratio. Better still, read the HDR gain map that iPhone photos carry (ISO 21496-1 / Apple gain map) when it's present. For video and camera input, estimate the scene luminance from the exposure: `L ≈ 12.5·N²/(t·ISO)` cd/m². That also sets `logL` automatically instead of leaving it to a slider.

### P4. Keep white white: chromatic renormalisation for lens yellowing and pigment

**What's wrong.** Lens yellowing (blue × 0.81) plus pigment warmth turn every senior render sepia (Measured: white walls render cream).

**What's physically correct.** Over months, the visual system renormalises to its own lens. Older humans don't see the world yellow, and the shift reverses gradually after cataract surgery (Delahunt, Webster & Werner 2004; **Established** in humans, **Probable** for dogs). What remains is slightly less blue–yellow contrast, plus extra noise for dim blue light.

**How to implement.** Apply the yellowing as a filter on the S-cone signal, then divide by the filtered response to white (von Kries in dog cone space). This keeps neutral surfaces neutral and reduces the opponent channel's gain by the same factor.

### P5. Tear film: a stable phase, then degradation; mostly straylight, a little blur

**What's wrong.** Degradation starts right after each blink. The maximum added blur, 0.12–0.18°, is 3–4× his baseline blur. The new wandering double image moves up to 0.5°, which is 10× the dog's resolution limit.

**What's physically correct.** After a blink the film levels out within about 1–2 s and stays stable until it breaks up. After that, scatter (OSI) and aberrations rise. In human dry eye, OSI roughly doubles (1.53 vs 0.73) and acuity drops by about 0.06 logMAR on average (PMC10068140). The cornea sits at the pupil, so break-up changes the PSF for the whole view. It doesn't make local wobbles.

**How to implement.** Hold the film clear from 0.5 s after a blink until `tbu`, then ramp over 2–4 s. At full dryness:
- add η +0.05;
- scale `σ_total` by 10^0.1–0.15 (×1.25–1.4), in quadrature;
- replace the circling ghost with an asymmetric smear about 1–2 `σ_total` long, whose direction drifts slowly.

Get `tbu` and the blink interval from him (see section 5). Normal dog TBUT is about 20 s. KCS dogs are often under 10 s.

### P6. Refractive error from nuclear sclerosis, with the correct defocus kernel

Use about −0.5 to −1 D of lenticular myopia with about 0.5 D of accommodation left (**Probable**). Defocus blur is a disc the size of the pupil, so `σ ≈ 0.25·d_pupil·ΔD` rad (the code uses 0.35). For a myopic dog, distance matters: blur rises for objects beyond about 1–2 m, so a ball across the garden should be softer than his bowl. That needs a depth estimate from the source. Monocular depth from a single photo (the tech-stack doc lists options) would make this per-pixel. Until then, keep the global "object distance" control.

### P7. Contrast sensitivity: band-limited contrast, not one soft threshold

The catalog's own recommendation was a Laplacian-pyramid CSF (Peli 1990: local band-limited contrast thresholded per octave against the CSF at that frequency and eccentricity). The code uses one threshold on one band. Implement 5–6 octave bands. Use a dog CSF peaking at about 1–3 cpd (**Speculative**, as the catalog notes), with brightness discrimination tied to the dog Weber fraction of 0.22–0.27. Senior eyes raise all thresholds by about 0.1–0.2 log.

### P8. Noise in degrees, not pixels

Night noise is generated in 1.5-pixel cells, so zooming changes its grain. Generate it at the scale of rod pooling (about 0.1–0.2° near the centre, coarser in the periphery). Scale its amplitude with √(quantum catch): the square-root law already in the code is right.

### P9. Temporal response (lower priority)

A single EMA is fine for rods. The "motion salience" brightening is stylised. A sustained-plus-transient filter pair (difference of gamma impulse responses) would make motion pop out on its own. Senior flicker fusion of about 55–60 Hz has no visible effect on a 60 Hz display.

## 4. Automated checks to add (Playwright, already prototyped)

`realism-audit/probe.js` and `analyze.py` render two synthetic targets through any preset:

1. **Grating MTF:** sine gratings at 1–16 cpd, 50% contrast, with the field at 60 px/deg. The output modulation gives each preset's effective acuity. Assert it within ±20% of target: Labrador 8, clearer 5.5, cloudy 4.
2. **Glare spread:** a 0.5° light on black. Measure the radial profile at 0.5–16°. Assert it follows `s/θ²` for the preset's log(s), and that the core keeps ≥ (1 − η − blur loss). Read the float render target (`readPixels` on an RGBA16F/32F target), not a screenshot, because the tail beyond 8° is below 8-bit precision.

These make "realistic" testable. The current build fails both tests for his presets. The mock-up passes the glare test at 1–4° and comes within about 10–30% of the acuity targets.

## 5. Validating against him (cheap, and the strongest evidence available)

The vet can measure each item below directly. Each one maps to a parameter.

| Measurement | Sets |
|---|---|
| Schirmer tear test, per eye | KCS severity `s` |
| Fluorescein tear break-up time, per eye | `tbu` |
| Slit-lamp haze grade, per eye (0–4) | log(s) and η (table in P2) |
| Retinoscopy (refraction) | `refraction_D`, the nuclear sclerosis myopia |
| Menace and dazzle responses, per eye | sanity check that both eyes see |
| Treatment (cyclosporine or tacrolimus, artificial tears) | whether the dry phase is ever reached |

Things you can observe at home:

- **Blink rate:** count blinks for 2 minutes, a few times. That sets the blink interval.
- **Toy detection distance:** roll a mid-grey toy on the floor in daylight and at lamp-light. Note the farthest distance at which he orients to it, stationary vs moving. The simulator should put the toy's simulated contrast near threshold at about that distance.
- **Glare test:** does he hesitate walking toward a bright window, or toward a lamp at night? With η 0.4 in one eye, the model predicts he will, mostly on the left side.
- **Night maze:** furniture rearranged slightly. Does he bump into things at about 1 cd/m² (one dim lamp) but not in daylight? That separates optical loss from retinal ageing.

## 6. What I could not settle

- No dog straylight data exist. The log(s) values transfer human data to a 15-year-old dog as roughly an 80-year-old. They are labelled Speculative and should be tuned with the vet's haze grade.
- The 2024 dog nuclear sclerosis refraction paper was behind a captcha, so its exact dioptre value is not quoted.
- The photo EXIF was stripped, so the real luminance of his living room is unknown. I used 50 cd/m².

## Sources

- Lind O et al. (2017). High visual acuity revealed in dogs. *PLoS ONE*. 5.5–19.5 cpd at 43 cd/m²; 1.8–3.5 cpd at 0.0087 cd/m². https://pmc.ncbi.nlm.nih.gov/articles/PMC5716585
- CIE 146:2002 / CIE 147:2002, the glare spread function and its age and pigmentation dependence. https://cie.co.at/publications/cie-collection-glare-2002
- Łabuz G et al. (2015). Ocular straylight in the normal pseudophakic eye (phakic ageing: stable to the 40s, +0.15 log per decade, ×2 by 65; pre-surgery log(s) 1.57 at 80–90). https://repub.eur.nl/pub/102424/
- Franssen L, Coppens JE, van den Berg TJTP (2006). Compensation comparison method for straylight. *IOVS*. https://core.ac.uk/download/357629069.pdf
- Simultaneous real-time analysis of tear film optical quality dynamics and functional visual acuity in dry eye disease (OSI 1.53 vs 0.73; FVA 0.11 vs 0.05 logMAR). https://pmc.ncbi.nlm.nih.gov/articles/PMC10068140/
- Quantifying refractive error in companion dogs with and without nuclear sclerosis: 229 eyes from 118 dogs (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC10842750/ (not read; captcha)
- Cited from memory, not re-checked in this audit: IJspeert JK et al. (1993) on the foveal PSF with age, pupil and pigmentation; Peli E (1990) on contrast in complex images (*JOSA A*); Delahunt PB, Webster MA, Werner JS (2004) on long-term renormalisation of colour after cataract surgery; Fantes FE et al. (1990) on corneal haze grading; de Rivera C et al. (2005) on beagle contrast and age (catalog ref 11); Pongrácz P et al. (2017) on dog brightness discrimination.
