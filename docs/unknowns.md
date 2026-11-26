# What we don't know

This simulator is an estimate. This page lists where it rests on guesses, on human data, or on nothing at all, so nobody mistakes a render for a measurement. Each item says what the simulator does in the meantime and what would settle it.

The choices themselves, and their sources, are in the [decisions log](decisions.md).

## 1. No one knows what a dog sees

No dog can report its percept. Every render here is a model of the *optics and retina* of the eye, fed with measurements where they exist. Even a perfect optical model would not show what the dog's brain makes of the signal. A dog with poor acuity may still use smell, hearing, motion and memory of its home so well that it seems to see better than the render suggests.

## 2. Numbers taken from human data

These values have no dog measurement. They come from human studies and are transferred to dogs by analogy. All are **Speculative** for dogs.

| What | Value used | Human source | Why it might not transfer |
|---|---|---|---|
| How straylight grows with age | log(s) from 0.9, +0.13 per "human decade" after 40, with a dog at age/lifespan `a` treated as a human of 75·a years | CIE 146:2002; Łabuz et al. 2015 | Dog and human lenses and corneas age differently. The age mapping is a convenience, not a finding. **No dog straylight data exist.** |
| How much corneal haze scatters | +0.7 log(s) per unit of scar severity | Human cataract and haze straylight | Dog corneas are thicker and haze is graded differently |
| How much haze costs in acuity | 0.15 logMAR per unit of scar severity | Post-PRK haze grading (Fantes et al. 1990, cited from memory) | Grading scales and the stromal response differ |
| Tear-film degradation | Blur ×1.36 and η +0.05 at full dryness (severity 0.6) | Human dry eye: OSI 1.53 vs 0.73, acuity −0.06 logMAR (PMC10068140) | Dog tear-film composition and blink dynamics differ from humans |
| Colour renormalisation after lens yellowing | Whites stay white; blue–yellow gain reduced | Delahunt, Webster & Werner 2004 (cited from memory) | Shown only in humans |
| Optical and neural ageing | up to 0.11 logMAR | Engineering estimate | No longitudinal acuity data for senior dogs |
| Refraction shift from nuclear sclerosis | about −0.5 D | Veterinary teaching; the 2024 dog study (PMC10842750) was not read in full | We could not read the measured value |

The acuity **targets** for the senior presets (clearer eye 4.5–6 cpd, cloudy eye 3–4.5 cpd) are built from these numbers. The tests confirm that the simulator hits those targets. They cannot confirm that the targets are right.

## 3. Clinical inputs needed to calibrate an individual senior dog

The "Senior, 15" presets use working estimates for a representative senior KCS/nuclear-sclerosis case. For any individual dog, these clinical measurements would replace guesses with data:

| Missing | Would set | Current guess |
|---|---|---|
| Slit-lamp haze grade, per eye (0–4) | log(s) and η for each eye | Grade 2 (cloudy left), about 0–1 (clearer right), illustrative estimate |
| Fluorescein tear break-up time, per eye | When the dry phase starts | 4 s (left), 6 s (right). Normal dogs are about 20 s, and KCS dogs are often under 10 s |
| Blink rate | Length of each tear cycle | One blink every 6 s |
| Schirmer tear test, per eye | Dry-eye severity | 0.6 (left), 0.4 (right) |
| Retinoscopy (refraction) | Myopic shift from nuclear sclerosis | about −0.5 D |
| Menace and dazzle responses, per eye | Sanity check that both eyes see | Assumed both see |
| Current treatment (cyclosporine, tacrolimus, artificial tears) | Whether the dry phase is ever reached | Assumed untreated between drops |
| Indoor room brightness | Scene luminance | 50 cd/m² indoors |

Simple behavioural checks can also sanity-check a preset (realism audit §5): detection distance for a rolled grey toy, hesitation near bright windows or lamps at night, and obstacle avoidance under one dim lamp.

## 4. How binocular blending is modelled

The "both eyes" view renders each eye separately, then mixes the two images **75 : 25 in favour of the clearer eye** inside the ±21° overlap zone. Outside it, each side shows only its own eye.

What is uncertain about this:

- **The 75% weight is an engineering choice.** It is a slider, not a measurement.
- **A pixel mix is not binocular vision.** The brain does not average two images. With equal eyes, binocular contrast sensitivity is about √2 better than one eye (binocular summation). With unequal eyes, the poorer eye can be ignored, or it can *lower* performance below the better eye (binocular inhibition). Human work on monocular blur and contrast loss shows both. These human results are cited from memory and were not re-checked. Nothing is known for dogs.
- **Which eye is "clearer" is decided by a crude rule:** the sum of condition severities. A better rule would use each eye's measured acuity and straylight.
- **The overlap width** comes from the skull-shape model (30–60° behaviourally, Miller & Murphy 1995). The per-breed value is Speculative.
- **A photo is narrower than a dog's field.** At the default 50° camera field, most of the picture sits inside the blended zone. The monocular crescents at the edges, where only the cloudy left eye sees on the left, are mostly off-screen.

## 5. Limits of validation

- **Software GPU only.** The regression tests run in headless Chromium with SwiftShader, a software WebGL. Real phone GPUs differ in precision, texture filtering and mipmap generation. **The presets have not been measured on a real iPhone or any hardware GPU.** Real-device testing is still outstanding.
- **Screenshots are 8-bit.** The far tail of the glare spread (beyond about 8°) is below 8-bit precision, so the straylight fraction is checked from the model's own value, not from pixels.
- **Only the fresh tear phase is tested.** In the dry phase (5.8 s after a blink), the cloudy eye measures 2.75 cpd. That is below its 3–4.5 cpd target and outside what the tests check. It may be right (dry eye should make it worse) or too strong.
- **Gratings are not scenes.** A sine-grating cutoff and a point-light falloff are two numbers. They do not check colour, night vision, motion, or how a whole scene looks.
- **The adult control is only loosely bound.** The Labrador preset measures 6.4 cpd against a wide 5.5–9 cpd range, because dog acuity varies widely between individuals (5.5–19.5 cpd in Lind et al. 2017).
- **Only the senior presets have been calibrated.** The other 20+ conditions use recipes from the catalog, with magnitudes that are almost all engineering estimates (catalog §S6.3). They have no measured targets and no tests.
- **No clinical or behavioural validation.** Nothing yet links the render to measured canine behaviour.

## 6. Gaps in the basic science

From the catalog (§S6), these hold for every preset:

1. No measured dog contrast-sensitivity curve. The "peak about 3 cpd, 2–3× worse than human" shape is inferred.
2. No direct dog absolute light threshold. Night gain is extrapolated from cats.
3. No perceptual data for any eye disease in dogs.
4. No primary source for visual-field size by skull type, or for refraction by breed.
5. No dog lens transmission data with age.
6. No dog figure for tapetum gain.
7. Stereo acuity and dark-adaptation time constants are unmeasured.
8. The colour matrix is model-derived and has not been checked against spectral rendering.

## 7. Research that could not be read

The research ran with automated access to PubMed and PMC partly blocked. Several classic papers are cited via reviews (marked "secondary" or `[S]` in the catalog), and some only from memory (listed in the audit's sources). The 2024 nuclear sclerosis refraction study was behind a captcha. Anyone checking this work should start with those.
