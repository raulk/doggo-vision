# Dog Vision Catalog: Science, Variation and Shader Parameters

Research phase for the Doggo project. Compiled 2026-11-25.

This catalog collects what is known, what can reasonably be inferred, and what is speculation about how dogs see, across breeds, ages and eye conditions. For each property it gives numbers where they exist, sources, a confidence level, and a way to simulate it as an image-shader effect. It also records which conditions show up in a macro photo of the eye, for the planned photo → shader feature.

**How it is organised**

- **Synthesis (this part).** Key facts, the one pipeline that the shader should follow, a single dog-profile → parameter model, the photo-detection outlook, and the biggest gaps.
- **Part I: Normal adult vision.** Colour, photoreceptors, tapetum, acuity, optics, contrast, retinal topography, field, depth, flicker, motion, adaptation.
- **Part II: Breed and age.** Skull type, refraction by breed, merle and pigment, breed disease risk, puppy development, senior changes, and a parameter model.
- **Part III: Eye conditions.** 30+ conditions, each with vision effect, shader recipe with a 0–1 severity, photo identifiability, confidence and sources. Ends with ML datasets and a detector → shader JSON schema.

Each part keeps its own reference list. Parts I–III were written by three separate research passes, so small overlaps exist; where they disagree, the synthesis below states which value to use.

> **Not a diagnosis.** A photo of the outside of the eye cannot measure tear production, eye pressure or retinal function. Anything the app detects must be shown as "possible visible sign, see a vet", and red-eye + cloudy cornea + dilated pupil should trigger an urgent-care message before any simulation. The shader output is an illustration, not a measured percept: no dog can report what it sees, and almost no perceptual data exist for diseased dogs.

---

## S1. Confidence key

| Label | Meaning |
|---|---|
| **Established** | Measured directly in peer-reviewed work or stated in a veterinary reference, and read during this research. |
| **Probable** | One good study, standard veterinary teaching, or a figure relayed by a reliable review whose original could not be opened. |
| **Speculative** | Extrapolation, human analogy or engineering estimate. Nearly all shader *magnitudes* for disease sit here. |

Citation tags inside the parts: "verified" / `[V]` means the source was read in this session; "secondary" means it came via a review; "unverified" means it could not be checked (PubMed and PMC blocked automated access during this research, so several classic papers are relayed through reviews).

---

## S2. The twelve facts that matter most for the shader

| # | Fact | Value | Confidence | Shader primitive |
|---|---|---|---|---|
| 1 | Dogs are dichromats | S cone ~429–435 nm, L cone ~555 nm, neutral point ~480 nm | Established | 3×3 colour matrix in linear RGB (derived matrix in Part I §1.5) |
| 2 | Not a human deuteranope | Neutral point 480 vs 505 nm; lens passes some UVA (λ50 = 335 nm) | Established | Use the dog-specific matrix, not a stock deuteranopia filter |
| 3 | Acuity is low | Typically 6–12 cpd (~20/75); best dogs ~19 cpd; human 30–60 | Established | Gaussian blur σ ≈ 0.389 / cutoff_cpd degrees ≈ 3 arcmin at 8 cpd |
| 4 | Worse brightness discrimination | Weber fraction 0.22–0.27 vs human 0.11 | Probable | Contrast quantisation / CSF threshold in a Laplacian pyramid |
| 5 | Rod-dominated retina + tapetum | ~3% cones; 23:1 rod:cone centrally; tapetum in upper fundus (lower field) | Established | Scotopic branch: rod luminance, gain, noise, tapetal veil in lower field |
| 6 | Night advantage is detection, not detail | 1.8–3.5 cpd at 0.0087 cd/m² vs human 5.9–9.9 | Probable | In the dark: brighter but much blurrier and noisier than human |
| 7 | Skull shape changes retinal layout | Long nose → horizontal visual streak; short nose → round area centralis (r = −0.795) | Established | Per-pixel blur map controlled by one "streak strength" s ∈ [0,1] |
| 8 | Wide field, small overlap | ~240° total, 30–60° binocular | Probable | Wide-FOV projection, binocular zone, nose silhouette mask |
| 9 | Weak focusing | Accommodation 2–3 D, near point ~33–50 cm; breed myopia (Rottweiler 64%, GSD 53% clinic sample) | Probable | Depth-dependent defocus + breed refractive offset |
| 10 | Faster flicker fusion | Cones ~70–80+ Hz; rods ~20 Hz | Established | Temporal low-pass only matters for video; 60 Hz screens may flicker for dogs |
| 11 | Ageing hits dim-light vision first | Owner-reported decline from ~2.5 yrs (dim) and ~4.3 yrs (bright); ERG −2.8%/yr photopic, −3.5%/yr scotopic (extrapolated) | Probable | Age gain penalties, stronger on the scotopic branch |
| 12 | Lens changes are near universal | Nuclear sclerosis after ~6 yrs (little vision effect); 50% have some cataract by 9.4 ± 3.3 yrs; all dogs >13.5 yrs have lens opacity | Established | Veiling glare, contrast loss, blur; scaled by age / lifespan |

---

## S3. Canonical shader pipeline

The three parts each proposed an order. They are reconciled here into one order that follows the path of light, then the retina, then time. Use this one.

| Stage | Pass | Driven by | Notes |
|---|---|---|---|
| 0 | Decode sRGB → linear; estimate scene luminance (metadata or a lux slider) | — | All spatial values in degrees: `px_per_deg = width_px / camera_hfov_deg` |
| 1 | **Geometry**: wide-FOV reprojection, binocular zone, nose silhouette, eye height | skull type | Optional for stills; important for immersive mode |
| 2 | **Lids and adnexa**: aperture masks (squint, ptosis, third eyelid, cherry eye), lashes | conditions | Heavily blurred because out of focus |
| 3 | **Tear film and cornea**: time-varying tear break-up blur (KCS), pigment/pannus/lipid occluders, edema haze + halos, ulcer warp | conditions, breed | Corneal location (x,y) maps to field location (−x,−y) |
| 4 | **Anterior chamber and iris**: hyphema/hypopyon tint and upper-field occluder; pupil size → glare (iris atrophy, merle, uveitis miosis) | age, coat, conditions | Glare ∝ (pupil/ref)² |
| 5 | **Lens**: nuclear sclerosis scatter, cataract haze/spokes/bloom, luxation ghost, optional slight blue cut | age/lifespan, conditions | Owners see a blue haze in NS; the dog does not. Do not tint blue |
| 6 | **Optics**: defocus PSF from refraction, accommodation and depth; base acuity Gaussian | breed, age | Combine blurs in quadrature |
| 7 | **Retina, colour**: dog dichromat matrix (photopic), rod luminance (scotopic), mesopic mix m | light level | `c = mix(T_dog·rgb, rod·rgb, m)` |
| 8 | **Retina, spatial**: topography blur map (streak vs area centralis), CSF thresholding | skull type | CSF shape is Speculative (no published dog CSF) |
| 9 | **Retina, disease masks**: tunnel vision (PRA, glaucoma), scotomas (CEA, dysplasia), curtain (detachment), global loss (SARDS) | conditions | Applied after optical blur so edges stay relatively crisp; masks combine by minimum |
| 10 | **Gain, glare and noise**: adaptation gain, tapetal veil (lower field), bloom, luminance-dependent noise | light, age, tapetum, pigment | Glare terms multiply (pigment × lens × pupil × brachycephalic) |
| 11 | **Temporal**: pupil and dark-adaptation dynamics, rod temporal smoothing, floaters/asteroid particles, motion salience | age, conditions | Video only |
| 12 | Encode linear → sRGB | — | — |

**Combination rules** (from Part III §8): transmissions multiply; additive haze capped at 0.95; blur σ adds in quadrature; field masks take the minimum; bloom and halos sum then clamp.

**Values to use where parts differ**
- Base acuity: use Part I's σ ≈ 3 arcmin (8 cpd) default, with a per-dog range of 2–5 arcmin, rising to ~9 arcmin in scotopic light. Part III's pixel-fraction value is a convenience for a ~120° image and gives roughly the same result.
- Night gain: Part I suggests 2–5×, Part III 1.5–3×. No dog measurement exists (the "3–5× less light" figure is extrapolated from cats). Expose it as a slider with default 2.5×.
- Visual field by skull type (200° / 240° / 270°): popular figures with no primary source found. Use as working values only.

---

## S4. Dog profile → shader parameters

The app should describe a dog as a small profile, then derive every parameter from it. Full formulas are in Part II, Part D and Part III §8; this is the shape.

```jsonc
{
  "profile": {
    "skull": "brachycephalic | mesocephalic | dolichocephalic" /* or cephalic index */,
    "breed": "pug",                    // disease risks, refraction preset, lifespan
    "coat": "normal | merle_Mm | merle_MM | dilute | white",
    "iris": {"OD": "brown", "OS": "blue"},
    "age_years": 9,
    "lifespan_years": 13,             // from breed table or bodyweight
    "conditions": {                    // from a vet, the owner, or the photo detector
      "cataract": {"s": 0.4, "stage": "immature"},
      "pigmentary_keratitis": {"s": 0.3, "origin": "medial"},
      "kcs": {"s": 0.5}
    }
  },
  "derived": {
    "a": "age / lifespan",                          // normalised age
    "streak_strength": "0 (pug) … 1 (sighthound)",
    "field_total_deg": "lerp(200, 270, s)",
    "binocular_overlap_deg": "lerp(60, 30, s)",
    "refraction_D": "breed preset ± noise",
    "accommodation_max_D": "2.5 falling with age",
    "nuclear_sclerosis": "smoothstep(0.45, 0.85, a)",
    "retina_gain_photopic": "1 − 0.028 per lifespan-scaled year",
    "retina_gain_scotopic": "1 − 0.035 per lifespan-scaled year",
    "glare_multiplier": "pigment × lens × pupil × brachy",
    "tapetum": "1 full, 0.88 small breed, 0 absent"
  }
}
```

**Presets worth shipping first** (all derived from the parts):

| Preset | What changes vs adult baseline |
|---|---|
| Puppy, 3 weeks | Eyes just open, heavy blur, low contrast; retina still maturing (adult-like ERG by ~7 weeks) |
| Puppy, 10 weeks | Near-adult optics; tapetum still blue (light-scatter tint is Speculative) |
| Adult Labrador, 4 yrs | Baseline: dichromat, 20/75, mesocephalic topography |
| Adult greyhound | Strong horizontal visual streak, wider field, narrower overlap |
| Adult pug | Area centralis, wider overlap, exposure glare ×1.2, likely mild pigmentary keratitis from the nasal side (present in 92% of UK pugs) |
| Myopic German shepherd | −1 to −2 D defocus at distance (magnitude Speculative) |
| Senior, 11 yrs medium breed | Nuclear sclerosis scatter, reduced accommodation, iris-atrophy glare, slower dark adaptation, scotopic gain ↓ |
| Double merle | Small eye, possible coloboma scotomas, low pigment glare; often blind/deaf (severity varies widely) |
| PRA progression | Night gain ↓ first, then tunnel vision closing, then blindness, often with secondary cataract |
| Diabetic cataract | Fast onset: ~50% by ~170 days, 75% by ~370 days after diabetes diagnosis |

---

## S5. What a macro photo of the eye can tell us

Only the front of the eye is visible from outside. Summary from Part III:

| Detectability | Conditions |
|---|---|
| **Good candidates** | Cataract (with flash), pigmentary keratitis (clock-hour score), corneal edema, pannus, lipid deposits, cherry eye, entropion/ectropion, conjunctivitis, tear staining, hyphema, iris cysts and iris atrophy (with flash), Horner syndrome (both eyes in frame) |
| **Partial: photo shows signs, vet test needed** | Nuclear sclerosis vs cataract (flash helps), KCS (discharge, dull cornea; Schirmer test needed), corneal ulcers (deep yes, superficial needs fluorescein), glaucoma (dilated pupil, red sclera, enlarged globe; pressure needs tonometry), uveitis, lens luxation, microphthalmia |
| **Not detectable from outside** | PRA (early), SARDS, collie eye anomaly, retinal dysplasia, optic neuritis. These need fundoscopy, ERG or DNA testing, so the app should take them as owner/vet input |

**Capture protocol** (recommended): one photo without flash, one with flash at 30–50 cm (the flash lights the tapetum: cataract blocks the reflection, nuclear sclerosis lets it through), one with both eyes in frame, and optionally a short video for tear-film and lens wobble.

**Published accuracy** on dog-eye photos is around 86% for 5-class classification on the Korean AI Hub dataset (~44k images), F1 0.85–0.87 for specific conditions, and >90% for corneal ulcer depth. Cataract vs nuclear sclerosis is the hardest pair, and real-world phone photos perform much worse than curated ones, so an image-quality gate should run first. The detector → condition → shader JSON schema is in Part III §8.

---

## S6. Biggest gaps and open questions

1. **No measured dog contrast sensitivity curve.** The "peak ~3 cpd, 2–3× worse than human" shape is inferred (Speculative).
2. **No direct dog absolute light threshold.** Night gain is extrapolated from cats.
3. **No perceptual data for any eye disease in dogs.** All disease magnitudes are engineering estimates from clinical descriptions and human analogues.
4. **Visual field by skull type** and **per-breed refraction diopters** lack primary sources.
5. **Lens yellowing with age** has no dog transmission data, so the blue cut is Speculative.
6. **Tapetum gain** has no dog figure; the one hint suggests it is modest.
7. **Stereo acuity and dark-adaptation time constants** are unmeasured beyond "rhodopsin regeneration takes over an hour".
8. **The colour matrix** is model-derived (Govardovskii templates fitted via CIE XYZ); validating against Stockman–Sharpe fundamentals or spectral rendering would tighten it.

**Suggested next steps for the build phase:** start with the adult baseline (stages 0, 6, 7, 8, 10) on still images, add the age/breed model, then layer conditions one primitive at a time using the Part III recipes, and keep every Speculative magnitude exposed as a tunable slider.

---


# Part I: Normal adult dog vision

Compiled 2026-11-25 by the `vision-baseline` research agent. This covers only normal adult dogs. Puppies, senior dogs and disease are out of scope.

**Confidence labels**
- **Established**: replicated, or measured directly in peer-reviewed work.
- **Probable**: a single good study, or a consistent indirect inference.
- **Speculative**: extrapolation or opinion.

**Verification labels**
- **verified**: I read the primary abstract or full text, or a full-text review quoting it.
- **secondary**: the number comes from a review citing the original, and I did not read the original.
- **unverified**: I could not confirm it.

**Shader notes.** All shader suggestions assume **linear-light sRGB**: decode the sRGB transfer function first and re-encode at the end. Every spatial parameter is given in **degrees of visual angle**. Convert with `px_per_deg = image_width_px / camera_hfov_deg`.

---

### 0. TL;DR parameter table

| Property | Dog value | Human reference | Confidence | Source |
|---|---|---|---|---|
| Cone classes | 2 (dichromat) | 3 | Established | Neitz, Geist & Jacobs 1989; Jacobs et al. 1993 |
| S-cone λmax | ~429 nm (behavioural); 430–435 nm (ERG) | ~420 nm | Established | Neitz 1989; Jacobs 1993 |
| L/M cone λmax | ~555 nm | M 530, L 558–560 nm | Established | same |
| Rod λmax | ~506–510 nm (508 nm by ERG) | ~496–498 nm | Established | Jacobs 1993; Kemp & Jacobson 1992; Parkes 1982 |
| Spectral neutral point | ~480 nm (band 475–485 nm) | Deuteranope ~505 nm | Established | Neitz 1989 via Miller & Murphy 1995 |
| Lens UV transmission | λ50 = 335 nm; 61% of UVA (315–400 nm) transmitted | Adult human lens blocks UV below ~400 nm | Established (optics); Probable (perceptual) | Douglas & Jeffery 2014 |
| Cone fraction | ~3% of photoreceptors overall; rod:cone ≈ 23:1 in area centralis, ≈ 41:1 in periphery | ~5% | Established | Peichl 1992 (secondary); Mowat et al. 2008 |
| S-cone share of cones | ~10–12% centrally, ~15–18% peripherally | ~5–10% | Established | Mowat 2008 |
| Peak cone density | 20–30k/mm² in area centralis; 64–212k/mm² in a tiny fovea-like "bouquet" | ~150–200k/mm² (fovea) | Established | Mowat 2008; Beltran et al. 2014 |
| Peak ganglion cell density | 6,400–14,400 /mm²; ~115,000 RGCs total | ~1.2 M optic nerve fibres | Established | Peichl 1992 |
| Photopic grating acuity | Typically ~6–12 cpd (Snellen ~20/50–20/100; "typical 20/75"); best individuals up to 19.5 cpd | 30–60 cpd | Established | Odom 1983; Murphy 1997; Lind et al. 2017; Miller & Murphy 1995 |
| Scotopic acuity (0.0087 cd/m²) | 1.8–3.5 cpd | 5.9–9.9 cpd | Probable (one study) | Lind et al. 2017 |
| Brightness discrimination (Weber fraction) | 0.22–0.27 | 0.11 | Probable | Pretterer et al. 2004 |
| Accommodation | ≤ 2–3 D (near point ~33–50 cm) | Up to 14 D in children | Probable | Miller & Murphy 1995 |
| Refraction | Mean ≈ emmetropic (−0.05 ± 1.36 D); breed myopia (Rottweiler 64%, German shepherd 53% clinic population) | — | Established | Murphy, Zadnik & Mannis 1992; Kubai et al. 2008 (secondary) |
| Total visual field | ~240° (behavioural); ~250° (morphological) | ~180–200° | Probable | Sherman & Wilson 1975; Walls, via Miller & Murphy |
| Binocular overlap | 30–60° (behavioural); 35–40° (RGC topography) | ~120–140° | Probable | Sherman & Wilson 1975; Peichl 1992 |
| Critical flicker fusion (cones) | ~70–80+ Hz (behavioural, beagles) | ~50–60 Hz (up to ~70 Hz) | Established | Coile, Pollitz & Smith 1989 |
| Rod flicker limit (ERG) | ~20 Hz | ~20 Hz | Probable | Aguirre & Rubin 1975; Aguirre 1978 |
| Motion vs stationary detection | Moving object recognised at 810–900 m; stationary only at ≤ 585 m (14 police dogs, 1936) | — | Probable (old study) | Walls 1942/1963, via Miller & Murphy 1995 |
| Pupil diameter (ambient ~220 lux) | Max 6.05–11.3 mm; min after flash 3.8–9.4 mm; constriction 10–38%; latency 0.11–0.30 s | ~2–8 mm | Established | Mills et al. 2022 |
| Tapetum | Cellulosum (zinc–cysteine rodlets, 9–20 cell layers); dorsal fundus, ~1/3 of fundus; 70% full-sized, 1.9% absent | None | Established | Ollivier 2004; Granar 2011; Miller & Murphy 1995 |
| Rhodopsin regeneration after bleach | > 1 h | ~30 min | Probable | Miller & Murphy 1995 citing Kemp & Jacobson 1992 / Parkes 1982 |

---

### 1. Colour vision

#### 1.1 Dichromacy and photopigments

- **Behavioural evidence (Established, verified abstract).** Neitz, Geist & Jacobs (1989) tested 3 dogs.
  - They used increment-threshold spectral sensitivity and colour-matching tests.
  - The data imply two cone classes peaking at about **429 nm** and **555 nm**, and the dogs behaved as dichromats.
  - Source: *Visual Neuroscience* 3:119–125. doi:10.1017/S0952523800004430. That DOI is the usual one for this paper, but the Cambridge page I read did not display it, so treat the DOI as unverified.
- **ERG flicker photometry (Established, verified abstract).** Jacobs, Deegan, Crognale & Fenwick (1993) found the same pigment set in dogs and three fox species.
  - The cones peak at about **555 nm** and **430–435 nm**, and the rods at about **508 nm**.
  - Source: *Vis Neurosci* 10:173–180. doi:10.1017/S0952523800003291.
- **Behavioural hue mapping (Established, secondary via Miller & Murphy 1995, citing Neitz 1989).**
  - About 430–475 nm probably appears "blue" to a dog, and about 500–620 nm "yellow".
  - The **neutral point is ~480 nm**, with a neutral band of 475–485 nm. Light there is confused with white or grey. Humans see it as blue-green.
  - For comparison, the human deuteranope neutral point is ~505 nm.
  - Wavelength discrimination works only between about 440 and 520 nm.
  - Middle-to-long wavelengths (green, yellow, orange, red) are confused with each other. Greenish-blue is confused with grey.
- **Model check (my own computation, see §1.4).** Govardovskii A1 templates at 429 and 555 nm predict a neutral point of **485 nm** under both D65 and an equal-energy white. That agrees well with the behavioural ~480 nm.

#### 1.2 Cone proportions (Mowat et al. 2008, Mol Vis 14:2518–2527; verified full text)

- **Cone density:**
  - Area centralis: mean **26,299 cones/mm²** (range 20,635–29,848).
  - Periphery: about **3,000–8,000 cones/mm²**, depending on method.
- **Rods:** ~**501,000 rods/mm²** in the area centralis.
- **Rod:cone ratio:** **22.8 : 1** in the area centralis (≈4.2% cones) and **41.4 : 1** in the periphery (≈2.4% cones).
- **Cone types:**
  - S cones are **9.9–11.9%** of cones in the area centralis and **15–18%** peripherally.
  - L/M cones are the remainder.
  - Absolute S-cone density is ~1,500–1,850 /mm².
- **Location:** the area centralis lies **~1.5 mm temporal and 0.6 mm superior to the optic disc**.
- **Overall cone share:** about 3% of photoreceptors across the whole retina (Peichl 1992, cited by Byosiere et al. 2018; secondary).
- **Conflict to note:** older work (Koch & Rubin 1972; Parry 1953) reports cones as "~20%" of receptors in the central retina. Mowat's ratio of 23:1 gives only ~4%. Trust Mowat 2008; the older figure likely refers to a smaller sampling region or a different counting method.

#### 1.3 Behavioural use of colour

- **Kasparson, Badridze & Maximov (2013)** tested 8 dogs (Proc R Soc B 280:20131356, doi:10.1098/rspb.2013.1356; verified full text).
  - **Design:** dogs were trained on stimuli that differed in both colour (yellow vs blue) and brightness (light vs dark). Unrewarded test trials then pitted colour against brightness.
  - **Result:** dogs chose by colour in **81 of 90 trials (90%)**, and 6 of 8 dogs scored 90–100%.
  - **Implication for the shader:** the blue–yellow chroma axis is a real, salient perceptual dimension for dogs. It should **not** be reduced to near-greyscale.
- Tanaka et al. (2000, *Nihon Chikusan Gakkaiho* 71(3)) reported colour discrimination at 450–500 lux (secondary, via Byosiere 2018).

#### 1.4 How dogs differ from a human deuteranope

1. **S-cone peak.** The dog S cone peaks at ~429–435 nm, against the human S cone at ~420 nm in the pigment, or ~440 nm in the corneal fundamental once lens filtering is included. In effective (corneal) terms the two are similar. The dog L cone at ~555 nm sits between the human M (~530 nm) and L (~558 nm) cones.
2. **Neutral point.** The dog's is ~480 nm and the human deuteranope's ~505 nm. Using a deuteranope matrix unchanged would place grey-confusion too far toward green.
3. **Lens and pre-retinal filtering.**
   - The dog lens has **λ50 = 335 nm** and transmits **61.3% of UVA** (Labrador, n = 2 lenses, 5.0 mm path; Douglas & Jeffery 2014, Proc R Soc B 281:20132995, doi:10.1098/rspb.2013.2995; verified).
   - The human adult lens absorbs essentially everything below ~400 nm.
   - Dogs lack the human yellow lens pigment (Miller & Murphy 1995) and have no macular pigment.
   - **Consequence:** for real-world spectra, dogs probably receive some near-UV (330–400 nm) signal through the β-band of the S pigment. No separate UV cone exists.
   - Douglas & Jeffery conclude that such species "will be UV-sensitive even without a specific UV visual pigment". This is an inference from optics, not a behavioural measurement.
   - **Shader:** an RGB input has no UV channel, so this cannot be simulated from ordinary images. Optionally, a UV channel from a multispectral or UV camera could be added to the S signal.
4. **Rod intrusion.** The dog retina is ~96–97% rods, and the rod peak (508 nm) lies near the neutral point. At mesopic levels, rods will add a third, blue-green-weighted luminance signal. That signal shifts hue and desaturates (see §6).

#### 1.5 Simulation: colour matrices

**Method (reproducible).**
- Script: `/tmp/claude-0/-home-claude/9a9462d1-0e72-53b3-af21-edc46b4342c2/scratchpad/scripts/dogmat.py`. It uses colour-science 0.4.6.
- Dog quantal sensitivity is modelled with Govardovskii et al. (2000) A1 templates at λmax 429, 555 and 508 nm, converted to an energy basis (× λ).
- The canine ocular media are treated as flat above 390 nm, which follows from Douglas & Jeffery.
- Each template is least-squares fit to the CIE 1931 2° CMFs, then composed with the sRGB→XYZ matrix and normalised so that D65 white (1,1,1) maps to 1.

**Fit quality.**
- The dog L fit is good: relative RMSE 5.7%.
- The dog S fit is weaker: relative RMSE 21%, because human z̄ already includes human lens absorption and peaks at ~445 nm.
- **Cross-check against real display primary spectra** (Apple Studio Display and Brainard CRT): the computed dog catches agree within a few percent:
  - Apple, L row: 0.186 / 0.635 / 0.179
  - Apple, S row: 0.007 / 0.061 / 0.932

**Linear sRGB → dog cone catches (rows sum to 1):**

```
L_dog = 0.1824 R + 0.6697 G + 0.1478 B
S_dog = 0.0367 R + 0.0656 G + 0.8977 B
Rod   = -0.0508 R + 0.6586 G + 0.3922 B   (approximate; use for mesopic mixing)
```

**Rendering dog catches back to human-viewable RGB.** This is a design choice, not a measurement. Keep dog "luminance" = L_dog, a reasonable approximation for photopic dogs, whose L cones dominate (~88–94% of cones). Encode the dog's single opponent channel (S_dog − L_dog) along a zero-luminance blue↔yellow axis `b = (−0.190, −0.0445, 1.0)`. That axis comes from the 470 nm spectral locus, has its luminance removed, and has Y·b = 0.

```
out = L_dog * (1,1,1) + k * (S_dog - L_dog) * b
```

The design guarantees three things:
- Greys stay grey.
- Any two colours with equal (L_dog, S_dog) render identically, so red and green collapse onto one yellow–brown line.
- Rendered luminance equals dog L-cone luminance.

**Recommended matrix, k = 1.0** (row 3 then equals S_dog exactly). Apply as `out = T · rgb_linear`:

```
T_dog = [[0.2101, 0.7845, 0.0054],
         [0.1889, 0.6966, 0.1144],
         [0.0367, 0.0656, 0.8977]]
```

Test colours (linear sRGB in → out):

| Input | Output | Appearance |
|---|---|---|
| red (1,0,0) | (0.21, 0.19, 0.04) | dark olive-brown |
| green (0,1,0) | (0.78, 0.70, 0.07) | mustard yellow |
| yellow (1,1,0) | (0.99, 0.89, 0.10) | yellow |
| blue (0,0,1) | (0.005, 0.11, 0.90) | blue |
| white | white | white |

Red is rendered dark because the 555 nm cone is relatively insensitive to long-wave red. This matches the classic observation that red toys are hard for dogs to find against grass. The red-darkening magnitude is a model prediction, labelled **Probable**.

A gentler, less saturated variant (k = 0.7):

```
[[0.2018, 0.7501, 0.0481],
 [0.1870, 0.6886, 0.1245],
 [0.0804, 0.2469, 0.6727]]
```

**For comparison only:** the human deuteranope matrix of Machado, Oliveira & Fernandes (2009), severity 1.0, in linear sRGB as returned by colour-science:

```
[[ 0.367322, 0.860646, -0.227968],
 [ 0.280085, 0.672501,  0.047413],
 [-0.011820, 0.042940,  0.968881]]
```

It keeps reds brighter than T_dog does and puts its neutral point near 500 nm. For a deuteranope-based approach, use the Brettel, Viénot & Mollon (1997) two-half-plane method in LMS space with anchors at 475 and 575 nm. Even then, moving the neutral point toward 480 nm needs the dog-specific matrix above.

**Confidence.** The matrix structure (dichromatic projection and L-dominated luminance) is **Established**. The exact coefficients are **Probable**, since they are model-derived. The choice of display hues for "dog blue" and "dog yellow" is **Speculative**; no one can know the qualia.

---

### 2. Photoreceptors, tapetum, absolute sensitivity

#### 2.1 Rod-dominated retina

- About 96–97% of photoreceptors are rods (Peichl 1992 via Byosiere; Mowat 2008).
- The central ~25° of the dog retina is rod-dominated, whereas the human central retina is cone-dominated (Miller & Murphy 1995, citing Kemp & Jacobson 1992). Confidence: **Established**.
- **Fovea-like "bouquet" (Beltran et al. 2014, PLoS ONE 9:e90390, doi:10.1371/journal.pone.0090390; verified).**
  - A tiny cone-dense spot, ~0.016 mm², peaks at **127k ± 40k cones/mm²** (range 64–212k).
  - It sits ~22° (4.35 mm) superotemporal to the optic nerve head, inside the area centralis, and has no pit.
  - In theory it could support 25–46 cpd. Measured acuity is far lower, so optics, ganglion convergence and tapetal scatter limit the dog. **Established** anatomy; its functional role is **Speculative**.

#### 2.2 Tapetum lucidum

- **Type and structure.**
  - It is a choroidal **tapetum cellulosum** of rodlets containing zinc and cysteine (Ollivier et al. 2004, *Vet Ophthalmol* 7:11–22; secondary, abstract not read).
  - It is **9–20 cell layers** thick at its centre (Miller & Murphy 1995).
- **Location.**
  - It is the **dorsal (upper) fundus**, so it serves the **inferior (lower) visual field**: the ground and what is in front of the dog.
  - A full-sized tapetum covers ~1/3 of the fundus, and the optic disc usually sits at its ventral border (Granar et al. 2011, *Acta Vet Scand* 53:13, doi:10.1186/1751-0147-53-13; verified).
  - It overlaps the visual streak and area centralis. A ResearchGate title "Spatial relationships among the cellular tapetum, visual streak and rod density in dogs" exists; its content is unverified.
- **Variation** (Granar 2011, n = 539 dogs, 20 breeds):
  - Colour: yellow-green 48.4%, orange 29.7%, yellow 12.2%, plus a remainder of green or blue-green.
  - Size: full-sized in 70.3%, absent in 1.9%. Dogs under 10 kg average a smaller tapetal area (88% vs 99%).
  - Brown or red coats are associated with orange tapeta.
  - Puppies' tapeta are blue until about 4 months; this comes from Wikipedia and is unverified in primary sources.
- **Function and gain.**
  - The tapetum gives photoreceptors a second pass at photons that were not absorbed (Miller & Murphy 1995).
  - No measured gain figure exists for dogs. The cat tapetum reflects ~130× more light than the human fundus (Rodieck 1973, via Miller & Murphy), and the dog tapetum is described as "less efficient than the cat's".
  - Beagles with hereditary tapetal degeneration showed only "slightly reduced" ERG sensitivity to white light (Burns et al. 1988).
  - The tapetum's sensitivity gain is therefore **modest**. **Probable:** the gain is well under 2× in absolute threshold terms. Ideal double-pass absorption can at most double photon catch.
- **Cost.**
  - Back-reflected light scatters laterally, which lowers contrast and acuity. Beltran 2014 and Wikipedia say so qualitatively; neither gives a number.
  - Because the tapetum reflects coloured light (yellow-green or orange), its reflectance spectrum probably weights second-pass catch toward rods and L cones. This is **Speculative**.

#### 2.3 Absolute sensitivity

- **No direct psychophysical absolute threshold for dogs was found.**
  - The cat threshold is ~6× lower than the human one (Gunter 1951, via Miller & Murphy). In another measure, cats were ~0.74 log units (~5.5×) more sensitive than humans at ≤1/8 cpd under scotopic conditions (Kang et al. 2009, J Neurophysiol 102:831; verified).
  - Dogs are assumed to be **somewhat less sensitive than cats** but more sensitive than humans (Miller & Murphy 1995).
- **The often-quoted "dogs need 3–5× less light than humans" is not traceable to a dog measurement.** Treat it as **Speculative**, extrapolated from cat data. A defensible shader range is **2–5× (0.3–0.7 log units)** more sensitive than human.
- **In dim light, dogs still see less detail than humans.** At 0.0087 cd/m², after 30 min of dark adaptation, dogs resolved 1.8–3.5 cpd and humans 5.9–9.9 cpd (Lind et al. 2017, PLoS ONE 12:e0188557, doi:10.1371/journal.pone.0188557; verified). That is a ~3× human advantage in both lighting conditions. Confidence: **Probable**. Dogs' advantage at night is detection and motion, not resolution.

**Simulation**
- **Exposure:** multiply input radiance by a sensitivity gain `G = 10^(0.3…0.7)` before the tone-map, to model better detection in the dark. Do not sharpen.
- **Photon noise:** in low light, add noise with variance ∝ signal (Poisson / deVries–Rose).
  - Use `σ_noise ≈ sqrt(I · G · n_eff) / (I · G · n_eff)`.
  - Spatially, correlate the noise at the scale of the scotopic blur (σ ≈ 4–8 arcmin), not per pixel.
  - Temporally, refresh it at ~10–20 Hz (rod integration time ~100 ms) rather than at frame rate.
- **Tapetal veil, inferior-field weighted:**
  - Add `veil = w(y) · Gaussian_blur(I_lum, σ ≈ 1–3°) · α`.
  - `w(y)` ramps from 0 in the upper visual field to 1 below the horizon. Remember the optical inversion: the dorsal tapetum serves the lower field.
  - Use α ≈ 0.05–0.15, and raise it in scotopic mode.
  - Tint the veil with the dog's own (L_dog + rod) luminance only; the dog cannot perceive the tapetal colour as a hue.
  - Confidence: **Speculative** magnitude, **Probable** direction.

---

### 3. Spatial vision: acuity, optics, contrast

#### 3.1 Acuity measurements

| Study | Method | n | Result |
|---|---|---|---|
| Neuhaus & Regenfuss 1967, Z Vgl Physiol 57:137 | Behavioural, 37 lux | 1 medium dog | 4′50″ MAR (~20/95, ~6.2 cpd) |
| Odom, Bromberg & Dawson 1983, Am J Physiol 245:R637 | Pattern ERG / VEP | 4 / 2 | 11.6 cpd (ERG mean); 12.6 cpd (VEP, extrapolated) ≈ 20/50 |
| Ezeh et al. 1990, Prog Vet Neurol 1:427 | Optokinetic | — | ~5′ (~20/100) |
| Ofri, Dawson & Gelatt 1993 | Pattern ERG | — | 6.9′ per phase centrally (central 15°); 11.8′ per phase for the ring 15–30° |
| Murphy et al. 1997, Am J Vet Res 58:414 | Sweep VEP | 3 beagles | 7.0–9.5 cpd (20/85–20/65) |
| Tanaka et al. 2000 | Behavioural | 3 Shiba | 20/60–20/85 |
| Itoh et al. 2010, J Vet Med Sci 72:1449 | Pattern VEP | 6 beagles | 0.54–2.14 cpd (the authors call the method inadequate; ignore) |
| Lind et al. 2017, PLoS ONE | Behavioural Gabor 2AFC, 43 cd/m² | 6 (whippets, pug, sheltie) | **5.5–19.5 cpd** (one pug up to 24) |

- The first six rows are secondary, taken from Miller & Murphy 1995 and Lind 2017 Table 1. Itoh 2010 and Lind 2017 are verified.
- Ezeh 1990 and Ofri 1993 are listed only as Miller & Murphy cite them.

**Consensus.** A "typical" dog has photopic acuity of **~20/75, about 8 cpd**. The best individuals reach 12–20 cpd, and humans 30–60 cpd. Confidence: **Established**.

**Simulation: Gaussian blur from cutoff frequency.**
- Treat the cutoff as the frequency where a Gaussian MTF falls to 5%, giving σ = 0.389 / f_c degrees:

| f_c (cpd) | σ (arcmin) |
|---|---|
| 5.5 | 4.25 |
| 7.5 | 3.12 |
| 9.5 | 2.46 |
| 11.6 | 2.02 |
| 19.5 | 1.20 |

- **Default:** σ ≈ **3 arcmin** (f_c ≈ 7.5–8 cpd).
- **Scotopic:** f_c ≈ 2.5 cpd, so σ ≈ 9 arcmin.
- Pixels: `σ_px = σ_deg × px_per_deg`. A 1920-px image spanning 90° gives ~1.1 px at default settings. At normal display resolution the acuity loss is subtle; it becomes obvious when the image represents a narrow field, such as telephoto or a close object.
- **Better:** apply a frequency-domain CSF filter (below) instead of a plain Gaussian.

**Retinal eccentricity (Probable).**
- Acuity falls with eccentricity: pattern-ERG resolution is ~1.7× coarser in the 15–30° ring than in the central 15° (Ofri 1993).
- Add eccentricity-dependent blur: σ(e) = σ0 · (1 + e / e2).
- For long-nosed (streak) dogs, use an **anisotropic** e2: ~5–10° vertically and ~20–40° horizontally. Acuity stays good along a horizontal band at the horizon.
- For brachycephalic dogs, use an isotropic e2 ≈ 5–10°.
- The e2 values are **Speculative**, derived from the RGC density ratio of ~3:1 between area centralis and streak in McGreevy 2004 (secondary).

#### 3.2 Refraction and accommodation

- **Refraction.**
  - Resting refraction is near emmetropic: in 240 dogs, the mean was within 0.25 D of emmetropia (Murphy, Zadnik & Mannis 1992, *IOVS* 33:2459; secondary via Miller & Murphy).
  - Myopia of ≤ −0.5 D affected **64% of Rottweilers** and **53% of German shepherds** in a clinic population, but only 15% of guide-dog German shepherds. Miniature schnauzers are also predisposed.
  - Astigmatism of 0.5–3 D appeared in 10 of 240 dogs.
- **Larger survey.** Kubai et al. 2008 (*Vet Ophthalmol* 11:376) studied 1,440 dogs of 90 breeds; this is secondary via Balicka et al. 2023.
  - Mean refraction was −0.05 ± 1.36 D.
  - Myopia was most common in Rottweilers, Collies, Miniature Schnauzers and Toy Poodles.
  - Hyperopia was most common in Australian Shepherds, Bouviers and Alaskan Malamutes.
- **Mixed breeds.** Balicka et al. 2023 (*Vet Med Praha* 68:11, doi:10.17221/106/2021-VETMED; verified) found a mean of 0.2 ± 0.9 D in 99 mixed-breed dogs. Myopia ranged down to −2.75 D and hyperopia up to +2.5 D.
- **Optical quality.**
  - Defocus of 2 D degrades acuity about as much as in humans (Murphy et al. 1997).
  - Dog chromatic aberration averages 5.7% of equivalent focal length (Kreuzer & Sivak 1985).
- **Accommodation.**
  - Range is **≤ 2–3 D**, so the near point is ~33–50 cm (Miller & Murphy 1995; Murphy & Pollock 1993). Confidence: **Probable**.
  - Aphakic dogs are ~14 D hyperopic.

**Simulation: depth-dependent defocus (needs a depth map).**
- Blur-circle angular diameter (radians) ≈ pupil diameter (m) × |defocus (D)|. For a 6 mm pupil, 1 D of defocus gives ≈ 0.006 rad ≈ 0.34°.
- Defocus = max(0, 1/d − A_max), where d is distance in metres. Use A_max = 2.5 D for objects closer than 0.4 m. Add a breed or individual offset of −0.5 to −2 D (myopic breeds) to blur far objects.
- Compute the circle of confusion per pixel from depth and add it on top of the acuity blur.

#### 3.3 Contrast sensitivity and brightness discrimination

- **Brightness discrimination.** Pretterer et al. 2004 (*J Vis* 4(3):10; verified abstract) tested 3 police dogs on 30 grey shades.
  - Weber fractions were **0.22** for one German shepherd and **0.27** for two Belgian Malinois; the paper describes them as Belgian shepherds.
  - The human value is 0.11 photopic and 0.14 dark-adapted, so dogs are about 2× worse.
  - An earlier study (Stone 1921) reported 0.10–0.12 in two fox terriers.
  - Confidence: **Probable**.
- **Contrast sensitivity function.** **No published full canine behavioural CSF was found.**
  - de Rivera et al. 2005 (*Prog Neuro-Psychopharmacol Biol Psychiatry*, doi:10.1016/j.pnpbp.2004.12.004) used contrast thresholds in beagles down to 1% contrast, mainly to test ageing; no CSF values were extracted.
  - The commonly stated "CSF peak at ~3 cpd" and "2–3× lower peak contrast sensitivity than humans" are **unverified for dogs**. They are extrapolated from cats, whose CSF peaks at ~0.5 cpd (Blake et al. 1974; not verified here), and from the Weber data.
  - Labelled **Speculative / inferred.**

**Simulation (inferred CSF).**
- Model the dog CSF as a log-parabola: `S(f) = S_max · 10^(−((log10 f − log10 f_peak)^2) / (2·w^2))`, with:
  - `S_max ≈ 50–100` (human ≈ 200–300)
  - `f_peak ≈ 1–3 cpd` (human 3–5)
  - cutoff matched to f_c ≈ 8–12 cpd
- **Implementation A: Laplacian pyramid.** Decompose into octave bands with centre frequencies f_k = px_per_deg / 2^(k+1).
  - For each band, compute local contrast c = band / local mean, then apply a soft threshold of 1/S(f_k) to the contrast.
  - Optionally apply a gain of S_dog(f_k) / S_human(f_k), clamped to ≤ 1.
  - This removes fine and low-contrast detail and keeps strong coarse edges.
- **Implementation B: global grey-level compression.** The ~2× Weber fraction implies roughly half as many discriminable grey steps.
  - Optionally posterise luminance to ~half the JNDs: about 1/ln(1.25) ≈ 4.5 steps per e-fold, against ≈ 9 for humans.
  - Alternatively, add masking noise of σ ≈ 0.1 × local luminance. That noise level is **Speculative**.

---

### 4. Retinal topography

- **Peichl 1992** (*J Comp Neurol* 324:603–620, doi:10.1002/cne.903240412; verified abstract):
  - RGC totals: ~115,000 in dogs and ~200,000 in wolves.
  - Peak density: 6,400–14,400 /mm² in dogs and 12,000–14,000 /mm² in wolves.
  - Wolves have a pronounced horizontal visual streak. Dogs have either a pronounced or a moderate streak, which suggests the moderate form came with domestication.
  - Alpha cells make up 3–14% of RGCs in dogs.
  - A region of the temporal periphery lacks alpha (Y-like) cells. That region maps to the peripheral binocular field, which suggests possible motion or depth deficits there; this functional link is **Speculative**.
- **McGreevy, Grassi & Harman 2004** (*Brain Behav Evol* 63:13–22, doi:10.1159/000073756; verified abstract; n = 22 dogs; the online date is 2003):
  - The ratio of peak RGC density in the area centralis to that in the streak correlates with skull length (r = −0.795) and with cephalic index (r = 0.687).
  - The pattern ranges from an even horizontal streak (wolf-like, long-nosed dogs) to a strong area centralis with almost no streak (pug).
  - Eyelid aperture orientation correlates with cephalic index (r = 0.648).
  - A secondary source (Milton 2016 thesis) gives example densities of ~2,640 /mm² in the area centralis and ~880 /mm² in the streak.
- **Shader:** use a topography mask to drive spatially varying blur and contrast loss (§3.1).
  - **Dolichocephalic** (greyhound, collie): elliptical high-acuity region with aspect ratio ≈ 3–6 : 1 horizontal, centred slightly above the horizon of the image. The area centralis is superotemporal in the retina, so it projects to slightly below and medial in the visual field.
  - **Brachycephalic** (pug): circular high-acuity region.
  - **Mesocephalic:** in between.
  - Confidence: **Established** for the direction of the effect and **Speculative** for the exact shapes.

---

### 5. Field of view and depth

- **Visual field** (Miller & Murphy 1995):
  - Total ≈ **240°** in 2 mixed-breed 20 kg dogs, by behavioural perimetry (Sherman & Wilson 1975, *J Comp Neurol* 161:183). Walls estimated ≈ **250°** from morphology.
  - Monocular field: ~120° ipsilateral plus 15–30° contralateral, for 135–150° per eye.
  - The eyes are rotated ~20° lateral to the midline.
  - **Probable**; it varies with skull shape and eye placement, and brachycephalic dogs have more frontal eyes.
- **Binocular overlap:** **30–60°** behaviourally, **35–40°** from RGC topography (Peichl), and 80–116° in optical estimates (Duke-Elder; Walls). Miller & Murphy favour 30–60°. Humans have ~120–140°.
- **Blind area:** about 110–120° behind the dog, taking 360 − 240/250.
- **Depth perception:**
  - Puppies avoid the visual cliff (Walk & Gibson 1961).
  - No canine stereoacuity measurement was found, so stereopsis is **assumed but unquantified (Speculative)**.
  - Dogs use monocular pictorial cues. Broseghini et al. 2026 (*Anim Cogn* 29:5, doi:10.1007/s10071-025-02026-0; verified abstract) tested 120 dogs: combined shading and linear perspective, or strong shading alone, produced 3D expectations, while weak shading or perspective alone did not.
  - Motion parallax is presumably important given the dogs' motion sensitivity (Speculative).

**Simulation**
- **Wide-FOV projection:** render a 240° horizontal field with an equirectangular or fisheye projection, or composite two ~150° monocular fisheye views whose fields overlap by ~40° in the centre.
- **Binocular zone:** keep the central ~40° (30–60°) at full quality. The two monocular flanks get only monocular cues and may receive slightly more blur.
- **Blind area:** mask the region behind the dog (black, or a soft falloff over ~10°).
- **Vertical field:** limit it with the brow and muzzle. The muzzle occludes the lower nasal field, more so in long-nosed breeds; draw a soft dark nose silhouette at the bottom centre.
- **Vignette:** with a normal ~60–90° camera FOV you cannot show the dog's periphery. Use radial acuity falloff and a mild luminance vignette instead of a hard crop.
- **Eye height:** ~20–86 cm (shoulder height 8–34 in), against ~170 cm for humans. Re-render from a low camera if the scene allows; Miller & Murphy note this matters a lot.

---

### 6. Temporal vision: flicker, motion, adaptation

#### 6.1 Flicker fusion

- **Coile, Pollitz & Smith 1989** (*Physiol Behav* 45:1087–1092, doi:10.1016/0031-9384(89)90092-9; verified abstract) tested 4 beagles with conditioned suppression.
  - Behavioural CFF was **~70 to >80 Hz** at higher luminance. The numbers come from Miller & Murphy, since the abstract does not give them.
  - There was a psychophysical **rod–cone break** at a luminance "similar to the cat's but much higher than man's".
  - Dog rods may follow flicker faster than human rods.
- **ERG data:** rod flicker fusion is ~20 Hz, and the cone ERG limit is ~70 Hz (Aguirre & Rubin 1975; Aguirre 1978).
- **Human comparison:** typically ~50–60 Hz, and Healy et al. 2013 (*Anim Behav* 86:685) tabulate 80 Hz for dogs against 60 Hz for humans.
- **Confidence:** Established that dog cone CFF is greater than human. The exact value is Probable.
- **Implications** (Byosiere et al. 2018):
  - 50/60 Hz CRTs and fluorescent lamps can flicker visibly to dogs.
  - Modern sample-and-hold LCD and OLED screens at 60 Hz do not flicker in luminance the way CRTs do. Dogs may still see **judder** and stepwise motion at 60 fps, and **PWM backlight dimming** (often 200 Hz to several kHz, but sometimes lower) could be visible if it is under ~80 Hz.

#### 6.2 Motion

- In a 1936 study of 14 police dogs, moving objects were recognised at 810–900 m and the same objects when stationary at ≤ 585 m (Walls, via Miller & Murphy 1995).
  - Walls usually attributes the original to Most & Brückner 1936; that attribution is **unverified**.
  - Confidence: **Probable**, given the old study, but it is consistent with the rod-rich, streak-bearing retina.
- **Point-light displays:** dogs prefer local dot motion over global biological configuration (Eatherington et al. 2019, *Animals* 9:661; title verified via search, content unverified). Kovács et al. 2018 also exist on this topic (*Anim Cogn*, doi:10.1007/s10071-018-1160-8; content unverified).

**Simulation (temporal)**
- **Temporal low-pass:** the dog is no slower than the human. Human-tuned 60 fps playback already exceeds human limits, so for photopic dog mode **do not** add motion blur.
- **Scotopic mode:** integrate rods over ~100 ms with an exponential moving average (`α ≈ dt / 0.1 s`). This smears motion trails and reflects the ~20 Hz rod limit.
- **Motion salience boost (Speculative):** compute temporal difference or optical flow magnitude. Locally increase contrast or brightness of moving regions, especially in the periphery, by +10–30%. Optionally show static peripheral regions with extra blur or contrast loss, so moving targets "pop" as in the Walls data.
- **Screen flicker demo:** to visualise "what a 60 Hz CRT looks like to a dog", modulate brightness at the display's refresh. This can only be illustrated by an exaggerated slow strobe, because human viewers cannot see the true rate.

#### 6.3 Light and dark adaptation, pupil, glare

- **Pupil** (Mills et al. 2022, *Front Vet Sci* 9:1020710, doi:10.3389/fvets.2022.1020710; verified; 126 eyes at 209–236 lux):
  - Maximum diameter 6.05–11.30 mm (the device caps at 10 mm).
  - Minimum after a white flash 3.76–9.44 mm, a constriction of 10–38%.
  - Latency 0.11–0.30 s.
  - Average constriction velocity 2.6–6.4 mm/s.
  - The pupil is round. Its maximum area is ≈ 1.5–3× a dark-adapted human's (8 mm → 50 mm²; 10–11 mm → 80–95 mm²), which gives part of the sensitivity advantage (Probable).
- **Dark adaptation:** rhodopsin takes **more than 1 h** to regenerate after intense bleaching, against ~30 min for humans (Miller & Murphy 1995; Byosiere 2018; the original source is not traced). Confidence: **Probable**.
- **Glare:** no direct dog data. The tapetum and the wide maximum pupil imply more intraocular scatter and veiling glare in mesopic conditions (**Speculative**).

**Simulation**
- **Adaptation state:** keep a scalar `A(t)` (log adaptation luminance).
  - **Light adaptation:** fast, τ ≈ 0.1–0.5 s for the pupil, plus seconds for neural adaptation.
  - **Dark adaptation:** a two-stage exponential. The cone plateau comes at ~5–10 min (human-like assumption). The rod limb has τ ≈ 15–25 min, approaching full sensitivity over ~60+ min, compared with ~30–40 min for humans. All of these values are **Speculative**.
- **Mesopic blend:** within log10 L from about −3 to +1 cd/m², blend photopic dog colour (T_dog) toward rod-only luminance (the Rod row in §1.5).
  - The weight is `m = smoothstep(log10 L; +0.5 … −2.5)`.
  - Desaturate the S–L chroma by (1 − m).
  - Increase blur toward σ ≈ 9′.
  - Add noise as in §2.3.
  - The cat-like rod–cone break (Coile 1989) suggests the transition happens at a **higher** luminance than for humans. Shift the human mesopic range up by ~0.5–1 log unit (Speculative).
- **Glare:** add a broad, low-amplitude bloom around bright sources. Use a PSF tail of ∝ 1/θ² beyond ~1°, about 1.5–2× human glare-spread strength, scaled up in dark-adapted state where the pupil is large.

---

### 7. Higher-level processing

- **Faces:** Bunford et al. 2020 (*J Neurosci* 40:8396–8408, doi:10.1523/JNEUROSCI.2800-19.2020; verified abstract) scanned 20 dogs and 30 humans.
  - Dog visual cortex showed **conspecific (species) sensitivity but no face-selective regions**. Humans showed both.
  - Earlier fMRI work claimed a dog face area: Dilks et al. 2015 and Cuaya et al. 2016, both unverified here. The 2020 result contradicts it.
  - Confidence: Probable that there is no face-specific area.
  - **Shader implication:** none at the pixel level. Avoid "face enhancement" features.
- **Size discrimination:** dogs discriminated 20% and 10% size differences but not 5% (Byosiere et al., in prep., via Byosiere 2018; unverified).
- **Visual illusions:** dogs have been tested on the Ebbinghaus illusion and similar figures (Byosiere et al.; not verified here).
- **Methodological caution:** Pongrácz et al. 2017, "Do you see what I see? The difference between dog and human visual perception may affect the outcome of experiments", *Behav Processes* (PMID 28396145). The title is verified via search; the content is unverified. They argue that stimuli designed for human eyes, such as screen colours and refresh rates, can confound dog experiments.

---

### 8. Reasonable inference and clearly labelled speculation

Everything in this section is **Speculative** unless stated otherwise.

1. **What scotopic dog vision "looks like."**
   - It is rod-driven, so it is effectively monochrome. Weighting peaks at ~508 nm, so blue-green objects look relatively brighter and reds look nearly black (rhodopsin barely absorbs above 620 nm).
   - It is blurrier than human night vision in resolution (Lind 2017: ~2–3.5 cpd), but brighter and more "detectable": the dog sees **that** something is there, and that it moves, at lower light levels.
   - **Rendering:** rod-luminance greyscale with a very slight cool tint (convention only), σ ≈ 8–10′ blur, temporally smoothed Poisson-like noise, motion trails at τ ≈ 100 ms, and a brighter exposure than the human equivalent by ~0.3–0.7 log units.
2. **Tapetum shimmer.**
   - Double-pass light means the lower visual field (ground) gets extra sensitivity plus a scatter halo.
   - Moving bright points could produce a faint smeared trail, from scatter and long rod integration.
   - Tapetum colour (orange vs yellow-green) may slightly shift the spectral weighting of second-pass light toward long or middle wavelengths. The dog would not perceive it as a tint; the effect is a small change in relative brightness of coloured surfaces, which is not modellable from RGB with confidence.
   - **Do not** render the visible "eye-shine" colour into the dog's view. That is what *we* see when looking at a dog's eyes.
3. **Screens.**
   - On a 60 Hz CRT or fluorescent light, flicker is probably visible (Established direction).
   - On modern LCD or OLED panels at ≥ 60 Hz, there is no luminance flicker, though PWM dimming can flicker.
   - Low frame-rate video (24–30 fps) may look jerky or stroboscopic to dogs. This is plausible and consistent with anecdotes that dogs engage more with HD/high-refresh TV, but **unverified**.
   - Screen colours: the R, G and B primaries of a TV collapse onto the dog's blue–yellow axis. Red and green objects on screen become dark-yellow vs bright-yellow, distinguished only by luminance (Probable, from §1.5).
4. **UV.** Dogs may see UV-reflective patterns, such as urine marks, some fabrics and optical brighteners in white textiles, as bluish or bright. This is unverifiable without UV imaging. Optional shader input: add `k_uv · UV` to S_dog with `k_uv ~ 0.2–0.5`.
5. **Peripheral vision quality.** The periphery is coarse, but motion sensitivity there is good, because the streak extends horizontally and alpha cells are present, except in the temporal binocular periphery (Peichl). A shader could make peripheral motion more salient than peripheral detail.
6. **Grey shades.** The folk claim that "dogs see more shades of grey" (Orbeli 1909, cited in Miller & Murphy) conflicts with Pretterer 2004's measured Weber fraction, which is 2× worse. Follow Pretterer. Do **not** increase grey discrimination.

---

### 9. Suggested shader pipeline, in order

1. Decode sRGB to linear. Optionally estimate the scene luminance level, either from metadata or from a user "lux" slider.
2. **Exposure and adaptation:** apply the gain G(A(t)) and update the adaptation state.
3. **Colour:** photopic `c_p = T_dog · rgb`. Scotopic `c_s = Rod · rgb` replicated to grey. Mix: `c = mix(c_p, c_s, m)`.
4. **Optics:** depth-dependent defocus (accommodation 2.5 D, plus a breed refractive offset) combined with the base Gaussian of σ ≈ 3′, rising toward 9′ as m → 1.
5. **Retina:** eccentricity and topography blur map (streak vs area centralis). Then contrast thresholding in a Laplacian pyramid using the inferred dog CSF.
6. **Tapetum and glare:** inferior-field veil plus a bloom tail.
7. **Noise:** luminance-dependent, spatially and temporally correlated.
8. **Temporal:** an EMA for rods in scotopic mode, and optional motion salience.
9. **Geometry:** wide-FOV projection, binocular zone, nose silhouette, blind-area mask, low camera height.
10. Encode back to sRGB.

---

### 10. Gaps and caveats

- **No published dog CSF.** The "peak ~3 cpd, 2–3× lower" figures are inferred.
- **No direct dog absolute visual threshold.** The "3–5× more sensitive" figure is extrapolated from cats.
- The exact behavioural CFF values in Coile 1989 (70–80 Hz) come from Miller & Murphy's summary; I did not read the original full text. The luminance levels at which they were measured are unknown.
- Stereoacuity in dogs is unmeasured.
- Dark-adaptation time constants for dogs are not quantified beyond "> 1 h for rhodopsin regeneration".
- Breed variation is large in acuity (Lind 2017 found a 4× range), refraction, field of view, topography and tapetum size. The shader should expose breed presets.
- The colour matrix is model-derived. The S-cone fit via the XYZ basis has ~21% RMSE. Validating against Stockman–Sharpe fundamentals, or using spectral rendering, would improve it.

---

### References

Each entry gives verification status: [V] I read the primary abstract or full text; [S] secondary, cited via a review; [U] unverified.

1. Aguirre GD, Rubin LF (1975). The electroretinogram in dogs with inherited cone degeneration. *Invest Ophthalmol Vis Sci* 14:840–847. [S]
2. Aguirre G (1978). Retinal degenerations in the dog. I. Rod dysplasia. *Exp Eye Res* 26:233–253. [S]
3. Balicka A, Zwolska J, Szadkowski M, Trbolova A, Balicki I (2023). Refractive errors in mixed breed dogs of different ages. *Vet Med (Praha)* 68:11–16. doi:10.17221/106/2021-VETMED. https://pmc.ncbi.nlm.nih.gov/articles/PMC10878259 [V]
4. Beltran WA, Cideciyan AV, Guziewicz KE, et al. (2014). Canine retina has a primate fovea-like bouquet of cone photoreceptors which is affected by inherited macular degenerations. *PLoS ONE* 9:e90390. doi:10.1371/journal.pone.0090390. https://pmc.ncbi.nlm.nih.gov/articles/PMC3944008 [V]
5. Brettel H, Viénot F, Mollon JD (1997). Computerized simulation of color appearance for dichromats. *J Opt Soc Am A* 14:2647–2655. [U; standard method reference]
6. Broseghini A, Bevilacqua V, Guérineau C, et al. (2026). Effectiveness of shading and linear perspective cues in eliciting three-dimensional perception of bidimensional images in dogs. *Anim Cogn* 29:5. doi:10.1007/s10071-025-02026-0 [V]
7. Bunford N, Hernández-Pérez R, Farkas EB, et al. (2020). Comparative brain imaging reveals analogous and divergent patterns of species and face sensitivity in humans and dogs. *J Neurosci* 40:8396–8408. doi:10.1523/JNEUROSCI.2800-19.2020 [V]. The author list beyond Bunford is from memory [U].
8. Burns MS, Bellhorn RW, Impellizzeri CW, et al. (1988). Development of hereditary tapetal degeneration in the beagle dog. *Curr Eye Res* 7:103–114. [S]
9. Byosiere S-E, Chouinard PA, Howell TJ, Bennett PC (2018). What do dogs (*Canis familiaris*) see? A review of vision in dogs and implications for cognition research. *Psychon Bull Rev* 25:1798–1813. doi:10.3758/s13423-017-1404-7. https://link.springer.com/10.3758/s13423-017-1404-7 [V]. Exact title and pages are from memory; the DOI and content were verified.
10. Coile DC, Pollitz CH, Smith JC (1989). Behavioral determination of critical flicker fusion in dogs. *Physiol Behav* 45:1087–1092. doi:10.1016/0031-9384(89)90092-9 [V abstract; numbers S]
11. de Rivera C, Boutet S, Zicker SC, Milgram NW (2005). A novel method for assessing contrast sensitivity in the beagle dog is sensitive to age and an antioxidant enriched food. *Prog Neuro-Psychopharmacol Biol Psychiatry* 29:379–387. doi:10.1016/j.pnpbp.2004.12.004 [V partial]
12. Douglas RH, Jeffery G (2014). The spectral transmission of ocular media suggests ultraviolet sensitivity is widespread among mammals. *Proc R Soc B* 281:20132995. doi:10.1098/rspb.2013.2995. https://pmc.ncbi.nlm.nih.gov/articles/PMC4027392/ [V]
13. Eatherington CJ, Marinelli L, Lõoke M, Battaglini L, Mongillo P (2019). Local dot motion, not global configuration, determines dogs' preference for point-light displays. *Animals* 9:661. https://pmc.ncbi.nlm.nih.gov/articles/PMC6770411 [U content; title V]
14. Govardovskii VI, Fyhrquist N, Reuter T, Kuzmin DG, Donner K (2000). In search of the visual pigment template. *Vis Neurosci* 17:509–528. [U; standard template used in the computation]
15. Granar MIKS, Nilsson BR, Hamberg-Nyström HL (2011). Normal color variations of the canine ocular fundus, a retrospective study in Swedish dogs. *Acta Vet Scand* 53:13. doi:10.1186/1751-0147-53-13 [V]
16. Healy K, McNally L, Ruxton GD, Cooper N, Jackson AL (2013). Metabolic rate and body size are linked with perception of temporal information. *Anim Behav* 86:685–696. [S]
17. Itoh Y, Maehara S, Okada K, Izumisawa Y (2010). Pattern-stimulated visual evoked potential in dog. *J Vet Med Sci* 72:1449–1453. doi:10.1292/jvms.10-0073 [V]
18. Jacobs GH, Deegan JF, Crognale MA, Fenwick JA (1993). Photopigments of dogs and foxes and their implications for canid vision. *Vis Neurosci* 10:173–180. doi:10.1017/S0952523800003291 [V]
19. Kang I, Reem RE, Kaczmarowski AL, Malpeli JG (2009). Contrast sensitivity of cats and humans in scotopic and mesopic conditions. *J Neurophysiol* 102:831–840. doi:10.1152/jn.90641.2008 [V]
20. Kasparson AA, Badridze J, Maximov VV (2013). Colour cues proved to be more informative for dogs than brightness. *Proc R Soc B* 280:20131356. doi:10.1098/rspb.2013.1356. https://pmc.ncbi.nlm.nih.gov/articles/PMC3730601 [V]
21. Kemp CM, Jacobson SG (1992). Rhodopsin levels in the central retinas of normal miniature poodles and those with progressive rod-cone degeneration. *Exp Eye Res* 54:947–956. [S]
22. Kubai MA, Bentley E, Miller PE, Mutti DO, Murphy CJ (2008). Refractive states of eyes and association between ametropia and breed in dogs. *Am J Vet Res* 69:946–951. [S; journal and pages unverified, possibly *Vet Ophthalmol*]
23. Lind O, Milton I, Andersson E, Jensen P, Roth LSV (2017). High visual acuity revealed in dogs. *PLoS ONE* 12:e0188557. doi:10.1371/journal.pone.0188557. https://pmc.ncbi.nlm.nih.gov/articles/PMC5716585 [V]
24. Machado GM, Oliveira MM, Fernandes LAF (2009). A physiologically-based model for simulation of color vision deficiency. *IEEE TVCG* 15:1291–1298. [U; matrix taken from the colour-science implementation]
25. McGreevy P, Grassi TD, Harman AM (2004; online 2003). A strong correlation exists between the distribution of retinal ganglion cells and nose length in the dog. *Brain Behav Evol* 63:13–22. doi:10.1159/000073756 [V]
26. Miller PE, Murphy CJ (1995). Vision in dogs. *J Am Vet Med Assoc* 207:1623–1634. Full text: https://www.rctn.org/bruno/animal-eyes/dog-vision-miller-murphy.pdf [V]. Pages are from memory [U].
27. Mills EP, Combs-Ramey K, Kwong GPS, Pang DSJ (2022). Development of reference intervals for pupillometry in healthy dogs. *Front Vet Sci* 9:1020710. doi:10.3389/fvets.2022.1020710 [V]
28. Mowat FM, Petersen-Jones SM, Williamson H, Williams DL, Luthert PJ, Ali RR, Bainbridge JW (2008). Topographical characterization of cone photoreceptors and the area centralis of the canine retina. *Mol Vis* 14:2518–2527. https://pmc.ncbi.nlm.nih.gov/articles/PMC2610288 [V]
29. Murphy CJ, Zadnik K, Mannis MJ (1992). Myopia and refractive error in dogs. *Invest Ophthalmol Vis Sci* 33:2459–2463. [S]
30. Murphy CJ, Mutti DO, Zadnik K, Ver Hoeve J (1997). Effect of optical defocus on visual acuity in dogs. *Am J Vet Res* 58:414–418. [S]
31. Neitz J, Geist T, Jacobs GH (1989). Color vision in the dog. *Vis Neurosci* 3:119–125. [V abstract; DOI U]
32. Neuhaus W, Regenfuss E (1967). Über die Sehschärfe des Haushundes bei verschiedenen Helligkeiten. *Z Vgl Physiol* 57:137–146. [S]
33. Odom JV, Bromberg NM, Dawson WW (1983). Canine visual acuity: retinal and cortical field potentials evoked by pattern stimulation. *Am J Physiol* 245:R637–R641. [S]
34. Ofri R, Dawson WW, Gelatt KN (1993). Visual resolution in normal and glaucomatous dogs determined by pattern electroretinogram. *Prog Vet Comp Ophthalmol* 3:111–116. [S]
35. Ollivier FJ, Samuelson DA, Brooks DE, et al. (2004). Comparative morphology of the tapetum lucidum (among selected species). *Vet Ophthalmol* 7:11–22. [S]
36. Peichl L (1992). Topography of ganglion cells in the dog and wolf retina. *J Comp Neurol* 324:603–620. doi:10.1002/cne.903240412 [V]
37. Pongrácz P, Ujvári V, Faragó T, Miklósi Á, Péter A (2017). Do you see what I see? The difference between dog and human visual perception may affect the outcome of experiments. *Behav Processes* 140:53–60. PMID 28396145. [Title V; authors, pages and content U]
38. Pretterer G, Bubna-Littitz H, Windischbauer G, Gabler C, Griebel U (2004). Brightness discrimination in the dog. *J Vis* 4(3):10. https://jov.arvojournals.org/article.aspx?articleid=2121581 [V]
39. Sherman SM, Wilson JR (1975). Behavioral and morphological evidence for binocular competition in the postnatal development of the dog's visual system. *J Comp Neurol* 161:183–195. [S]
40. Tanaka T, Ikeuchi E, Mitani S, Eguchi Y, Uetake K (2000). Studies on the visual acuity of dogs using shape discrimination learning. *Nihon Chikusan Gakkaiho* 71(6). [S]
41. Walk RD, Gibson EJ (1961). A comparative and analytic study of visual depth perception. *Psychol Monogr* 75:1–44. [S]
42. Walls GL (1942/1963). *The Vertebrate Eye and Its Adaptive Radiation*. Cranbrook / Hafner. [S]. The original 1936 police-dog study (often given as Most & Brückner 1936) is [U].
43. Kovács K, Virányi Z, et al. (2018). Dog motion perception, *Anim Cogn*, doi:10.1007/s10071-018-1160-8. [U; title and content not read]


---


# Part II: Variation by breed, skull type and age

Scope: the breed, skull-type, coat-colour and age factors that change what a particular dog sees, with numbers where they exist, and a shader recipe for each.

**Confidence labels**
- **Established**: peer-reviewed data that I read directly (at least the abstract or full text).
- **Probable**: standard veterinary-ophthalmology consensus, or data cited by a reliable secondary source that I could not open myself.
- **Speculative**: my own inference, needed for simulation but not measured.

**Citations**
- "Verified" means I read the abstract, full text or a faithful summary during this research (November 2026).
- "Unverified" means the citation is widely quoted or recalled but I could not open the source.
- PubMed and PMC pages were blocked by a captcha during this session. Several papers were therefore verified through publisher pages, DOAJ, VIN, VetCompass or university summaries.

**Baseline adult dog figures used throughout** (Miller & Murphy 1995, as summarised in Miller, VIN; Byosiere et al. 2018)
- **Acuity:** about 20/75, i.e. about 6–8 cyc/deg compared with the human 30 cyc/deg at 20/20 (a back-of-envelope conversion).
- **Total visual field:** about 240° (human about 180°).
- **Binocular overlap:** 30–60° from behaviour, 35–40° from ganglion-cell topography, and 80–116° from optics. In the source, humans are given as about 140°.
- **Accommodation:** 2–3 D. The near point is then about 33–50 cm.
- **Flicker fusion:** 70 to more than 80 Hz.
- **Peak retinal ganglion cell (RGC) density:** 6,400–14,400 cells/mm² in dogs, against 12,000–14,000 in wolves (Peichl 1992).

The age and breed effects below should be layered on top of the species-level dog-vision pipeline: dichromacy, low acuity and so on.

---

### Part A: Breed and skull type

#### A1. Retinal topography: area centralis versus visual streak (the core skull-type effect)

**Findings**
- McGreevy, Grassi & Harman studied 22 dogs.
  - The ratio of peak RGC density in the area centralis to peak density in the visual streak correlates negatively with skull length (r = −0.795).
  - The same ratio correlates positively with cephalic index (r = 0.687).
  - Eyelid aperture orientation also correlates with cephalic index (r = 0.648).
  - Long-nosed dogs have an obvious, even horizontal visual streak, as wolves do.
  - Short-nosed dogs, a pug for example, have a strong area centralis and almost no streak.
  - Eye radius correlates with skull size. Eye size varies far less than skull length (7–28 cm), so small breeds have relatively large eyes.
- Peichl (1992) found that both streak types occur in dogs, sometimes within one breed. Wolves consistently have the pronounced streak. Dogs lack alpha (Y) ganglion cells in about 15° of the peripheral binocular field.
- The Mowat et al. (2008) result, as summarised by Byosiere 2018, is that the canine area centralis has the highest density of both rods and cones. It is not cone-only, unlike the human fovea.

**Confidence:** Established for the correlation. Speculative for how it shows up in perception. No psychophysical study has compared pug and greyhound acuity across the visual field (Byosiere et al. 2018 explicitly calls for one).

**Shader approach: an eccentricity-dependent blur, "acuity map" A(x, y)**
- **Long-nosed dogs (streak).** Acuity falls off slowly along the horizontal meridian and fast vertically. Model A as an anisotropic Gaussian: σ_h ≈ 35–50° and σ_v ≈ 8–12° of visual angle, plus a mild central peak.
- **Short-nosed dogs (area centralis).** Model A as a radial falloff around the centre: σ_r ≈ 12–20°, with a near-isotropic shape.
- **Interpolation.** Use a single parameter s ∈ [0, 1], where s = 1 is a pronounced streak. Derive it from cephalic index (CI): s = clamp((CI_brachy − CI) / (CI_brachy − CI_doli), 0, 1), with CI_doli ≈ 50 and CI_brachy ≈ 80+ as working anchors (Speculative).
- **Blur.** Per-pixel blur σ_px = σ_min + (σ_max − σ_min)·(1 − A). Implement it as a mip-level lookup or a variable-radius Gaussian.
- **Motion.** For sighthounds, optionally raise sensitivity to motion along the streak. For example, add a temporal-difference highlight weighted by A_streak (Speculative).

#### A2. Visual field and binocular overlap by skull type

**Findings**
- Dolichocephalic dogs have more laterally placed eyes. This gives them a wider total field and less binocular overlap.
- Brachycephalic dogs have more frontal eyes and more overlap. In some of them the muzzle no longer blocks the view, although skin folds may (Miller & Murphy 1995; Cook, CRS Today; Byosiere 2018).
- No peer-reviewed paper I could find gives per-skull-type field measurements. The often-quoted figures below are popular-press numbers with no verified primary source. Probably they trace back to Walls (1942) or Coren; treat them as **unverified**:

| Type | Total field (unverified popular figures) | Binocular overlap |
|---|---|---|
| Brachycephalic (pug, Pekingese) | about 200° | about 60°+ (upper end of the 30–60° range) |
| Mesocephalic (Labrador, German shepherd) | about 240° (Miller & Murphy) | about 30–60° |
| Dolichocephalic (greyhound, borzoi) | about 270°+ | about 30° or less |

**Confidence**
- Probable for the direction of the effect.
- Speculative for the specific numbers by type.

**Shader approach**
- Render or warp the scene to a wide cylindrical or equirectangular field (horizontal FOV = F_total).
- The binocular zone is the central band of width B. Inside it, apply the full acuity map and stereo cues.
- In the monocular flanks (each (F_total − B)/2 wide), apply 1.2–1.5× extra blur and about 10% less contrast. This reflects the absence of binocular summation and the alpha-cell gap (Speculative).
- Add a **nose occlusion mask**: a soft dark wedge at the bottom centre.
  - Width: scale with muzzle length, about 10–25° for long-nosed dogs and about 0–5° for pugs.
  - Darkness: draw it as a blurred, out-of-focus shape, because the muzzle is far nearer than the 33 cm near point.
- Add a **brow/fold occlusion** at the top of the field for heavy-folded breeds such as Shar-Pei and Bloodhound (Speculative).

#### A3. Brachycephalic ocular syndrome: exophthalmos, lagophthalmos, corneal exposure, pigmentary keratitis

**Findings**

*Corneal ulcerative disease (O'Neill et al. 2017, VetCompass, 104,233 UK dogs)*
- Overall prevalence 0.80%.
- Prevalence by breed: pug 5.42%, boxer 4.98%, Shih Tzu 3.45%, Cavalier King Charles spaniel (CKCS) 2.49%, bulldog 2.41%.
- Adjusted odds ratios against crossbreeds:
  - pug 19.05
  - boxer 12.12
  - Shih Tzu 10.04
  - brachycephalic dogs as a group 11.18
- Odds are 2.24 times higher at 6.0–8.9 years than under 3 years. **Established.**

*Pigmentary keratitis (PK) (Maini et al. 2019, 210 UK pugs)*
- PK was present in 87.8% of eyes and in 91.9% of pugs; 91.2% of affected pugs had it in both eyes.
- Severity: 46.3% mild, 49.9% moderate, 3.8% severe.
- PK starts medially (nasal side) and spreads toward the centre in a wedge shape.
- It is strongly associated with medial entropion of the lower eyelid (present in 94.1% of eyes; OR 9.98–13.19).
- Age raises the odds of PK (OR 1.76 per unit) but not its severity. Median age was 2.5 years.
- PK that reaches the visual axis can cause significant visual impairment. **Established** for prevalence. **Probable** for the effect on vision.

*KCS (dry eye) (Sanchez et al. 2021, JSAP, VetCompass, 363,898 dogs)*
- Prevalence 0.4%.
- Odds ratios: American cocker spaniel 52.33, bulldog 37.95, CKCS 19.79.
- Brachycephalic dogs have 3.63 times the risk of mesocephalic dogs. **Established** (the numbers are from the Vet Times report of the paper).
- Packer, Hendricks & Burn (2015, PLoS ONE) found that a shorter craniofacial ratio, nasal folds, larger exposed eye (wider palpebral fissure) and lagophthalmos raise ulcer risk. I could not retrieve their specific odds ratios: **unverified numbers**.

**Shader approach**
- **PK overlay**
  - Add a brown-black, semi-opaque texture that enters from the nasal edge of each eye's field.
  - In the image, the nasal side of the right eye's cornea maps to the temporal side of the right eye's view after inversion. In practice, for a fused single image, put a wedge on each inner (medial) side.
  - Severity mapping:
    - mild: opacity 0.2–0.4, covering 10–20% of the field edge
    - moderate: opacity 0.5–0.7, reaching the pupil margin, about 30% of the field
    - severe: covering the centre, with transmittance about 0.1–0.3
- **Corneal exposure / KCS**
  - Add a low-frequency "tear-film breakup" haze: a contrast loss of 10–25%, plus a noisy distortion map that slowly re-forms and degrades between simulated blinks (a period of 5–15 s).
  - Use a stronger effect for lagophthalmic dogs (Speculative).
- **Corneal scarring/ulcer:** a local veiling glare plus a blur patch (Speculative).

#### A4. Mesocephalic baseline (Labrador, German shepherd, retrievers)

Use the species defaults:
- an intermediate streak (s ≈ 0.5–0.7)
- a total field of about 240°
- binocular overlap of about 40°

Labradors vary a lot within the breed in tapetum size, and 4.8% have no tapetum (Granar 2011).

#### A5. Refractive error by breed

**Findings (Established unless marked)**
- Murphy, Zadnik & Mannis (1992, IOVS 33(8)) studied 240 dogs by retinoscopy. The breed percentages below are quoted from a secondary source (McConnell's summary of the paper); I could not open the primary source.
  - Myopia was present in 64% of Rottweilers, 53% of German shepherds (clinic population) and 50% of miniature schnauzers (largely one family).
  - Only 19% of 53 German shepherds from guide-dog programmes were myopic. The likely explanation is selection, since myopic dogs fail guide-dog training. **Probable.**
- Kubai, Bentley, Miller, Mutti & Murphy (2008, AJVR 69(7):946–951):
  - Breeds whose mean refractive state was myopic: Rottweiler, collie, miniature schnauzer, toy poodle.
  - Breeds whose mean was hyperopic: Australian shepherd, Alaskan malamute, Bouvier des Flandres.
  - Myopia increased with age. **Established** (qualitatively, from the University of Wisconsin summary).
  - Recalled but **unverified**: about 1,440 dogs, a mean refractive state near −0.05 D, and an SD of about 1.3 D. I could not confirm the per-breed diopter means. I recall magnitudes of about −0.5 to −1.5 D for the myopic breeds, but treat these as Speculative.
- Balicka et al. (2023, Vet Med Czech, 99 mixed-breed dogs):
  - Adults (1–8 years): myopia (≤ −0.5 D) in 23% of eyes and hyperopia in 41%; range −2.5 to +1.75 D.
  - Geriatric dogs (8–13 years): myopia in 15% and hyperopia in 47%; maximum −2.75 / +2.5 D.
  - Anisometropia (a difference of 1 D or more between eyes): 1–9.5% depending on group.
- Francis et al. (2024, Vet Ophthalmol 27(1):70–78, 229 eyes): myopia stronger than −1.5 D rose with nuclear sclerosis (NS) grade.
  - Grade 0: 6.9%
  - Grade 1: 13.2%
  - Grade 2: 22.8%
  - Grade 3: 30.4%
  - The authors conclude that NS is "only weakly associated with myopia", although it is associated with visual deficits in some dogs.
- Aphakic dogs (after cataract surgery without a lens implant) are hyperopic by about +14 D, with acuity of about 20/800. A 41 D intraocular lens (IOL) restores emmetropia (Lynch 2008; Miller).

**Shader approach: defocus blur from refractive error**
- Defocus blur angle in radians ≈ pupil diameter (m) × |ΔD|.
  - Example: a 4 mm photopic dog pupil with −1.5 D gives 0.004 × 1.5 = 0.006 rad ≈ 0.34°.
  - Example: a 7 mm scotopic pupil gives about 0.6°.
- Use this as a Gaussian σ or, better, a disk point spread function (PSF) whose radius is ½ of that angle.
- Myopes see distant objects blurred. Hyperopes see near objects blurred within their 2–3 D accommodative range, and distant objects stay sharp until the error exceeds what accommodation can cover.
- With a depth buffer, compute per-pixel defocus as |ΔD_eye − (1/d_m) + accommodation|. Clamp accommodation to 2–3 D in young adults and reduce it with age (see B3).
- Breed presets (Speculative magnitudes): Rottweiler, German shepherd, miniature schnauzer and toy poodle at about −1.0 D; Australian shepherd and malamute at about +0.75 D; everyone else at 0 ± 0.5 D. Give 5–10% of individuals an interocular difference of 1 D or more.

#### A6. Merle and double merle (M/M)

**Findings**
- *Mm (single merle)*
  - Heterochromia or blue eyes are frequent.
  - The retinal pigment epithelium (RPE) and choroid often lack pigment, giving a subalbinotic fundus (Hédan et al. 2006).
  - Deafness: 2.7% unilateral and 0.9% bilateral (Strain et al. 2009, 153 dogs). **Established.**
- *MM (double merle)*
  - The phenotype is more severe: often very pale or white.
  - Microphthalmia occurs with incomplete penetrance, along with microcornea, cataract and coloboma (Hédan 2006). **Established** (qualitative).
  - Deafness: 10% unilateral and 15% bilateral (Strain 2009). **Established.**
  - Gelatt, Powell & Huston (1981, AJVR 42:1686–1690) described inherited microphthalmia with coloboma in Australian shepherds. I verified this as a citation only; the abstract was not read.
  - Other defects reported in the literature: equatorial staphyloma, iris hypoplasia or coloboma, dyscoria (misshapen pupil), corectopia (off-centre pupil), and retinal dysplasia or detachment. **Probable.**
  - I found no peer-reviewed prevalence figure for MM ocular defects. Wikipedia notes that "no studies have been done" to quantify blindness.

**Shader approach**
- **Mm**
  - Treat these dogs as subalbinotic (A7): more fundus scatter and glare.
  - A blue iris lets more light through, so add a small stray-light term, about 1.2–1.5× the baseline glare (Speculative).
- **MM, presets graded by severity**
  - Mild: iris coloboma or dyscoria. Add an extra off-axis pupil aperture, which produces a double image or ghosting at 5–15% intensity, plus glare 1.5–2× baseline.
  - Moderate: microphthalmia. Constrict the field to 50–70% of normal, add a 2–4 D refractive error (direction unknown, so Speculative), and add a cataract haze of 0.2–0.5 (see B3).
  - Severe: blind or nearly blind. Show only light/dark perception: a heavily blurred luminance channel (σ > 5°), or black.
- These are clinical-phenotype presets. Real eyes vary a lot and are often asymmetric, so allow per-eye settings.

#### A7. Albino/subalbinotic fundus, blue eyes, heterochromia, absent tapetum

**Findings (Granar et al. 2011, Acta Vet Scand, 539 Swedish dogs)**
- The tapetum was absent in 1.9% of dogs and full-sized in 70.3%.
- Breeds under 10 kg had a mean tapetal size of 88.0% of the full area, against 99.1% in larger breeds (p < 0.001).
- Green or blue-green tapeta averaged 84.6% in size, against 96.5% for other colours.
- 4.8% of Labradors had no tapetum.
- Tapetal colour: yellow-green 48.4%, orange 29.7%, yellow 12.2%.
- Brown or red coats were associated with orange-tinted tapeta; white or grey coats with green tapeta; grey coats with smaller tapeta.
- A subalbinotic, striped red-and-white non-tapetal fundus is recognised, but its frequency was not reported. **Established.**
- Dogs without a tapetum show red eyeshine, because light reflects off the choroidal vessels. This is standard ophthalmology: **Probable**.
- In blue-eyed and subalbinotic dogs, the lack of RPE and choroidal pigment lets stray light scatter inside the eye. This raises veiling glare and probably causes photophobia. By analogy with human albinism this is **Probable**; I found no canine measurement.

**Shader approach**
- **Tapetum factor T ∈ [0, 1]**, the fraction of tapetal area times its reflectivity.
  - T scales the scotopic sensitivity gain. A full tapetum gives roughly 1.3–2× more photon capture in dim light (Speculative magnitude; the "130× fundus reflectance" figure is for cats).
  - T also scales "tapetal blur": light reflected back through the retina adds a low-level halo to dim scenes. Use σ about 1.5× the base blur, mixed in at 0.1·T in scotopic mode.
  - With no tapetum (T = 0), dim scenes look darker and noisier, but slightly sharper.
- **Pigment factor P ∈ [0, 1]**, where 0 is subalbinotic or blue-eyed.
  - Veiling glare for a bright source: L_veil = k·(1 + 2·(1 − P))·E_glare / θ², where θ is the angle to the source. This follows a Stiles–Holladay-style glare term, with k ≈ 10 (human value) as a starting point.
  - Raise bloom intensity 1.5–3× as P falls to 0 (Speculative).
  - Raise the photophobic "squint": a brightness-triggered narrowing of the vertical aperture at high scene luminance.
- **Heterochromia:** use separate P for each eye. If you render a fused view, average the two, weighted toward the eye in the dominant hemifield (Speculative).

#### A8. Breed predisposition table for eye diseases

Ages of onset and progression come from Mellersh (2014), Gelatt & MacKay (2004, 2005), VIN lens notes, Auten et al. (2018) and the VetCompass papers. Breed lists not tied to a numeric study reflect general veterinary references (Gough & Thomas, *Breed Predispositions to Disease in Dogs and Cats*; Gelatt, *Veterinary Ophthalmology*). **I did not directly open either book, so treat those lists as Probable / unverified-page.**

| Disease | Breeds (key numbers) | Onset | Visual effect | Shader approach | Confidence |
|---|---|---|---|---|---|
| PRA, rcd1 (PDE6B) | Irish setter | Begins about 25 days; rods and cones gone by about 1 year | Night blindness, then complete blindness | See PRA model below | Established (Mellersh 2014) |
| PRA, rcd4 (C2orf71) | Gordon setter, Irish setter, Tibetan terrier | Average about 10 years | Late-onset night blindness, then day loss | Same | Established |
| PRA, prcd | At least 18 breeds, including miniature and toy poodle, Labrador, English cocker, Portuguese water dog, Australian cattle dog | Late, typically adult (about 3–8 years for most breeds; unverified) | Rod-cone degeneration; peripheral and dim-light vision first, ending in a tunnel | Same | Established (gene/breed count); Probable (ages) |
| PRA, gPRA (CCDC66) | Schapendoes | 2–5 years; full loss about 2 years after onset | Night, then day | Same | Established |
| XLPRA1 / XLPRA2 | Siberian husky, Samoyed (XLPRA1); mixed breeds (XLPRA2) | Young adult (XLPRA1); 5–6 weeks (XLPRA2) | Progressive | Same | Established |
| ADPRA (RHO T4R) | Mastiff, bullmastiff | ERG abnormal by 13 months | Light-sensitive degeneration | Same, plus a glare penalty | Established |
| Photoreceptor dysplasia | Miniature schnauzer | Very early | Rods and cones | Same | Established |
| Collie eye anomaly (NHEJ1) | Rough and smooth collie, Shetland sheepdog, Australian shepherd; lower in border collie | Congenital; mild choroidal hypoplasia may be masked by pigment by 3–7 months | Usually subclinical. Coloboma gives a focal scotoma (blind spot); detachment causes blindness. Up to 80–85% phenotypic incidence in US collies (Gilger 2006, via Wikipedia; unverified) | Most dogs: none. Coloboma: a soft scotoma, 5–15°, below the centre. Severe: blind | Probable |
| Primary glaucoma | American cocker 5.52%, basset 5.44%, chow chow 4.70%, Shar-Pei 4.40%, Boston terrier 2.88%, wire fox terrier 2.28%, Norwegian elkhound 1.98%, Siberian husky 1.88%, cairn terrier 1.82%, miniature poodle 1.68%. Shiba Inu is also predisposed, but I have not verified a number | About 6–7 years (Ollivier 2019) | Acute: corneal edema (halos, haze) and pain. Chronic: field loss from the periphery inward, then blindness | Edema: haze 0.3–0.6 plus rainbow halos around lights. Chronic: field mask shrinking toward the centre | Established (prevalence) |
| Cataract, breed-related | Prevalence (Gelatt & MacKay 2005): smooth fox terrier 11.70%, Havanese 11.57%, bichon frise 11.45%, Boston terrier 11.11%, miniature poodle 10.79%, silky terrier 10.29%, toy poodle 10.21%; mixed breeds 1.61%. Also miniature schnauzer (congenital to 4 months), American cocker (6 months to 8 years), Labrador and golden retriever (posterior polar, 9–18 months, usually non-progressive) | By breed; see VIN table | Scatter, contrast loss, blur, then blindness | See B3 cataract model | Established |
| Diabetic cataract | Any breed | More than 85% of diabetic dogs develop cataract | Fast, bilateral | Fast progression of the B3 model | Established (MSD) |
| KCS (dry eye) | American cocker OR 52.3, bulldog 38.0, CKCS 19.8; brachycephalic 3.63× mesocephalic; also West Highland white terrier, pug, Shih Tzu (Probable) | Adult | Tear-film haze, mucus, corneal pigment over time | Haze plus streaks (A3) | Established / Probable |
| Pigmentary keratitis | Pug (91.9% of dogs); also Shih Tzu, Pekingese, Lhasa apso (Probable) | Prevalence rises with age; median age in the study 2.5 years | Nasal-to-central brown opacity | A3 overlay | Established |
| Corneal ulcer | Pug OR 19.1, boxer 12.1, Shih Tzu 10.0 | Peak about 6–9 years | Focal haze, pain, squint | Local glare and blur | Established |
| Entropion / ectropion | Shar-Pei, Chow, bulldog, St Bernard, bloodhound, Bullmastiff, Labrador (entropion); St Bernard, bloodhound, basset, cocker, Clumber (ectropion) | Puppy to young adult | Squinting, irritation, keratitis | Narrowed vertical aperture (entropion); exposure haze (ectropion) | Probable (Gough & Thomas, unverified page) |
| SARDS | Dachshund 21%, schnauzer 11%, pug 7%, Brittany 3% of 151 cases; spayed females 59%; median 8.9 years (range 3–20); median weight 12.4 kg | Acute, over days | Total blindness with a flat ERG | Rapid ramp to black (or light-perception only) over 1–4 simulated weeks | Established (Auten et al. 2018) |
| Corneal endothelial dystrophy | Boston terrier (5–9 years), Chihuahua and dachshund (8–13 years) | Middle-aged to senior | Bluish diffuse edema, then bullous keratopathy | Global haze, from 0.2 up to more than 0.7, plus a blue tint and halos | Probable |
| Senile iris atrophy | Poodles, cockers, schnauzers, Chihuahua (Probable) | Middle-aged to old | Poor pupil constriction, glare, photophobia | B3 pupil model | Probable |

**PRA model**

Drive a progress parameter p from 0 to 1 over the breed's onset age and course.
- Scotopic sensitivity falls first: dim-light gain × (1 − p)^2.
- The peripheral field mask shrinks: field radius R(p) = R0·(1 − 0.8p).
- Photopic contrast falls later: contrast × (1 − max(0, p − 0.5)·2).
- At p ≈ 1 the dog is blind.

**Note on Williams 2004.** The task named Williams (2004), "Lens and lens changes in older dogs". I could not verify a paper by that exact title. The verified Williams 2004 paper is Williams DL, Heath MF, Wallis C, "Prevalence of canine cataract: preliminary results of a cross-sectional study", *Vet Ophthalmol* 7(1):29–35. The title in the task is **unverified**. Williams has written review chapters on the ageing eye (for example, *Vet Clin North Am Small Anim Pract*, 2008/2012, "Major ocular changes in older dogs"); that review is also unverified.

---

### Part B: Age

#### B0. Lifespan scaling

**Findings**
- O'Neill et al. (2013, Vet J 198:638–643): median longevity 12.0 years (IQR 8.9–14.2).
- Crossbreeds lived 1.2 years longer than purebreds.
- Longevity falls as bodyweight rises. The longest-lived breeds were the miniature poodle, bearded collie, border collie and miniature dachshund; the shortest-lived were the Dogue de Bordeaux and Great Dane. **Established.**
- Working lifespan values L for the model, from wider VetCompass and O'Neill literature (**Probable**; the exact numbers vary by study):
  - toy/small breeds: about 13–15 years
  - medium breeds: about 12–13 years
  - large breeds: about 10–12 years
  - giant breeds (Great Dane, Dogue de Bordeaux, Bernese): about 6–8 years
- **Supporting evidence:** Williams 2004 found that the age at which 50% of dogs had cataract (C50) correlated with breed longevity (r = 0.74). This supports scaling lens ageing by lifespan rather than by calendar years. **Established.**

**Model.** Normalised age is a = age_years / L. For age-related effects, use a with anchors set so that a ≈ 0.75 corresponds to C50 ≈ 9.4 years at L ≈ 12.5. Developmental (puppy) effects use calendar weeks, because early development is roughly breed-independent.

#### B1. Neonatal and puppy period (calendar time)

| Age | Event | Source / confidence |
|---|---|---|
| 0–9 to 12 days | Eyelids fused, so effectively blind. Light leaks through the lids diffusely. | Kuse 1990 (beagles): eyes open at 9–12 days. Established. Popular sources give 10–16 days across breeds (Probable). |
| 12 days | First small visual evoked potential (VEP) | Kuse 1990, Established |
| About 2 weeks | Low-amplitude ERG; photoreceptor inner segments present; peripheral retina thicker than central | Tuntivanich & Petersen-Jones 2003, Established |
| 16–22 days | ERG a-wave (16–19 days), then b-wave (18–22 days) | Kuse 1990, Established |
| 3–6 weeks | ERG amplitudes rise rapidly; latencies shorten (3–4 weeks) | Kuse 1990, Established |
| About 4 weeks | Photoreceptor outer segments formed but immature | Tuntivanich 2003, Established |
| About 7 weeks | Photoreceptor layer at maximum thickness; maximal, adult-like ERG waveform | Tuntivanich 2003, Established |
| More than 6 weeks | Characteristic oscillatory potentials (OP waves) | Kuse 1990, Established |
| 2–3 months | Menace response appears, a functional sign of cortical vision and visually guided behaviour | Pediatric ophthalmology proceedings (dvm360), Probable |
| 2 to about 4 months | Tapetal reflex changes from blue or violet to adult colour: adult appearance by about 2–3 months (literature cited in Granar 2011), with the blue reflex lasting up to about 4 months (dvm360) | Probable |
| About 16 weeks | Photoreceptor layer thins and ERG amplitude falls slightly, converging to adult values | Tuntivanich 2003, Established |
| Neonate to about 4–6 months | Puppy blue iris darkens to the adult colour, typically over 9–16 weeks (unverified) | Speculative/unverified |
| Neonate to weeks | Persistent pupillary membranes (PPM) and hyaloid remnants regress after birth. Iris-to-iris PPM strands are often still seen in young dogs and in adult basenjis and pugs (Maini 2019 recorded "iris-to-iris PPM" in pugs). | Probable; no regression age verified |
| Puppy | Schirmer tear values lower (about 10 mm/min); IOP slightly higher (20–25 mmHg) | dvm360, Probable |

**Acuity development.** I found no canine psychophysical study of acuity across development. Adult-level retinal function by about 7 weeks and a menace response by 2–3 months suggest that adult acuity arrives around 3–4 months, once cortical maturation is included. **Speculative.**

**Shader approach (puppy)**
- **Before eye opening (< 10–14 days):** output a heavily blurred luminance only (σ ≥ 10°), with a red-orange tint for eyelid transmission and 1–5% transmittance. Render the dog as effectively blind.
- **2–7 weeks:** blend from very low acuity to adult.
  - Acuity factor α(t) = smoothstep(2 weeks, 7 weeks, t) for the retina, times smoothstep(4 weeks, 14 weeks, t) for the cortex (Speculative).
  - σ_blur = σ_adult / max(α, 0.1).
  - Contrast sensitivity × (0.3 + 0.7α).
  - Dim-light gain also scales with α.
- **Under about 4 months:** add a slight blue-violet tint to dim-scene bloom, from the immature, highly reflective blue tapetum (Speculative, mostly cosmetic).
- **PPM:** optionally add a few thin dark threads crossing the pupil plane, rendered as faint defocused shadows (opacity 0.02–0.05). They show only with a small pupil in bright light (Speculative).

#### B2. Adult baseline

Adulthood runs from about 6 months to about 0.45 L (about 5–6 years for medium breeds): the species-default pipeline with no age penalties. Two caveats:
- Rogers et al. (2023, Front Vet Sci, 235 dogs) used an owner questionnaire (dogVLQ). Its estimated age of onset for vision decline was about 51 months (4.3 years) for bright and dim light, but about 30 months (2.5 years) for near-darkness. So decline in dim-light vision starts surprisingly early. **Established** (questionnaire-based; owner reports).
- Balicka 2023 found no significant change in refraction between adult and geriatric groups. Kubai 2008 reported that myopia increases with age (Established, qualitative).

#### B3. Senior and geriatric changes

**Nuclear (lenticular) sclerosis**
- Findings:
  - Normal in dogs over 6 years (Ollivier, WSAVA 2019). "Evident in dogs in middle age" (VIN lens notes).
  - Minimal effect on functional vision (VIN; MSD).
  - Associated with visual deficits in some dogs, but only weakly with myopia: the rate of myopia stronger than −1.5 D rose from 6.9% at NS grade 0 to 30.4% at grade 3 (Francis 2024).
  - The "near-universal by 9–10+" claim is **Probable**. In Rogers 2023's ERG subset (median 94 months), 61 eyes had NS.
- Confidence: Established for the minimal effect on vision; Probable for onset at 6–7 years.
- Shader:
  - NS(a) = smoothstep(0.45, 0.85, a), a grade from 0 to 1, where a = age/L. Six to seven years at L = 13 gives a ≈ 0.5.
  - Forward scatter: bloom or veiling glare whose intensity rises by 0 → 0.15 times the scene-luminance-weighted glare, with a wide kernel (5–20°).
  - Contrast: multiply by (1 − 0.10·NS).
  - Small extra blur: σ += 0.1–0.2° × NS.
  - Myopic shift: with probability 0.07 → 0.30 by grade (Francis 2024), apply about −1.5 to −2 D in the defocus model.
  - **Yellowing:** canine NS appears grey-blue to the examiner. I found no measured spectral transmittance for canine lenses by age; the Douglas & Jeffery 2014 data on dog lenses were inaccessible. A mild short-wavelength cut is plausible (Speculative). Multiply the S-cone (blue) channel by (1 − 0.15·NS) and the L/M ("yellow") channel by (1 − 0.03·NS). This matters for a dichromat: it shrinks the blue–yellow axis, desaturating the image toward grey.

**Senile cataract**
- Findings (Williams, Heath & Wallis 2004, 2,000 dogs):
  - C50 = 9.4 ± 3.3 years.
  - Every dog over 13.5 years had some lens opacity.
  - C50 correlated with breed longevity (r = 0.74).
  - Age-related cataract is defined as onset after 8 years (VIN).
- Confidence: Established.
- Shader:
  - Cataract density c(a) is sigmoid with c = 0.5 at a = 0.75; individual variance is large (± 3.3 years).
  - Most "cataract" in that study is incipient or cortical, so map it as:
    - incipient (c < 0.3): spoke-like local scatter; glare kernel × (1 + 2c); contrast × (1 − 0.2c)
    - immature (0.3–0.7): blur σ += 1–3° × c; contrast × (1 − 0.5c); strong halos around lights
    - mature (> 0.8): light/dark and motion only; luminance blurred with σ > 5°; transmittance about 0.1–0.3
  - Use a position-dependent opacity texture through the pupil: cortical spokes enter from the periphery, so they affect a dilated pupil more (worse at night). Nuclear opacity affects a small pupil more (worse in daylight).

**Senile iris atrophy**
- Findings:
  - Progressive thinning of the iris in middle-aged and older dogs, especially poodles and cockers (and miniature schnauzers and Chihuahuas, Probable).
  - Produces dyscoria (irregular pupil), slower or reduced pupillary light reflexes (PLR) and at least slight constriction in bright light.
  - Vision is not affected, but photophobia can be severe in advanced cases (Hamzianpour, Vet Times 2017).
- Confidence: Probable.
- Shader:
  - Pupil model: diameter d = d_min + (d_max − d_min)·f(L_scene).
  - With iris atrophy at strength i, raise d_min: d_min' = d_min + i·(d_max − d_min)·0.6.
  - Slow the adaptation time constant: τ × (1 + 3i).
  - Effects of the larger pupil: more defocus blur (A5), more cataract spoke effect, and more glare (glare ∝ d²).
  - Add a slight secondary ghost, 2–5% intensity, from holes in the iris (full-thickness defects).
  - Add a bright-scene "photophobic" exposure overshoot that adapts slowly.

**Vitreous degeneration, floaters, asteroid hyalosis**
- Findings:
  - Vitreal syneresis (liquefaction) and asteroid hyalosis (calcium-lipid particles) are recognised age-related findings in dogs (Ollivier 2019, which gives no prevalence).
  - Asteroid hyalosis rarely impairs vision.
  - No canine prevalence figures were found: **unverified**. Kador & Wyman (2008) note asteroid hyalosis in diabetic-model beagles.
- Confidence: Probable (presence); unknown (prevalence).
- Shader:
  - Optional sparse floaters: 5–30 small, soft, semi-transparent blobs, opacity 0.05–0.15, defocused (σ 0.3–1°).
  - They drift with lag after simulated eye movements and are mostly visible against bright, uniform backgrounds.
  - Asteroid hyalosis: tiny bright specks, because the particles back-scatter light.
  - Enable with a probability rising with a (Speculative).

**Reduced tear production**
- Finding: Schirmer tear test values fall by about 0.4 mm/min per year (Ollivier 2019). Confidence: Probable (proceedings).
- Shader: increase the A3 tear-film breakup haze amplitude by about 3% per year after about 6 years (Speculative).

**Senile retinal degeneration and reduced ERG**
- Findings:
  - Salzman et al. (2023, Doc Ophthalmol 147:15–28, 77 dogs, median age 9.8 years): with age, both rod and cone ERG amplitudes fall and their peak times lengthen. Examples: dark-adapted a-wave at 3 cd·s/m², p < 0.0001; light-adapted 30 Hz flicker amplitude, p = 0.0004. No per-year effect size is in the abstract. **Established.**
  - Rogers 2023:
    - b-wave amplitude correlated with age (r = −0.29 to −0.58).
    - Regression x-intercepts, the ages at which amplitude extrapolates to zero, were 436 months (36 years) for light-adapted responses and 342 months (28.5 years) for dark-adapted responses. That implies a linear loss of about 2.8% per year (light-adapted) and about 3.5% per year (dark-adapted) of the young-adult amplitude (my calculation from the reported intercepts; Probable).
    - Owner-rated decline begins about 2.5 years (near darkness) to 4.3 years (bright or dim light).
- Shader:
  - Retinal gain R_photopic(age) = 1 − 0.028·(age_years − 1).
  - R_scotopic(age) = 1 − 0.035·(age_years − 1).
  - Apply these as contrast-sensitivity and luminance-gain multipliers in the corresponding light regimes.
  - Since retinal ageing is probably tied to biological age, scale age_years by (12.5 / L) for short-lived breeds (Speculative).
  - Add photon or sensor-like noise in dim scenes. Its amplitude grows as 1 / sqrt(R_scotopic), and it is larger without a tapetum.

**Slowed dark adaptation and temporal resolution**
- Findings:
  - ERG peak times lengthen with age (Salzman 2023).
  - Owners report trouble with light transitions (r = −0.32 with age; Rogers 2023).
  - No canine dark-adaptation curve by age was found. **Probable** for direction; magnitude unknown.
- Shader:
  - Dark-adaptation time constant τ_dark = τ0 × (1 + 1.5·max(0, a − 0.4)) (Speculative).
  - Lower the effective flicker fusion and motion-blur cutoff from 75 Hz toward about 55–60 Hz in geriatric dogs. Implement it as temporal smoothing (an exponential moving average, EMA, with α from the cutoff), which slightly increases motion smear (Speculative, inferred from the longer latencies).

**Presbyopia-like loss of accommodation**
- Findings: young dogs accommodate 2–3 D (up to 4 D in some sources). Lens hardening with nuclear sclerosis should reduce this. No canine age-accommodation curve was found. **Speculative** magnitude.
- Shader: A_max(a) = 2.5 D × (1 − smoothstep(0.4, 0.9, a)), with a floor of 0.5 D. Near objects (below about 0.5–1 m) become blurred in seniors.

**Corneal endothelial degeneration**
- Findings:
  - Endothelial cell density: about 2,500 cells/mm² in young dogs, falling to 1,900–2,100 by about 9 years. Decompensation (edema) occurs at 500–800 cells/mm².
  - Predisposed breeds: Boston terrier (onset 5–9 years), Chihuahua and dachshund (8–13 years).
  - Sources: Ollivier 2019; Wikipedia's article on canine corneal dystrophies, citing Bjerk 2004 and Gelatt.
- Confidence: Probable.
- Shader: once the predisposed-breed flag is set and onset is reached, add a global haze rising 0 → 0.7 over 1–3 years, plus a mild blue-grey tint, coloured halos around point lights, and blur σ += 1–2°.

**Lipid corneal deposits (lipid keratopathy, arcus)**
- Findings: arcus and lipid keratopathy occur in older dogs, often with hypothyroidism or hyperlipidaemia. Typically peripheral, crystalline and minimally visual. I found no verified numeric source. **Probable** (qualitative).
- Shader: a faint bright ring or patches at the field periphery, opacity 0.05–0.15, with a sparkle scatter term.

**Cognitive dysfunction (CDS)**
- Findings:
  - Neilson et al. (2001, JAVMA 218:1787–1791), as cited in a VIN summary: at 11–12 years, 28% of dogs show at least one category of signs (10% show two or more); at 15–16 years, 68% (36% two or more).
  - Salvin et al.: overall prevalence 14.2%, rising to 41% in dogs over 14.
  - Signs include disorientation and altered responses to stimuli. Sensory decline must be ruled out, and the two often coexist.
  - No study has quantified how CDS changes visual perception.
- Confidence: Established for prevalence; Speculative for any perceptual effect.
- Shader: not an optical effect. A simulation might add, as an optional, labelled "experiential" layer:
  - lower salience of peripheral objects, for example by reducing peripheral contrast after attention
  - slower recognition: a delayed fade-in of newly appearing objects
  - occasional "freezing" or desaturation
  - Keep it off by default and clearly separate from the optics.

#### B4. Age timeline summary (medium breed L ≈ 12.5 years; giant L ≈ 7; toy L ≈ 14)

| Phase | Medium (years) | Giant (years) | Toy (years) | Fraction a = age/L | Dominant changes |
|---|---|---|---|---|---|
| Lids closed | 0–2 weeks | same | same | n/a | Blind, diffuse light only |
| Retinal maturation | 2–7 weeks | same | same | n/a | ERG adult-like by 7 weeks |
| Visual-behaviour maturation | 2–4 months | same | same | n/a | Menace response; tapetum reaches adult colour |
| Young adult | 0.5–4 | 0.5–2.5 | 0.5–4.5 | 0.04–0.32 | Baseline; dim-light decline may begin at about 2.5 years (Rogers) |
| Middle age | 4–7 | 2.5–4 | 4.5–8 | 0.32–0.55 | NS begins; ERG down about 10–20%; SARDS window; glaucoma onset (6–7 years) |
| Senior | 7–10 | 4–5.5 | 8–11 | 0.55–0.8 | NS moderate; C50 for cataract; iris atrophy; accommodation loss; KCS; endothelial degeneration (Boston terrier) |
| Geriatric | more than 10 | more than 5.5 | more than 11 | more than 0.8 | Lens opacity in all dogs over about 13.5 years (scaled); ERG down 30–40%; slow adaptation; CDS (28% at 11–12 years, 68% at 15–16) |

Giant- and toy-breed ages are scaled by lifespan. Williams' cataract–longevity correlation (r = 0.74) supports this for the lens; it is Speculative for the retina.

---

### Part C: Plausible inferences and labelled speculation

1. **Pugs may be good at central detail but poor at peripheral motion; sighthounds the reverse.** This is inferred from the RGC topography alone (Speculative). The ganglion-cell data are solid, but behavioural confirmation is absent. Gácsi et al. (2009) found that brachycephalic dogs followed human pointing better, which fits an area-centralis-dominant retina, but the authors do not claim that the retina explains it.
2. **Exophthalmic brachycephalic eyes probably receive more stray light,** because more of the cornea is exposed and there is less brow shading. That would add a small glare increase even before any pathology (Speculative, about 1.2×).
3. **A small tapetum in small breeds (88% versus 99%) suggests slightly worse dim-light vision in toy breeds.** Speculative in effect size.
4. **Merle-related subalbinism combined with nuclear sclerosis in old age** should compound glare multiplicatively, since both scale scatter. Modelling the glare multipliers as a product is reasonable.
5. **Nuclear sclerosis "blue haze" seen by owners is not what the dog sees.** The examiner sees back-scatter, while the dog experiences forward scatter: mild veiling glare and contrast loss. So do not tint the dog's view blue (Probable, from optics).
6. **Myopia in German shepherds and Rottweilers is around −1 to −2 D** at most for most affected dogs (Speculative magnitude). At a dog's natural acuity of about 20/75, −1 D is a modest additional loss at distance. It matters more for detecting far-off stationary objects than for moving ones.
7. **Dim-light vision declines earliest** (owner reports at about 2.5 years; dark-adapted ERG falls faster). A shader should apply age penalties more strongly in its scotopic branch.

---

### Part D: Proposed parameter model

Inputs: `skull` (cephalic index, CI, or a category), `breed` (for disease flags and refraction presets), `coat` (merle Mm/MM, dilute, white), `iris` (blue/brown per eye), `age_years`, `lifespan_L` (from a breed table or bodyweight), plus optional disease flags with severity.

```text
# --- Derived scalars ---
a      = age_years / L                       # normalised age
s      = clamp((80 - CI) / 30, 0, 1)         # streak strength: 1 = sighthound, 0 = pug (CI anchors Speculative)

# --- Field geometry ---
F_total  = lerp(200, 270, s)   # deg (popular figures; unverified)
B_overlap = lerp(60, 30, s)    # deg
nose_mask_width = lerp(3, 22, s)  # deg, soft, blurred

# --- Acuity map (adult) ---
sigma_h = lerp(15, 45, s); sigma_v = lerp(15, 10, s)   # deg falloff widths
base_blur_deg = 0.12           # about 20/75 equivalent at the peak (tune against the species pipeline)

# --- Development (puppy) ---
t_w = age_years * 52
if t_w < 2:  output = luminance_blur(10deg) * eyelid_tint * 0.03
alpha_dev = smoothstep(2,7,t_w) * smoothstep(4,14,t_w)
blur *= 1/max(alpha_dev,0.1); contrast *= 0.3+0.7*alpha_dev

# --- Lens ---
NS  = smoothstep(0.45, 0.85, a)
cat = sigmoid((a - 0.75)/0.12) * breed_cataract_mult   # mult about 2-4 for poodle, bichon, Boston terrier, Havanese (prevalence about 7x mixed-breed)
glare_lens   = 0.15*NS + 1.0*cat
contrast    *= (1 - 0.10*NS) * (1 - 0.5*cat)
blur_deg    += 0.15*NS + 2.5*max(0,cat-0.3)
blue_gain   *= 1 - 0.15*NS                           # Speculative
myopic_shift = -1.75 D with p = lerp(0.07,0.30,NS)   # Francis 2024

# --- Refraction / accommodation ---
dD_breed  = {Rott, GSD, MiniSchn, ToyPoodle: -1.0; AusShep, Malamute, Bouvier: +0.75; else 0} ± N(0,0.5)
A_max     = 2.5 * (1 - smoothstep(0.4,0.9,a)) + 0.5
defocus_rad(px) = pupil_m * |dD_eye - 1/depth_m + clamp(accom,0,A_max)|

# --- Pupil / iris ---
iris_atrophy = breed_flag ? smoothstep(0.5,0.9,a) : 0.3*smoothstep(0.6,1.0,a)
d_min' = d_min + 0.6*iris_atrophy*(d_max-d_min); tau_pupil *= 1+3*iris_atrophy
glare_pupil ∝ (d/d_ref)^2

# --- Pigment / tapetum ---
P = pigment (1 normal, 0.5 blue iris / Mm, 0.2 subalbinotic / MM)
T = tapetum (1 full; small breeds 0.88; absent 0)
glare_total = k * (1 + 2*(1-P)) * (1 + glare_lens) * glare_pupil * (brachy ? 1.2 : 1)
scotopic_gain = (0.6 + 0.4*T) * R_scot

# --- Retina ---
R_phot = clamp(1 - 0.028*(age_years*12.5/L - 1), 0.2, 1)
R_scot = clamp(1 - 0.035*(age_years*12.5/L - 1), 0.1, 1)
tau_dark *= 1 + 1.5*max(0, a-0.4)
temporal_cutoff_Hz = lerp(75, 58, smoothstep(0.5,1.0,a))

# --- Ocular surface ---
tear_haze = base(brachy? 0.1:0.03) + 0.03*max(0,age_years-6) + KCS_flag*0.2
PK_overlay(severity) on medial field edges (pug default: mild-moderate, p=0.92)
endothelial_haze for Boston terrier >5 yrs, Chihuahua/dachshund >8 yrs: ramp 0 to 0.7 over 2 yrs

# --- Disease progress overlays (p in [0,1]) ---
PRA(p), SARDS(p, fast), glaucoma(p: halos then field constriction),
CEA coloboma scotoma, MM microphthalmia presets
```

**Order of shader passes**
1. Geometry: field warp, binocular compositing and occlusion masks.
2. Optics: defocus PSF from pupil and refraction; lens and cornea scatter (veiling glare and bloom); haze; PK and edema overlays; spectral lens filter.
3. Retina: dichromatic transform (from the species pipeline); eccentricity acuity map; gain, contrast and noise by light level; disease field masks.
4. Temporal: pupil and dark-adaptation dynamics; temporal low-pass; floaters.
5. Optional cognitive layer, labelled as speculative.

---

### References

**Verified** (abstract, full text or a faithful summary read during this research)

1. McGreevy P, Grassi TD, Harman AM. A strong correlation exists between the distribution of retinal ganglion cells and nose length in the dog. *Brain Behav Evol.* 2004;63(1):13–22 (online 2003). doi:10.1159/000073756.
2. Byosiere S-E, Chouinard PA, Howell TJ, Bennett PC. What do dogs (*Canis familiaris*) see? A review of vision in dogs and implications for cognition research. *Psychon Bull Rev.* 2018;25:1798–1813. doi:10.3758/s13423-017-1404-7.
3. Miller PE. Vision in animals: what do dogs and cats see? (VIN proceedings, summarising Miller PE, Murphy CJ. Vision in dogs. *JAVMA* 1995;207(12):1623–1634). https://www.vin.com/doc/?id=3844144. The JAVMA original was confirmed as a citation; its full text was not read.
4. Kubai MA, Bentley E, Miller PE, Mutti DO, Murphy CJ. Refractive states of eyes and association between ametropia and breed in dogs. *Am J Vet Res.* 2008;69(7):946–951. Verified through a university summary (vetsurgeon.org) and the reference list in Balicka 2023; the diopter values are unverified.
5. Murphy CJ, Zadnik K, Mannis MJ. Myopia and refractive error in dogs. *Invest Ophthalmol Vis Sci.* 1992;33(8):2459–2463. Verified as a citation. The breed percentages come from a secondary summary (P. McConnell blog) and are treated as Probable.
6. Balicka A, Zwolska J, Szadkowski M, Trbolova A, Balicki I. Refractive errors in mixed breed dogs of different ages. *Vet Med (Praha).* 2023;68(1):11–16. doi:10.17221/106/2021-VETMED.
7. Francis JM, Mowat FM, Ludwig A, Hicks JM, Pumphrey SA. Quantifying refractive error in companion dogs with and without nuclear sclerosis: 229 eyes from 118 dogs. *Vet Ophthalmol.* 2024;27(1):70–78. doi:10.1111/vop.13163.
8. O'Neill DG, Lee MM, Brodbelt DC, Church DB, Sanchez RF. Corneal ulcerative disease in dogs under primary veterinary care in England: epidemiology and clinical management. *Canine Genet Epidemiol.* 2017;4:5. doi:10.1186/s40575-017-0045-5.
9. Maini S, Everson R, Dawson C, Chang YM, Hartley C, Sanchez RF. Pigmentary keratitis in pugs in the United Kingdom: prevalence and associated features. *BMC Vet Res.* 2019;15:384. doi:10.1186/s12917-019-2127-y.
10. Sanchez RF, et al. (VetCompass). Keratoconjunctivitis sicca in dogs under primary veterinary care in the UK. *J Small Anim Pract.* 2021. doi:10.1111/jsap.13382. Verified through the Vet Times report; the full author list and title were not read.
11. Granar MIKS, Nilsson BR, Hamberg-Nyström HL. Normal color variations of the canine ocular fundus, a retrospective study in Swedish dogs. *Acta Vet Scand.* 2011;53:13. doi:10.1186/1751-0147-53-13.
12. Strain GM, Clark LA, Wahl JM, Turner AE, Murphy KE. Prevalence of deafness in dogs heterozygous or homozygous for the merle allele. *J Vet Intern Med.* 2009;23(2):282–286. doi:10.1111/j.1939-1676.2008.0257.x.
13. Hédan B, Corre S, Hitte C, et al. Coat colour in dogs: identification of the merle locus in the Australian shepherd breed. *BMC Vet Res.* 2006;2:9. doi:10.1186/1746-6148-2-9.
14. Gelatt KN, Powell NG, Huston K. Inheritance of microphthalmia with coloboma in the Australian shepherd dog. *Am J Vet Res.* 1981;42:1686–1690. Verified as a citation inside Hédan 2006; not read.
15. Gelatt KN, MacKay EO. Prevalence of the breed-related glaucomas in pure-bred dogs in North America. *Vet Ophthalmol.* 2004;7(2):97–111. Numbers via vetcontact.com.
16. Gelatt KN, MacKay EO. Prevalence of primary breed-related cataracts in the dog in North America. *Vet Ophthalmol.* 2005;8(2):101–111. Numbers via vetcontact.com and the Institute of Canine Biology.
17. Williams DL, Heath MF, Wallis C. Prevalence of canine cataract: preliminary results of a cross-sectional study. *Vet Ophthalmol.* 2004;7(1):29–35. doi:10.1111/j.1463-5224.2004.00317.x.
18. Mellersh CS. The genetics of eye disorders in the dog. *Canine Genet Epidemiol.* 2014;1:3. doi:10.1186/2052-6687-1-3.
19. Auten CR, Thomasy SM, Kass PH, Good KL, Hollingsworth SR, Maggs DJ. Cofactors associated with sudden acquired retinal degeneration syndrome: 151 dogs within a reference population. *Vet Ophthalmol.* 2018;21(3):264–272. doi:10.1111/vop.12504.
20. Thomasy SM. Sudden acquired retinal degeneration syndrome (SARDS) in animals. *MSD Veterinary Manual* (2024).
21. Salzman MM, Merten N, Panek WK, et al., Mowat FM. Age-associated changes in electroretinography measures in companion dogs. *Doc Ophthalmol.* 2023;147(1):15–28. doi:10.1007/s10633-023-09938-7.
22. Rogers CM, Salzman MM, Li Z, Merten N, Russell LJ, Lillesand HK, Mowat FM. Subjective vision assessment in companion dogs using dogVLQ demonstrates age-associated visual dysfunction. *Front Vet Sci.* 2023;10:1244518. doi:10.3389/fvets.2023.1244518.
23. Kuse H. Postnatal development of the visual system in beagles as examined by funduscopy and electrophysiological examination. *Animal Eye Research.* 1990;9(1–2):33–38. doi:10.11254/jscvo.9.33.
24. Tuntivanich N, Petersen-Jones SM. Correlation between retinal morphological development and development of the electroretinogram in the dog. *WSAVA World Congress Proceedings*, 2003 (VIN).
25. Ollivier F. Ocular diseases in old dogs and cats. *WSAVA Congress Proceedings*, 2019 (VIN id 9382996).
26. O'Neill DG, Church DB, McGreevy PD, Thomson PC, Brodbelt DC. Longevity and mortality of owned dogs in England. *Vet J.* 2013;198(3):638–643. doi:10.1016/j.tvjl.2013.09.020.
27. Hamzianpour N. Bilateral mydriasis in a senior neutered toy poodle. *Vet Times*, 10 April 2017.
28. Lynch G. Vision in domestic animals (proceedings). *dvm360*, 2008.
29. Cook C. How well does Fido see? *CRS Today*, 2008.
30. Pediatric ophthalmology (proceedings). *dvm360* (author not captured).
31. VIN lens-disease notes, "Diseases of the lens in dogs and cats" (vin.com/doc/?id=3852262; author not captured).
32. MSD Veterinary Manual. Ophthalmology: lens.
33. Kador PF, Wyman M. Asteroid hyalosis: pathogenesis and prospects for prevention. *Eye.* 2008;22:1278–1285. doi:10.1038/eye.2008.35.
34. Landsberg G, et al. VIN summary of canine cognitive dysfunction prevalence, citing Neilson JC, Hart BL, Cliff KD, Ruehl WW. Prevalence of behavioral changes associated with age-related cognitive impairment in dogs. *JAVMA.* 2001;218(11):1787–1791. The Neilson numbers were verified through the summary; the VIN author was not captured.

**Unverified** (named in the task or recalled, but not opened)

- Peichl L. Topography of ganglion cells in the dog and wolf retina. *J Comp Neurol.* 1992;324(4):603–620. doi:10.1002/cne.903240412. The citation is confirmed by search results; its density numbers come from Miller (VIN).
- Packer RMA, Hendricks A, Burn CC. Impact of facial conformation on canine health: corneal ulceration. *PLoS ONE.* 2015;10(5):e0123827. Specific odds ratios not read.
- Gough A, Thomas A (and later O'Neill). *Breed Predispositions to Disease in Dogs and Cats.* Wiley-Blackwell (2nd ed. 2010; 3rd ed. 2018).
- Gelatt KN (ed.). *Veterinary Ophthalmology.* Wiley-Blackwell (5th/6th ed.).
- Williams DL. "Lens and lens changes in older dogs" (title as given in the task; not found). A related review may exist: Williams DL, major ocular changes in older dogs, *Vet Clin North Am Small Anim Pract.*
- Mowat FM, Petersen-Jones SM, Williamson H, et al. Topographical characterization of cone photoreceptors and the area centralis of the canine retina. *Mol Vis.* 2008;14:2518–2527. Cited via Byosiere 2018.
- Gácsi M, McGreevy P, Kara E, Miklósi Á. Effects of selection for cooperation and attention in dogs. *Behav Brain Funct.* 2009;5:31. Cited via Byosiere 2018.
- Douglas RH, Jeffery G. The spectral transmission of ocular media suggests ultraviolet sensitivity is widespread among mammals. *Proc R Soc B.* 2014;281:20132995. The dog lens transmission data could not be accessed.
- Gilger BC. Diagnosis and treatment of ocular fundus disorders of geriatric dogs. *NAVC Proceedings*, 2006. Source of the collie eye anomaly 80–85% figure, via Wikipedia.
- Bjerk E. Ocular disease of the aging dog. *WSAVA Proceedings*, 2004. Source of the endothelial-dystrophy onset ages, via Wikipedia.
- Salvin HE, et al. (2010) on cognitive dysfunction prevalence, cited via VIN.
- Popular visual-field figures by skull type (about 200° / 240° / 270°): no primary source located.


---


# Part III: Eye conditions, shader recipes and photo detectability

Research notes for (1) a shader that simulates how a dog with given eye conditions sees, and (2) a later pipeline that detects conditions from a macro smartphone photo of a dog's eye and sets the shader's parameters from them.

> **IMPORTANT CAVEAT.** Photo-based detection is **not a veterinary diagnosis**. An external photo cannot measure tear production, intraocular pressure, retinal function or fundus appearance. Many sight-threatening conditions (glaucoma, uveitis, lens luxation, deep ulcers, SARDS, retinal detachment) are **emergencies** whose external signs overlap with harmless ones. Any detector output must be shown as "possible visible sign of X, see a veterinarian (ideally a veterinary ophthalmologist)". It must never be shown as a diagnosis or a reason to delay care. The shader output is an **illustrative approximation**, not a measured percept. No psychophysical data exist for most of these conditions in dogs, so most parameter ranges below are engineering estimates. They are calibrated to the clinical descriptions and to human analogues, and are labelled as such.

### How to read this document

- **Confidence labels.** *Established* means stated in a veterinary reference or a peer-reviewed paper that was fetched and read in this session. *Probable* means standard veterinary-ophthalmology teaching that is consistent across sources, but whose exact figure was not verified in this session. *Speculative* means an engineering or human-analogy extrapolation, which includes nearly all shader numbers.
- **Citation status.** `[V]` marks a source fetched and checked in this session. `[unverified]` marks a source cited from background knowledge that was not re-checked. Check `[unverified]` sources before relying on them.
- **Severity `s ∈ [0,1]`.** Every recipe takes a severity scalar. 0 means no effect and 1 means the worst clinically plausible state. All parameters are functions of `s`. Unless stated, interpolation is `p(s) = p0 + (p1 - p0) * s^γ`, with γ given where it matters.
- **Image-space conventions.** `r` is the normalized radial distance from the fixation centre, 0 at the centre and 1 at the image half-diagonal. A field-of-view mapping is suggested in §0.

---

### 0. Baseline: normal canine vision (apply before any condition)

This layer belongs in the "healthy dog" render. Conditions stack on top of it.

| Property | Value | Shader implication | Confidence / source |
|---|---|---|---|
| Visual acuity | ~20/75 Snellen (about 4x worse than an emmetropic human 20/20 viewing at 75 ft) | Low-pass: Gaussian blur sigma ≈ 1.5–2.5 px per 1000 px of width at a typical display FOV, or a frequency cutoff at ~0.27x human | Established: Miller 2001 [V]; Miller & Murphy 1995 [unverified, PubMed blocked] |
| Total visual field | ~240° (human ~180°); monocular 135–150°; binocular overlap 30–60° | A wide-FOV/fisheye reprojection is optional. Stereo/depth cues are weaker in the periphery | Established: Miller 2001 [V] |
| Colour | Dichromat; cone peaks ~429–435 nm and ~555 nm; neutral point ~480 nm | Apply a deuteranope-like dichromat simulation (Brettel/Viénot/Machado), tuned so blue-green ~480 nm maps to grey | Established: Miller 2001 [V]; Neitz, Geist & Jacobs 1989 [unverified] |
| Flicker fusion | ~70–80+ Hz | Irrelevant for stills. For video, KCS flicker effects can run at real-time rates | Established: Miller 2001 [V] |
| Accommodation | ~2–3 D (near point ~33–50 cm) | Depth-dependent blur for objects < 0.5 m when depth is available | Established: Miller 2001 [V] |
| Low-light | Rod-rich retina plus tapetum lucidum, so better scotopic sensitivity than humans | "Night gain" multiplier > 1 in dark scenes (suggest 1.5–3x on luminance below a threshold, with added noise). Retinal diseases *reduce* this | Probable: Miller 2001 [V, qualitative] |
| Motion sensitivity | Moving targets recognized at much greater distances than stationary ones | Optional | Established: Miller 2001 [V] |

The baseline FOV mapping for field masks assumes the rendered image spans about 120° horizontally (the central part of the dog's field). Then `r = 1` ≈ 60–70° eccentricity. Tunnel-vision radii below are given in degrees and should be converted with the actual camera FOV.

---

### 1. Lens

#### 1.1 Cataract (incipient → immature → mature → hypermature; including diabetic)

1. **What / onset / breeds / progression.** Any opacity of the lens. Cataracts are "the most common cause of blindness in dogs" (Capuzzi 2005 [V]).
   - **Stages:**
     - *Incipient:* < 10–15% of the lens; vision not affected.
     - *Immature:* 15–99%; vision variably affected and the fundus partly obscured.
     - *Mature:* complete opacity; tapetal reflex lost; functionally blind in that eye.
     - *Hypermature:* lens protein liquefies; the capsule wrinkles, refractile crystals appear, and partial return of the tapetal reflex is possible; lens-induced uveitis; increased risk of retinal detachment.

     Sources: Capuzzi 2005 [V]; Gould 2002 via Wikipedia [V for the summary]. Merck classifies by the same four stages without percentages [V].
   - **Onset categories:** congenital, juvenile (< 6 y), senile.
   - **Hereditary:** HSF4 mutation in Boston Terrier, Staffordshire Bull Terrier and Australian Shepherd [Probable].
   - **Breeds:** many predisposed (Cocker Spaniel, Poodles, Bichon Frise, Siberian Husky, Labrador and Golden Retrievers, Miniature Schnauzer, Boston Terrier) [Probable].
   - **Diabetic cataract:** occurs in > 85% of diabetic dogs regardless of glycaemic control (Merck [V]). Development is fast, often weeks, with intumescence and possible capsule rupture causing severe uveitis (Merck [V]). Beam et al. 1999 (200 cases): 50% by ~170 days after DM diagnosis, 75% by ~370 days. This is as reported in Williams 2017 [V]; the primary paper itself was not read.
   - **Secondary:** PRA-associated (§4.1), uveitis, trauma, and hypermature-stage complications.
2. **Effect on vision.**
   - Light scatter → **diffuse contrast loss and veiling glare**, worst with bright lights and small pupils.
   - Location depends on cataract type:
     - *Nuclear and posterior subcapsular:* central, so worse in bright light because the pupil constricts.
     - *Cortical/equatorial "spokes":* begin peripherally and spare the central axis early.
   - Mature cataract: light perception only; the dog can still detect light/dark and large motion (Probable).
   - Vision loss "does not always correlate well" with the visible opacity (Capuzzi 2005 [V]).
   - A surgical guideline quoted there: surgery when vision loss seems > 40% (Colitz, quoted in Capuzzi 2005 [V]).
3. **Shader recipe** (s = fraction of the visual axis opacified; map stage→s: incipient 0.05–0.15, immature 0.15–0.85, mature 0.9–1.0, hypermature 0.85–0.95).
   - **Veiling luminance (haze):** `out = mix(img, hazeColor, h)` with `h = 0.05 + 0.85*s^1.3`. `hazeColor` = scene mean luminance plus a slight warm-white bias (cataract scatter is roughly white; senile nuclear components slightly yellow-brown: tint (1.0, 0.96, 0.88)).
   - **Contrast loss:** contrast multiplier `c = 1 - 0.9*s` around the local mean.
   - **Blur:** Gaussian sigma = `0.5% → 4%` of image width (σ = 0.005W + 0.035W·s^1.5). At s > 0.9, use σ ≥ 6% W so only blobs of light and dark survive.
   - **Bloom/glare:** threshold-based bloom on highlights with radius 3–15% W, intensity `0.2 + 1.5*s`. Add a wide-angle glare skirt (PSF ∝ 1/θ²) for point lights.
   - **Spatial mask by type:** for `type="cortical"`, modulate haze with a radial-spoke mask (8–16 wedges, angular noise) whose inner radius shrinks from r = 0.8 to r = 0 as s goes 0 → 0.7. For `type="nuclear"` or `"posterior_subcapsular"`, use a central Gaussian blob of radius 0.3–0.6 at full strength.
   - **Pupil coupling:** if a scene-luminance input exists, increase central opacity weight in bright scenes (constricted pupil) and decrease it in dim ones.
   - **Hypermature:** add sparkle (sparse bright refractile specks, 0.1–0.5% of pixels, slight twinkle) and allow slight clearing (s_eff = s − 0.1) in random patches.
   - All numbers are Speculative.
4. **Photo identifiability:** **Yes, for immature, mature and hypermature. Partly, for incipient.**
   - **Signs:** white, grey-white or blue-white opacity within the pupil. Cortical spokes or vacuoles. Crystalline glitter (hypermature). Wrinkled capsule. Possible concurrent uveitis signs.
   - **Flash / retro-illumination helps a lot.** A flash photo along the camera axis produces the tapetal reflex ("eyeshine"). Cataract appears as **dark (brown or black) opacities silhouetted against the reflex**. A mature cataract shows **no reflex** (Capuzzi 2005 [V]; Merck: retroillumination of the tapetal fundus, ideally through a dilated pupil [V]). Recommend capturing two images: no-flash diffuse, and flash retro-illumination taken from about 30–50 cm (the "distant direct" geometry) before the macro shot.
   - **Confounders:**
     - Nuclear sclerosis (§1.2) is the main one: the tapetal reflex is visible through NS.
     - Corneal opacities (edema, dystrophy, scars) sit at a different depth. Parallax across two viewpoints helps tell them apart.
     - Specular reflections of the flash.
     - Variable pupil size: a small pupil hides peripheral cortical cataract.
     - Lens luxation (aphakic crescent).
     - Asteroid hyalosis (behind the lens).
   - **Not measurable from a photo:** % opacity precisely, retinal function behind the cataract (needs ERG/ultrasound before surgery), and lens-induced uveitis (needs tonometry and slit lamp).
5. **Confidence:** stage definitions Established; diabetic figures Established (secondary report of Beam 1999); shader numbers Speculative.

#### 1.2 Nuclear (lenticular) sclerosis

1. **What / onset.** Normal age-related compression and densification of the lens nucleus (Merck [V]). It becomes apparent from about **7 years** of age, and is bilateral and symmetric (Capuzzi 2005 [V]). Appearance: a central, circular, pearly grey-blue haze (Merck [V]; Capuzzi [V]). It progresses slowly over years.
2. **Effect on vision.** Generally does **not significantly impair** vision (Capuzzi [V]). It may cause mild myopic shift and reduced near-vision quality. Francis et al. 2024: myopia > 1.5 D in 6.9% (grade 0), 13.2% (grade 1), 22.8% (grade 2) and 30.4% (grade 3) of eyes. This is a significant but "weak" association, and NS is associated with visual deficits in some dogs [V].
3. **Shader recipe** (s = NS grade/3):
   - Mild global blur σ = 0.2–1.0% W.
   - Contrast loss of 0–15%.
   - Slight yellowing tint (blue channel ×(1 − 0.1s)).
   - Small bloom increase on lights (+0–30%).
   - Optional distance-dependent blur (myopic: far objects blurrier).
   - Keep effects small. Speculative.
4. **Photo identifiability: Partly (visible, but confusable).**
   - **Signs:** homogeneous, centred blue-grey haze with a sharp-ish circular edge in both eyes.
   - **Key discriminator:** with flash retro-illumination, the **tapetal reflex passes through NS** and the nucleus edge may show as a faint ring. Cataract **blocks** the reflex (Capuzzi [V]).
   - An ML model that sees only the no-flash image will confuse NS with cataract. The AI Hub dataset includes NS as its own class (§ML), and Jeon et al. 2025 reported cataract as the hardest class (~82–84% class accuracy) [V].
5. **Confidence:** Established (clinical); shader Speculative.

#### 1.3 Lens luxation / subluxation

1. **What / onset / breeds.** Displacement of the lens.
   - **Primary lens luxation (PLL):** autosomal recessive **ADAMTS17** mutation. Typical onset **3–8 years**. Often one eye first, then the other.
   - **PLL breeds:** many terriers (Jack Russell, Miniature Bull, Parson Russell, Fox, Sealyham, Tibetan), Chinese Crested, Australian Cattle Dog, Lancashire Heeler, Italian Greyhound and others (UC Davis VGL [V]; Merck [V]).
   - **Secondary causes:** glaucoma (buphthalmos stretches the zonules), cataract, uveitis, trauma.
   - **Anterior luxation** often causes corneal edema and acute secondary glaucoma. It is an emergency. **Posterior luxation** may be relatively asymptomatic (Merck [V]).
2. **Effect on vision.**
   - *Subluxation:* the lens edge sits inside the pupil, so the eye looks through a phakic part (lens power) and an **aphakic crescent** (no lens: severe hyperopia, about +14 D in dogs [Probable/unverified figure]). The result is **monocular diplopia/ghosting** with one sharp-ish and one very blurred image, plus edge glare.
   - *Phacodonesis:* lens wobble during eye movement gives a time-varying image.
   - *Total luxation (aphakic eye):* globally out of focus.
   - *Anterior luxation:* adds the glaucoma (§3.1) and corneal edema (§2.4) effects.
3. **Shader recipe** (s = displacement 0–1; direction θ = luxation direction):
   - **Double image:** `out = mix(img_sharp, blur(img, σ_aph), w)`. Here `σ_aph` = 3–8% W, `w = 0.15 + 0.5*s` for the aphakic portion, and the ghost is offset 1–4% W along θ.
   - Apply only inside a crescent-shaped region of the *pupil aperture*. In image space this is a global ghost, not a region.
   - Edge glare streaks oriented along θ.
   - **Wobble:** for video, jitter the ghost offset with a 2–6 Hz damped oscillation after simulated head motion (amplitude 0.2–1% W).
   - At s = 1 (complete posterior luxation), the whole image is blurred with σ = 5–8% W and haze 0.1.
   - For anterior luxation, chain glaucoma and corneal edema at s ≥ 0.6.
   - Speculative.
4. **Photo identifiability: Partly.**
   - **Signs:** **aphakic crescent**, a dark crescent between the lens edge and the pupil margin. It glows with flash retro-illumination because the tapetal reflex is unobstructed there, which makes it highly diagnostic in a flash photo.
   - Lens visible in the anterior chamber, in front of the iris. Abnormal anterior chamber depth. Corneal edema (sometimes central, where the lens touches the endothelium).
   - **Iridodonesis/phacodonesis** (trembling iris or lens) needs **video**.
   - Posterior luxation may show only a deep chamber and the aphakic crescent.
   - **Requires a vet** for confirmation (slit lamp), IOP (tonometry) and ultrasound.
5. **Confidence:** Established (clinical, PLL genetics); diplopia mechanism Probable; shader Speculative.

---

### 2. Cornea and tear film

#### 2.1 Keratoconjunctivitis sicca (KCS, dry eye)

1. **What / onset / breeds.** Deficiency of the aqueous tear film.
   - **Causes:** most often immune-mediated adenitis; also drug-induced (sulfonamides), neurogenic, iatrogenic (removal of the third-eyelid gland), endocrine.
   - **Breeds:** Cavalier King Charles Spaniel, English Bulldog, Lhasa Apso, Shih Tzu, West Highland White Terrier, Pug and English Cocker Spaniel. Four of these breeds accounted for 58% of cases in a UK referral study (Oliver 2008 [V]).
   - **Onset:** typically middle-aged.
   - **Course:** chronic and progressive without treatment, leading to corneal vascularization and pigmentation and possible blindness. The acute form causes painful ulceration (Oliver 2008 [V]).
   - **Schirmer Tear Test I (STT-1):**
     - ≥ 15 mm/min: normal.
     - 11–14 mm/min: early or subclinical KCS.
     - 6–10 mm/min: mild to moderate KCS.
     - ≤ 5 mm/min: severe KCS.

     Source: Oliver 2008 [V]. Normal values of 15–20 mm/min; older dogs can read < 15 without disease (Gionfriddo 2010 [V]). Dogs reading 0–1 respond less reliably to cyclosporine (Oliver 2008 [V]).
   - **Tear film break-up time (TBUT):** normal ~20 ± 5 s in dogs (Oliver 2008 [V]).
2. **Effect on vision.**
   - The irregular tear film is the eye's first refractive surface, so it gives **fluctuating blur that worsens between blinks**, plus glare. Mucus strands smear across the cornea.
   - *Chronic:* secondary **pigmentary keratitis and vascularization** cause **permanent opacity patches**, often starting medially or diffusely.
   - Photophobia and blepharospasm (squinting narrows the field).
3. **Shader recipe** (s mapped from STT: s = clamp((15 − STT)/15, 0, 1); or from visual signs):
   - **Tear-film break-up (time-varying):** after each simulated blink (blink interval 4–10 s), the "clear" state degrades over a break-up time `T_bu = 20s*(1-s) + 1s*s`. Blur grows as a ramp `σ(t) = σ0 + (σmax*s)*smoothstep(0, T_bu, t)` with σmax = 2–4% W. Add **patchy low-frequency distortion**: displace UVs by a slowly evolving noise field (Perlin, 2–5 cycles per image), amplitude 0–1.5% W, appearing as dry spots grow.
   - **Mucus smear:** semi-transparent streaks (anisotropic blurred noise, mostly horizontal, matching the blink direction), alpha 0–0.35, drifting slowly.
   - **Glare:** bloom +0–60%.
   - **Photophobia/squint:** a top and bottom vignette (eyelid-shaped elliptical mask) that closes partly in bright scenes; aperture height 100% → 60% at s = 1.
   - **Chronic sequelae:** if `chronic=true`, chain pigmentary keratitis (§2.2) and corneal vascularization (red-brown semi-opaque patches) with s_pk = 0.5*s.
   - For stills, sample t randomly.
   - Speculative.
4. **Photo identifiability: Partly.**
   - **Signs:** thick yellow-green **mucoid or mucopurulent discharge**. A dull, lustreless or "dry" corneal surface (the flash specular highlight is broken and irregular, not a crisp point). Conjunctival hyperemia. Corneal vascularization and pigment (chronic).
   - **Cue from the flash highlight:** a fragmented or distorted reflection of the light source suggests an irregular tear film. Kim et al. 2022 [V] used reflected-grid break-up in slit-lamp video (YOLOv5, mAP 0.995, precision 0.943, recall 0.995). A smartphone analogue would be an on-screen grid or ring pattern reflected on the cornea, which is a promising research direction but **unvalidated**.
   - **Confounders:** conjunctivitis (allergic, bacterial), entropion, normal brachycephalic eyes.
   - **Requires a vet:** Schirmer test (definitive), TBUT, fluorescein/rose bengal staining. **A photo cannot measure tear production.**
5. **Confidence:** STT thresholds and breeds Established; shader Speculative; photo cues Probable.

#### 2.2 Pigmentary keratitis (PK)

1. **What / breeds.** Melanin deposition in the cornea in response to chronic irritation or inflammation, for example from medial entropion, nasal fold trichiasis, lagophthalmos, macroblepharon or KCS. Some PK may be primary in Pugs.
   - **Prevalence:** very high in **Pugs**. UK prevalence was **91.9% of dogs and 87.8% of eyes**, bilateral in 91.2% (Maini et al. 2019 [V]). Earlier prevalence estimates of 70–82.4% are cited, including Labelle 2013 at 82.4% (via Maini 2019 [V]).
   - **Other breeds:** other brachycephalics (Shih Tzu, Lhasa Apso, Pekingese, French Bulldog) [Probable].
   - **Pattern:** starts in the **medial (nasal) cornea** and spreads centripetally in a wedge or triangle (Maini 2019 [V]).
   - **Grading (Maini 2019):** 12 clock hours, with extra points for reaching or crossing the pupil. Mild 0.5–4.5, moderate 5–9.5, severe 10–14 [V].
   - **Progression:** slowly over years. Lesions can be stable.
2. **Effect on vision.** Patchy **opaque brown or black occluders** in the corneal plane. Because the cornea is far from the retina's focal plane, a corneal pigment patch does not appear as a sharp shape in the image. Instead it **attenuates and veils the part of the field whose rays pass through it**. Medial corneal pigment mainly reduces light from the temporal field and lowers overall contrast. When it covers the visual axis it causes "significant visual impairment and, in severe cases, blindness" (Maini 2019 [V]).
3. **Shader recipe** (s from the Maini score: s = score/14):
   - **Pigment occlusion mask:** a wedge that starts at the nasal side of the "cornea map" and grows toward the centre. Map corneal coordinates to the image with a horizontal flip, because nasal cornea affects the temporal field. Use **heavily blurred** occluders (blur sigma 10–25% W) so they act as soft darkening and haze, not hard shapes.
     - Transmission in covered regions: `T = 1 - 0.95*s_local`.
     - Global light loss = covered area fraction × (1 − T).
   - Dark brown tint inside partially covered regions: multiply by (0.85, 0.75, 0.65) blended by coverage.
   - **Scatter:** contrast loss `0.5*coverage_on_axis`.
   - **Visual-axis crossing:** when the mask crosses the pupil centre (score ≥ ~10), apply global blur σ = 2–6% W, contrast loss of 40–90%, and dimming of 30–80%.
   - Speculative.
4. **Photo identifiability: Yes (good).**
   - **Signs:** brown or black pigment on the cornea, typically medial, with superficial vessels.
   - Clock-hour extent and whether pigment reaches the pupil are directly measurable on a frontal macro photo, so the Maini score can be **approximated from a photo**. This is a strong candidate for regression.
   - **Confounders:**
     - A dark iris seen through clear cornea. Pigment sits *on* the cornea and shows parallax relative to the iris.
     - Limbal pigment that is normal.
     - Corneal sequestrum (cats).
     - Limbal melanoma (raised mass).
   - The AI Hub dataset reportedly includes a pigmentary keratitis class [unverified class list].
5. **Confidence:** Established (Pug prevalence, pattern, grading); shader Speculative.

#### 2.3 Corneal ulcers (superficial, indolent/SCCED, deep, melting, descemetocele)

1. **What / onset / breeds.** Loss of corneal epithelium (superficial) or stroma (deep).
   - **Brachycephalics** are predisposed because of exposure and lagophthalmos.
   - **Indolent ulcers (SCCED):** middle-aged to older dogs, most common in **Boxers**. Non-healing superficial ulcers with a loose epithelial lip (Merck [V]).
   - **Melting ulcers:** proteolytic stroma loss. Surgery is indicated if > 50% of the cornea melts (Merck [V]).
   - **Descemetocele:** an emergency.
   - **Course:** a superficial ulcer heals in about 3–7 days; SCCED takes weeks [Probable]; deep or melting ulcers can perforate within 24–48 h [Probable].
2. **Effect on vision.**
   - Local stromal edema and infiltrate around the ulcer give a **localized haze patch** with irregular refraction (distortion).
   - Severe pain causes **blepharospasm** (eye mostly closed).
   - Tearing (wet blur).
   - Reflex uveitis causes miosis and photophobia.
3. **Shader recipe** (s = area × depth score):
   - **Local haze blob:** blurred heavily as for PK, but whitish or blue-grey (edema) or yellow-white (infiltrate) instead of brown; T = 1 − 0.7s.
   - **Local distortion:** a radial lens-like UV warp around the patch, amplitude 0–2% W.
   - **Tearing wet blur:** dynamic droplet-like refraction or a global σ of 0.5–1.5% W.
   - **Blepharospasm:** eyelid aperture mask closing 0–70%.
   - **Photophobia:** gain reduction in bright scenes plus bloom.
   - **Deep or melting ulcer:** widen the haze to 40–80% of the field and add a yellow tint.
   - Speculative.
4. **Photo identifiability: Partly.**
   - **Visible without stain:** a deep ulcer or descemetocele (crater, often with a clear "dark" centre when Descemet's membrane is exposed). Melting ulcer (grey-gelatinous cornea). Surrounding edema (blue haze). Vascularization. Squinting, tearing, discharge.
   - A superficial ulcer is often invisible without **fluorescein stain**. A smartphone with a blue light plus yellow filter after fluorescein could do it, but that requires stain, so it is effectively a vet tool.
   - **Published:** Kim et al. 2019 classified normal / superficial / deep ulcers from 526 corneal photos (281 dogs), with ResNet/VGG > 90% accuracy [V]. These were clinic photos, many probably with fluorescein. The AI Hub dataset includes ulcerative keratitis (Jeon et al. 2025 [V]).
5. **Confidence:** clinical Established/Probable; shader Speculative.

#### 2.4 Corneal edema

1. **What.** Corneal stromal hydration caused by endothelial failure or epithelial loss.
   - **Causes:** glaucoma, anterior lens luxation, uveitis (perilimbal), endothelial dystrophy/degeneration, ulcers, post-surgical, adenovirus/vaccine reaction ("blue eye").
   - Full-thickness edema forms **epithelial bullae**, which can rupture and ulcerate (Merck [V]).
2. **Effect on vision.** Diffuse light scatter gives **strong haze, halos around lights (rainbow-like rings, as in human corneal edema), contrast loss** and blur. Severity follows thickness. Central or diffuse edema produces the worst effects.
3. **Shader recipe** (s = extent × density):
   - **Haze:** `h = 0.1 + 0.8*s` toward a cool blue-white veil (0.92, 0.96, 1.0).
   - **Halos around bright sources:** a ring kernel with radius 3–8% W and width 0.5–1.5% W. Optional chromatic ring (inner blue/green, outer red); intensity 0.3*s–1.0*s.
   - **Blur:** σ = 0.5–4% W.
   - Contrast loss of 0–80%.
   - For **focal edema** (e.g. endothelial dystrophy starting dorsolateral, per Merck [V]), use a soft spatial mask that grows from that quadrant, flipped to the opposite field side.
   - Speculative.
4. **Photo identifiability: Yes.**
   - **Signs:** milky **blue-grey cloudy cornea** that obscures iris detail. Bullae (blister-like irregular surface highlight).
   - **Confounders:** NS and cataract. Edema lies in front of the iris, so iris details are hazy, whereas lens opacity lies behind the pupil plane with the iris crisp. Corneal dystrophy (more white and crystalline). Scar (well-defined white).
   - **Edema is a red flag** for glaucoma or luxation, so a detector should recommend urgent care.
5. **Confidence:** Established clinical; shader Speculative (human analogue).

#### 2.5 Corneal stromal (lipid) dystrophy / lipid deposits / corneal degeneration

1. **What / breeds.**
   - **Stromal (lipid) dystrophy:** white, irregular, often oval or ring-shaped crystalline deposits. Usually bilateral. Appears inherited in about 20 breeds, most studied in **Siberian Huskies** (Merck [V]). Others are Cavalier King Charles Spaniel, Beagle and Bichon [Probable]. Onset in young adults; slowly progressive or static.
   - **Lipid keratopathy / degeneration:** secondary to hyperlipidemia (hypothyroidism) or inflammation. Often unilateral and peripheral or vascularized [Probable].
2. **Effect on vision.** Usually mild. Paracentral or central deposits cause light scatter (glare, bloom, mild contrast loss). Treatment is rarely needed unless vision is impaired (Merck [V]).
3. **Shader recipe** (s = area on axis):
   - Small soft white veils: a heavily blurred mask with T = 1 − 0.4s.
   - Sparkle/glare: bloom +0–40% and fine scattered specks.
   - Contrast loss of 0–25%.
   - Speculative.
4. **Photo identifiability: Yes.** Sharp-edged white or silver crystalline oval or ring opacity in the central or paracentral cornea, best seen with oblique light. Confounders: corneal scar, calcific degeneration, edema, specular reflection.
5. **Confidence:** Established (Merck); shader Speculative.

#### 2.6 Corneal endothelial dystrophy / degeneration

1. **What / breeds.** Progressive loss of endothelial cells, leading to progressive, painless corneal edema that **starts dorsolateral (temporal) and spreads** over the cornea. Later bullae form, which can rupture into ulcers. Affects older **Boston Terriers** (females more often; mean age ~7.5 y), **Chihuahuas** and **Dachshunds** (Merck [V]). Progression takes months to years. Treatment: hypertonic NaCl 2–5% (palliative), thermokeratoplasty, endothelial keratoplasty.
2. **Effect on vision.** As corneal edema (§2.4): it starts as a peripheral patch, then becomes diffuse haze, halos and blindness when the edema is total.
3. **Shader recipe.** Corneal edema recipe with a spatial mask that grows from the dorsolateral corneal quadrant. That maps to the **ventro-medial (lower nasal) image region**: flip both axes for the corneal-to-field projection. Spread to full at s ≈ 0.7; s > 0.7 increases density. Speculative.
4. **Photo identifiability: Yes.** Blue-grey corneal opacity in an older dog of a predisposed breed, often bilateral but asymmetric, in a quiet (non-red) eye. Confounders as in §2.4. Endothelial cell counts need specular microscopy (a vet instrument).
5. **Confidence:** Established (Merck); shader Speculative.

#### 2.7 Chronic superficial keratitis (CSK, pannus, Überreiter syndrome)

1. **What / breeds / onset.** Immune-mediated, bilateral, progressive, painless keratitis.
   - **Breeds:** German Shepherd Dog (MHC II risk haplotype: 2.7x risk for carriers, 8x for homozygotes), shepherd crosses, Belgian Tervuren, Border Collie, Greyhound/Italian Greyhound, Siberian Husky, Australian Shepherd (Welihozkiy 2017 [V]; Merck [V]).
   - **Onset:** usually 3–5 y. Earlier onset (1–5 y) progresses faster and is harder to control.
   - **Environment:** **UV and high altitude** worsen it.
   - **Course:** lesions start at the **temporal or inferotemporal limbus** as vascularized pink-red tissue, then spread centrally with pigment and lipid edges. Eventually the cornea may be fully vascularized, pigmented and opaque. Lifelong control is needed, not cure (Welihozkiy 2017 [V]).
   - Related: plasmoma (third-eyelid involvement).
2. **Effect on vision.** A progressive peripheral-to-central **opaque, pigmented, vascular veil**. Temporal corneal involvement affects the **nasal (medial) field** first (Probable, optical reasoning). End stage: functional blindness from opaque cornea.
3. **Shader recipe** (s = fraction of cornea covered):
   - **Creeping mask:** starts at the temporal corneal edge (nasal image side after the flip, with some inferior bias), with fringe noise. Front position = 1 − 1.2s in corneal radius units.
   - Inside the mask: transmission `T = 1 - 0.9*s_local`, tint pinkish-brown (0.9, 0.7, 0.65), heavy blur (soft occluder as in PK).
   - Global scatter: contrast loss of 0–70% as the front reaches the axis.
   - **UV coupling (optional):** severity creeps up with a "bright outdoor" scene flag.
   - Speculative.
4. **Photo identifiability: Yes.** Pink fleshy vascularized tissue and brown pigment advancing from the temporal (lateral) limbus, often with a white lipid leading edge. Third eyelid thickened or depigmented (plasmoma). Bilateral. Confounders: PK (medial in brachycephalics, versus temporal in GSD-type breeds), granulation tissue after ulcers, limbal melanoma, squamous cell carcinoma.
5. **Confidence:** Established; shader Speculative.

#### 2.8 Eosinophilic keratitis

1. **What.** Proliferative keratitis with eosinophilic infiltration. **Mainly a feline disease** (associated with FHV-1). Rare in dogs and horses. Canine reports are few [Probable; not verified in this session; Merck cornea page does not mention it [V]].
2. **Effect on vision.** Vascularized white-pink plaques, typically starting temporally or dorsally, cause localized opacity and haze.
3. **Shader recipe.** As CSK (§2.7), with whiter plaques (tint 0.95, 0.9, 0.9) and a lower pigment component. Speculative.
4. **Photo identifiability: Partly.** White-pink raised plaques with "cottage cheese" texture and vascularization. Needs corneal cytology (eosinophils, mast cells) to confirm. Easily confused with CSK, granulation tissue or neoplasia.
5. **Confidence:** Probable/Speculative for dogs (low canine relevance). Consider dropping from the canine model.

---

### 3. Glaucoma and uvea

#### 3.1 Glaucoma

1. **What / IOP / breeds / timeline.**
   - **Definition:** elevated intraocular pressure (IOP) that damages retinal ganglion cells and the optic nerve.
   - **Normal canine IOP:** 18.7 ± 5.5 mmHg (applanation) or 10.8 ± 3.1 mmHg (rebound); "< 20 mmHg" quoted (Merck [V]). The commonly used clinical cutoffs are > 25 mmHg suspicious and > 30 mmHg glaucomatous; acute crises are often 40–70+ mmHg [Probable; cutoff not stated in Merck]. Merck's example acute case: 55 mmHg [V].
   - **Prevalence:** primary and secondary combined in about **1.7%** of the North American canine population. Bilateral primary breed-related glaucoma occurs in nearly 1% of purebreds (Merck [V]).
   - **Breeds:** primary angle-closure in Cocker Spaniels, Basset Hound, Chow Chow, Shar-Pei, Siberian Husky, Samoyed, Jack Russell and others [Probable]. Primary open-angle glaucoma in **Beagles (ADAMTS10)** (Merck [V]); also Norwegian Elkhound and Petit Basset Griffon Vendéen (ADAMTS17) [Probable].
   - **Secondary causes:** uveitis, lens luxation, intraocular tumors, hyphema.
   - **Timeline:** an acute high-pressure attack can cause **irreversible blindness within hours to days** (24–72 h) [Probable]. The second eye of a primary-glaucoma dog is at high risk within months [Probable].
   - **Signs:**
     - Acute: dilated, fixed or sluggish pupil; episcleral and conjunctival venous congestion; **corneal edema**; pain.
     - Chronic: **buphthalmos**, lens displacement, **Descemet's breaks (striae)**, optic disc atrophy and cupping (Merck [V], cupping Probable).
2. **Effect on vision.**
   - In humans, glaucoma causes arcuate and peripheral field loss with the centre spared until late. In dogs, the canine visual streak and the area centralis are affected. Dogs typically present after **rapid, severe loss**, not a slow arcuate pattern (Probable; canine field-loss topography is poorly characterized: Speculative).
   - The acute attack combines **corneal edema** (diffuse haze, **halos around lights**) with ischemic retinal and optic-nerve dysfunction, giving global dimming and contrast loss that can reach total blindness.
   - The chronic pattern gives **peripheral constriction and patchy scotomas**, then blindness.
3. **Shader recipe** (s from IOP if known: s = clamp((IOP − 20)/40, 0, 1); damage d accumulates separately):
   - **Acute pressure component (reversible):** corneal edema recipe (§2.4) with s_edema = s, including **halos** of radius 4–8% W. Global luminance gain `1 - 0.6*s`. Dilated pupil means more glare (bloom +50%·s).
   - **Neural damage component d (irreversible):**
     - Field mask = soft radial vignette (tunnel) with inner radius r_in = 1.0 − 0.9d, plus **patchy arcuate scotomas**: arc-shaped noise masks above and below fixation, opacity 0.5–1.0, appearing at d > 0.2.
     - Contrast sensitivity loss of 0–70%.
     - Colour desaturation of 0–40%.
     - At d → 1: black, with residual light perception (a faint luminance blob, 5%).
   - Buphthalmos (end stage) adds the exposure-keratitis haze.
   - Speculative.
4. **Photo identifiability: Partly (red-flag signs).**
   - **Visible:** **dilated pupil** (anisocoria if unilateral). **Episcleral injection** (thick, straight, deep-red vessels on the sclera). **Diffuse blue corneal edema**. **Enlarged globe (buphthalmos)**: compare eye sizes and look for third-eyelid protrusion; it is quantifiable only relative to the other eye. Descemet's striae (linear grey-white lines). Lens displacement.
   - **Not visible:** **IOP** (needs **tonometry**). Gonioscopy angle status. **Optic nerve cupping** (needs **fundoscopy**). Early glaucoma.
   - **Confounders:** uveitis (red eye but a **small** pupil and *low* IOP), conjunctivitis (superficial, mobile vessels), SARDS or PRA (dilated pupils in a white, quiet eye).
   - **Any red eye + cloudy cornea + dilated pupil → advise emergency veterinary care.**
5. **Confidence:** IOP norms and prevalence Established; clinical signs Established; canine field-loss pattern Speculative; shader Speculative.

#### 3.2 Uveitis (anterior uveitis)

1. **What.** Inflammation of the iris and ciliary body.
   - **Causes:** infectious (Ehrlichia, Leptospira, fungal, Leishmania), immune-mediated, lens-induced (cataract, diabetic), neoplastic (lymphoma), trauma, uveodermatologic syndrome (Akita, Siberian Husky, Samoyed), and pigmentary uveitis in **Golden Retrievers** [Probable].
   - **Signs (Merck [V]):** **miosis**, **aqueous flare**, **low IOP**, photophobia, blepharospasm, iris swelling. Hypopyon, hyphema, keratic precipitates and perilimbal corneal edema are also common [Probable / partial V].
   - **Course:** acute or chronic. Sequelae are synechiae, cataract, glaucoma (a leading cause of secondary glaucoma) and retinal detachment.
2. **Effect on vision.** **Aqueous flare and cells** scatter light (diffuse fog), **miosis** dims the image and deepens the focus, and **photophobia** follows. Fibrin or hypopyon in the inferior chamber obscures part of the pupil (**upper visual field** affected, because the image is inverted). Posterior involvement (vitritis, chorioretinitis) adds floaters and scotomas.
3. **Shader recipe** (s):
   - **Flare fog:** uniform veil h = 0.05–0.5, slightly warm.
   - **Miosis:** global luminance × (1 − 0.4s); slight increase in depth of field.
   - **Photophobia:** in bright scenes, apply a strong bloom and an "aversion" vignette (eyelid squint mask 0–50%).
   - **Floaters (posterior):** a few dark, semi-transparent, drifting blobs or threads; parallax lag behind eye motion; count 0–10.
   - **Hypopyon/fibrin:** a soft mask over the **upper** part of the field with T = 1 − 0.6s.
   - Speculative.
4. **Photo identifiability: Partly.**
   - **Visible:** **red eye with ciliary flush** (perilimbal deep redness). **Small pupil** (miosis, often asymmetric). Cloudy aqueous ("hazy" view of the iris). **Hypopyon** (white fluid level ventrally). **Hyphema**. Darkened, swollen iris (colour change compared with the fellow eye). Keratic precipitates. Corneal edema. Irregular pupil (synechiae).
   - **Requires a vet:** flare (slit lamp, Tyndall effect), tonometry (low IOP), and systemic work-up for the cause.
   - **Confounders:** glaucoma (dilated pupil, high IOP), conjunctivitis, Horner (miosis but quiet eye).
5. **Confidence:** Established (Merck signs); shader Speculative.

#### 3.3 Hyphema

1. **What.** Blood in the anterior chamber. **Causes (Merck [V]):** uveitis, trauma, intraocular neoplasia, retinal detachment/tears, systemic hypertension, coagulopathies, thrombocytopenia, hyperviscosity, congenital anomalies (CEA), neovascularization, glaucoma. Hyphema is a sign that warrants work-up, often for systemic disease.
2. **Effect on vision.** Blood settles ventrally with a fluid level. Dispersed fresh blood or a clot gives a **red-tinted haze**. A ventral layer obscures the lower pupil, which affects the **upper field**. A total ("eight-ball") hyphema means no vision.
3. **Shader recipe** (s = fraction of chamber filled):
   - Red tint multiply (1.0, 0.55 + 0.45(1 − s), 0.5 + 0.5(1 − s)) blended by s.
   - Haze h = 0.1–0.7.
   - Upper-field soft occluder with height = s (as a fraction of the pupil, projected inverted), T = 0.1.
   - At s ≥ 0.9: near-black red glow.
   - Speculative.
4. **Photo identifiability: Yes.** Red (fresh) or dark red-black (clotted) material in the anterior chamber, often with a ventral fluid line. Confounders: iris colour (a red-brown iris), red tapetal reflex in flash photos of non-tapetal (subalbinotic) eyes, and the normal red fundus reflex in blue-eyed or merle dogs. Always advise prompt veterinary care, including a blood-pressure and coagulation work-up.
5. **Confidence:** Established; shader Speculative.

#### 3.4 Iris atrophy

1. **What.** Age-related thinning of the iris. **Pupillary margin atrophy** gives a scalloped border, a weak sphincter, moderate mydriasis and sluggish PLR. **Stromal atrophy** gives holes in the iris and a displaced pupil (Merck [V]). Common in older dogs, especially Poodles, Chihuahuas and Miniature Schnauzers [Probable].
2. **Effect on vision.** Does not appear to affect vision. Animals lacking a functional sphincter **may be more sensitive to bright light** (Merck [V]). Iris holes act as additional apertures and can produce ghost images or glare (Speculative).
3. **Shader recipe** (s): bright-scene over-exposure: tone-map exposure +0.2–1.0 EV in bright scenes; bloom +0–40%; for stromal holes, faint secondary ghost images (1–3% alpha, offset 1–3% W). Speculative.
4. **Photo identifiability: Yes (with flash).** Scalloped or irregular pupil margin, translucent or thin iris, full-thickness holes (retro-illumination shows the tapetal reflex *through the iris*, a strong flash sign). Pupil larger than expected in light. Confounders: PPM, coloboma, dyscoria from synechiae.
5. **Confidence:** Established (Merck); shader Speculative.

#### 3.5 Iris (uveal) cysts

1. **What.** Fluid-filled cysts from the posterior iris epithelium or ciliary body. In dogs they are usually **free-floating pigmented spheres** in the anterior chamber, or attached at the pupil margin. They are usually benign, and treatment is rarely needed. In **Golden Retrievers and Great Danes**, uveal cysts are associated with pigmentary uveitis, glaucoma and cataract (Merck [V]). Boston Terriers and Labradors are also common [Probable].
2. **Effect on vision.** Usually none. Large or numerous cysts that occlude the pupil block light (dark blobs that move with gravity and head posture).
3. **Shader recipe:** 0–3 dark, very soft (corneal-plane-like) occluders; position biased to the upper field (cysts float ventrally or move); slow drift with head motion; T = 0.3–0.7. In the Golden Retriever pigmentary-uveitis context, chain uveitis and glaucoma. Speculative.
4. **Photo identifiability: Yes.** Round dark-brown to black or translucent spheres in the anterior chamber or at the pupil margin. Flash retro-illumination makes thin-walled cysts **transilluminate** (glow), which distinguishes them from a melanoma, which does not. The "cyst vs melanoma" decision needs a vet (transillumination, ultrasound).
5. **Confidence:** Established (Merck); shader Speculative.

#### 3.6 Persistent pupillary membrane (PPM)

1. **What.** Remnants of the fetal pupillary vascular network. Strands run iris-to-iris (common, benign), iris-to-lens (focal cataract) or iris-to-cornea (focal endothelial opacity). Congenital and non-progressive. Inherited in **Basenjis** (Merck [V]). Pembroke Welsh Corgi, Chow Chow and Mastiff are also predisposed [Probable].
2. **Effect on vision.** Iris-to-iris: usually none. Iris-to-lens or iris-to-cornea: focal opacities, so small soft veils.
3. **Shader recipe:** thin, very low-alpha strand shadows (alpha 0.02–0.1) plus a small soft opacity for lens or corneal attachment points (T = 0.7–0.9). Usually negligible. Speculative.
4. **Photo identifiability: Partly/Yes.** Iris-coloured threads crossing the pupil; pigment spots on the anterior lens capsule or white spots on the posterior cornea. Macro photos with good focus can resolve them; confusable with fibrin or synechiae.
5. **Confidence:** Established; shader Speculative.

#### 3.7 Horner syndrome

1. **What.** Loss of sympathetic innervation to the eye, giving **miosis, ptosis (upper lid droop), enophthalmos and third-eyelid protrusion**. In dogs it is often **idiopathic** (especially Golden Retrievers and Collies) [Probable; commonly cited ~50% idiopathic, unverified]. Other causes: otitis media/interna, neck or chest trauma, brachial plexus injury, neoplasia, intervertebral disc disease. Idiopathic cases often resolve in weeks to months [Probable].
2. **Effect on vision.** Visual function is preserved. Miosis dims the image and ptosis together with a protruding third eyelid **occludes the upper and nasal field**.
3. **Shader recipe** (s): luminance × (1 − 0.3s) in dim scenes; occluder mask from the top (ptosis) 0–25% and from the nasal-inferior corner (third eyelid) 0–30%, soft-edged and out of focus (very blurred, semi-opaque pinkish-grey). Speculative.
4. **Photo identifiability: Yes (best with both eyes in frame).** Anisocoria (the affected pupil is smaller, especially in dim light), drooping upper lid, raised third eyelid, sunken globe. A sympathomimetic pharmacologic test (phenylephrine) localizes the lesion, which is vet only. Confounders: uveitis (also miosis, but a red eye) and third-eyelid protrusion from pain or dehydration.
5. **Confidence:** Established (signs); breed/idiopathic fraction Probable/unverified; shader Speculative.

---

### 4. Retina, choroid, optic nerve, vitreous (mostly not externally photographable)

#### 4.1 Progressive retinal atrophy (PRA), including prcd-PRA

1. **What / onset / breeds / timeline.** A group of inherited photoreceptor degenerations affecting > 100 breeds.
   - **Rods die before cones,** so **night blindness (nyctalopia) comes first**. It progresses over months to years to total blindness (Merck [V]; Cornell [V]).
   - **Early-onset forms (photoreceptor dysplasias):** signs in the **first year**. Irish Setter (rcd1), Collie (rcd2), Norwegian Elkhound, Miniature Schnauzer, Belgian Sheepdog (Merck [V]).
   - **Later-onset forms (degenerations):** signs at **3–5 years**. Miniature and Toy Poodle, Cocker Spaniels, Labrador Retriever, Tibetan Terrier, Akita, Samoyed and others (Merck [V]).
   - **prcd-PRA (progressive rod-cone degeneration):** one of the most common forms (Cornell [V]). Autosomal recessive. Typically night blindness in mid-life, blind some years later; age varies by breed [Probable].
   - **Inheritance:** autosomal recessive in most breeds, X-linked in Siberian Husky, autosomal dominant in Mastiff/Bullmastiff (Merck [V]).
   - Achromatopsia (cone degeneration, day blindness) is a separate entity (Cornell [V]).
2. **Effect on vision (stage model).**
   - **Stage 1 (nyctalopia):** greatly reduced scotopic sensitivity; normal daylight vision.
   - **Stage 2:** **peripheral field constriction** (the mid-periphery is rod-dominated) with progressive loss of contrast and dim-light vision, giving "tunnel vision" in daylight.
   - **Stage 3:** central/cone loss; daytime blindness.
   - **Stage 4:** no light perception.
   - **Late secondary cataracts** are common (Cornell [V]).
   - Dilated pupils increase glare.
   - No dog field-perimetry data exist, so the "tunnel" degrees below are Speculative but match the rod→cone and periphery→centre course.
3. **Shader recipe** (s = disease stage 0–1; scene luminance L):
   - **Night-vision gain:** scotopic gain multiplier `g_night = baseline_gain * (1 - s_n)`, with `s_n = clamp(s*2.5, 0, 1)` (night loss saturates early). In dim scenes (L below a threshold), reduce luminance by up to 95%, add sensor-like noise (Gaussian, σ = 0.02–0.1), and desaturate.
   - **Tunnel mask:** visible field half-angle `θ = θ0 * (1 - smoothstep(0.25, 0.9, s))`, with θ0 ≈ 120° (full canine half-field ~120°) shrinking to ~5–10° before blindness. Mask edge softness 5–15°. In image units with a 120° horizontal FOV, r_in goes 1.0 → 0.1. Outside the mask, luminance → 0 to 10% with heavy blur.
   - **Central acuity/contrast:** after s > 0.6, global blur σ → 3% W and contrast loss of 0–60%.
   - **Dilated-pupil glare:** bloom +0–40%.
   - **Secondary cataract:** if s > 0.7, optionally chain cataract at 0.3 × (s − 0.7)/0.3.
   - At s = 1: black.
   - Speculative.
4. **Photo identifiability: No (early). Partly (late, non-specific).**
   - **External clues:** **bilaterally dilated pupils in normal room light**. **Increased "eyeshine"** (owners notice bright tapetal reflection; Cornell [V]). Ophthalmoscopically this is tapetal hyperreflectivity (Merck [V]), and a flash photo may show a brighter, more uniform tapetal reflex. Later **bilateral cataracts**.
   - All of these are non-specific: flash intensity, pupil size and tapetal colour vary a lot between individuals.
   - **Requires a vet:** **fundoscopy** (vessel attenuation, tapetal hyperreflectivity, optic disc pallor), **ERG** (definitive, early), and **DNA testing** (prcd, rcd1 and others).
   - Smartphone **fundus** photography (with a 20D/28D condensing lens, or adaptors) is feasible in animals (Haddock et al. 2013, human and animal eyes [unverified detail]; *Vet Ophthalmol* 2016 smartphone fundus camera assessment [unverified]). Penn Vet's **DogAEye** (Dec 2025) classifies early PRA from **fundus photographs** uploaded by vets; no metrics were published on the announcement page [V].
5. **Confidence:** Established (course, onset groups, signs); tunnel numbers Speculative.

#### 4.2 Sudden acquired retinal degeneration syndrome (SARDS)

1. **What / onset / breeds.** **Acute blindness over days** in **middle-aged to older dogs**. Spayed females are overrepresented. Dachshund, Miniature Schnauzer, Pug and Brittany Spaniel are predisposed. Often accompanied by **weight gain, lethargy, polyuria/polydipsia and polyphagia** (Merck [V]).
   - **Pupils:** widely dilated, poorly or non-responsive.
   - **Chromatic PLR:** red-light PLR absent, **blue-light PLR preserved** (melanopsin ganglion cells).
   - **ERG:** flat; definitive.
   - **Fundus:** initially normal; tapetal hyperreflectivity and vessel attenuation appear over months.
   - No effective treatment (Merck [V]).
2. **Effect on vision.** Rapid global loss of rod and cone function. Days of severe dimming and contrast loss lead to complete blindness. Pupil/circadian light responses survive, but those do not create form vision.
3. **Shader recipe** (s = days since onset / ~7–30, clamped): global luminance × (1 − s); contrast × (1 − s); blur σ → 6% W; noise; possible residual sensitivity to bright blue light (a blue-channel "glow" at very low alpha, which is purely illustrative). At s = 1: black. Speculative.
4. **Photo identifiability: No.** At most, **dilated pupils in room light** with otherwise **normal-looking eyes**, which is non-specific. A smartphone could in principle run a red-vs-blue light PLR video test (chromatic pupillometry), but that is an unvalidated research idea; ERG is definitive. **Not detectable from a still photo.**
5. **Confidence:** Established (Merck); shader Speculative.

#### 4.3 Collie eye anomaly (CEA)

1. **What / breeds.** Congenital, inherited (NHEJ1 deletion [Probable]) developmental defect of the posterior segment.
   - **Breeds:** Rough/Smooth Collie, Shetland Sheepdog, Border Collie, Australian Shepherd, Nova Scotia Duck Tolling Retriever, Lancashire Heeler [Probable].
   - **Choroidal hypoplasia:** a pale area lateral to the optic disc.
   - **Colobomas** of or around the optic disc in **10–20%** of more severely affected dogs.
   - **Retinal detachment in ~2–5%**.
   - **Vision is not appreciably affected unless retinal detachment develops** (Merck [V]). Intraocular hemorrhage is possible.
   - Non-progressive except for detachment or hemorrhage.
2. **Effect on vision.**
   - *Mild CEA:* none perceptible. Possibly a small relative scotoma at the lesion; the hypoplastic area lies lateral to the disc.
   - *Coloboma:* a corresponding absolute **scotoma**.
   - *Detachment or hemorrhage:* large field loss or blindness (see §4.4).
3. **Shader recipe** (s): s < 0.3 does nothing. Coloboma (0.3–0.7) adds 1–2 soft-edged scotomas of 3–8° radius positioned near the blind spot (the optic disc projection). With `detached=true`, chain §4.4. Speculative.
4. **Photo identifiability: No.** Diagnosis requires **fundoscopy**, ideally at **6–7 weeks of age** before tapetal maturation hides mild lesions ("go-normal") [Probable], or DNA testing. Microphthalmia or enophthalmos in severely affected dogs may be visible [Probable].
5. **Confidence:** Established (Merck numbers); shader Speculative.

#### 4.4 Retinal detachment

1. **What.** Separation of the neurosensory retina from the RPE. In dogs it is most often congenital (CEA, retinal dysplasia), from chorioretinitis, **systemic hypertension**, penetrating trauma, after intraocular surgery (cataract) or from neoplasia (Merck [V]). Signs: **mydriasis, anisocoria, visual impairment, intraocular hemorrhage** (Merck [V]). Detachment can be partial (bullous) or complete (disinsertion, "veil").
2. **Effect on vision.** **Dense scotoma** over the detached region (the shade from the opposite side of the field). Total detachment means blindness in that eye. Bilateral detachment is often hypertensive.
3. **Shader recipe** (s = detached area fraction; direction φ): **curtain occluder** from the edge of the field opposite the detachment location, soft-edged (10° blend), filling area fraction s, with a slightly wavy, undulating edge (a detached retina billows; animate slowly). Plus distortion (metamorphopsia) near the edge (UV warp, 0.5–2% W) and greying inside (luminance 0–15%). Speculative.
4. **Photo identifiability: Partly (only when bullous or complete and visible through the pupil).** A **dilated, unresponsive pupil**. With flash, a **grey-white veil with blood vessels just behind the lens** ("floating veil"), visible without instruments in complete detachment. **Hyphema** or vitreal hemorrhage, and an abnormal tapetal reflex (absent, or grey and wavy). Requires fundoscopy or **ultrasound** to confirm, and blood pressure measurement.
5. **Confidence:** Established (Merck causes/signs); shader Speculative.

#### 4.5 Retinal dysplasia

1. **What / breeds.** Abnormal retinal development, in three forms:
   - **Focal/multifocal (folds):** linear or "V"-shaped streaks; often asymptomatic.
   - **Geographic:** larger irregular areas that can interfere with central vision. Beagle, Cocker Spaniel, Labrador, Rottweiler, Yorkshire Terrier.
   - **Generalized (complete) with detachment:** visual impairment or blindness. English Springer Spaniel, Bedlington, Sealyham, Labrador (with skeletal dysplasia), Doberman, Australian Shepherd.

   Source: Merck [V]. Congenital and non-progressive except for detachment.
2. **Effect on vision.** Multifocal: tiny relative scotomas (usually imperceptible). Geographic: a localized scotoma, possibly central. Generalized: blindness.
3. **Shader recipe** (s; `form` ∈ {folds, geographic, generalized}): folds add 0–10 tiny (0.5–2°), low-depth (−20% luminance) streak-shaped scotomas; geographic adds one 5–20° irregular scotoma (−50 to −90% luminance) that may cover the centre; generalized chains retinal detachment at s = 1. Speculative.
4. **Photo identifiability: No.** Fundoscopy only. Generalized forms with detachment may show the signs listed in §4.4. Some forms come with **microphthalmia or cataract**, which are externally visible.
5. **Confidence:** Established (Merck); shader Speculative.

#### 4.6 Optic neuritis

1. **What.** Inflammation of the optic nerve: immune-mediated (e.g. GME, granulomatous meningoencephalitis), infectious (distemper, fungal, protozoal), neoplastic or idiopathic. **Acute bilateral blindness with dilated, unresponsive pupils** is typical. The fundus may show a swollen, hyperemic disc with peripapillary hemorrhage, or look normal if the inflammation is retrobulbar. The ERG is normal, which distinguishes it from SARDS [Probable; SARDS-vs-optic pathway ERG distinction per Merck [V]]. Prognosis is variable, and steroids can restore vision in some dogs.
2. **Effect on vision.** In humans, central scotoma, colour desaturation, contrast loss and dimming. In dogs, presentation is usually acute, severe and global (Speculative: human analogue).
3. **Shader recipe** (s): central-weighted scotoma (Gaussian dimming centred, radius 10–40°, depth 0–100%); global desaturation 0–80%; contrast loss 0–80%; luminance × (1 − 0.5s); at s = 1 black. Speculative.
4. **Photo identifiability: No.** At most, dilated pupils (non-specific). Diagnosis needs fundoscopy, ERG (normal), MRI or CSF analysis.
5. **Confidence:** Probable (clinical); shader Speculative.

#### 4.7 Asteroid hyalosis

1. **What.** Calcium-lipid particles suspended in the vitreous. Usually **older dogs**, often unilateral, benign and non-progressive or slowly progressive [Probable].
2. **Effect on vision.** In humans it is minimal; patients rarely notice it, although the examiner's view is obscured. Possibly faint floaters or sparkles.
3. **Shader recipe** (s): sparse tiny bright or dark specks (0.05–0.3% of pixels) that **swirl and settle** after head motion (a particle system with lag and damping); haze +0–5%. Speculative.
4. **Photo identifiability: Partly (with flash retro-illumination).** Numerous small **white refractile points** behind the lens that move with eye motion and "snow-globe" back. Confusable with hypermature cataract crystals or vitreal syneresis; slit lamp or fundoscopy confirms.
5. **Confidence:** Probable; shader Speculative.

---

### 5. Adnexa (eyelids, third eyelid, conjunctiva, tear drainage)

These conditions mostly affect vision **indirectly** (squint, discharge, secondary keratitis), but they are **highly photo-identifiable**. That makes them good classes for the detector even when their shader effect is mild.

#### 5.1 Cherry eye (prolapse of the third-eyelid gland)

1. **What / breeds / onset.** Prolapse of the nictitans gland, which appears as a red-pink mass at the medial canthus. **Young dogs (< 2 y)**. English Bulldog, Cocker Spaniel, Beagle, Neapolitan Mastiff, Cane Corso, Shih Tzu, Lhasa Apso [Probable]. Surgical replacement (pocket technique) is recommended. **Gland removal predisposes to KCS** (the gland supplies roughly 30–50% of aqueous tears [Probable/unverified figure]).
2. **Effect on vision.** Minimal; a small occluder in the **nasal-inferior** periphery.
3. **Shader recipe** (s): very blurred pink-red soft occluder at the medial-inferior corner of the field (0–15% of the field, alpha 0.3–0.8); slight overall wetness blur. Speculative.
4. **Photo identifiability: Yes (very good).** A round, smooth, red-pink mass protruding from behind the third eyelid at the medial canthus. Confounders: everted (scrolled) third-eyelid cartilage, third-eyelid neoplasia, conjunctivitis/follicles, plasmoma.
5. **Confidence:** Probable/Established clinical (well-known); shader Speculative.

#### 5.2 Entropion / ectropion (and macroblepharon / diamond eye)

1. **What / breeds.**
   - **Entropion:** inward rolling of the eyelid margin, so lashes and hair rub the cornea. Shar-Pei, Chow Chow, Bulldogs, Rottweiler, Labrador, St Bernard, Mastiff; brachycephalics (medial lower-lid entropion, linked to PK in Pugs per Maini 2019 [V]). Primary onset is in the young; spastic entropion is secondary to pain.
   - **Ectropion:** outward eversion. Bloodhound, St Bernard, Basset Hound, Cocker Spaniel, Mastiff; often lower lid; causes exposure conjunctivitis.
2. **Effect on vision.** Indirect: corneal irritation gives tearing (blur), blepharospasm (narrow aperture), ulcers and keratitis (see §2). Ectropion can sag the lid and expose the conjunctiva, with chronic conjunctivitis.
3. **Shader recipe** (s): entropion: squint aperture mask 0–40%, tearing wet blur σ 0.5–1.5% W, and chained ulcer/PK at reduced severity if `chronic=true`; ectropion: mild haze from conjunctivitis/discharge only. Speculative.
4. **Photo identifiability: Yes (good, with a frontal plus oblique view).** Lid margin not visible or rolled in, with hair touching the cornea, tear streaks and squinting (entropion); drooping lower lid with exposed red conjunctiva (ectropion). AIforPet (KR) reported entropion and ectropion as detectable classes from dog eye photos (> 90% average accuracy claimed, company report) [V, news].
5. **Confidence:** Established clinical; shader Speculative.

#### 5.3 Distichiasis / ectopic cilia / trichiasis

1. **What / breeds.** **Distichiasis:** extra lashes emerging from the meibomian gland openings at the lid margin. Very common, often harmless. Cocker Spaniel, Shih Tzu, Poodle, Bulldogs, Dachshund, Shetland Sheepdog [Probable]. **Ectopic cilia:** lashes emerging through the palpebral conjunctiva, which cause painful ulcers (dorsal-central) in young dogs. **Trichiasis:** normal hair contacting the cornea (nasal folds).
2. **Effect on vision.** Indirect: tearing, squint and ulcers.
3. **Shader recipe:** like entropion (tearing plus squint); optional dark thin out-of-focus lines at the field edge (barely visible; mostly omit). Speculative.
4. **Photo identifiability: Partly.** Distichiae are tiny lashes along the lid margin; a sharp macro photo shows them, often only with magnification. Ectopic cilia need lid eversion and magnification (vet). Trichiasis from nasal folds is visible.
5. **Confidence:** Probable; shader Speculative.

#### 5.4 Conjunctivitis

1. **What.** Conjunctival inflammation: allergic (atopy), bacterial, viral (CDV, CAV), irritant, or secondary to KCS, entropion or distichiasis. Signs: **hyperemia (red eye), chemosis, discharge (serous, mucoid, purulent)**, follicles, blepharospasm.
2. **Effect on vision.** Minimal unless discharge covers the cornea; squinting and discharge give transient blur.
3. **Shader recipe** (s): discharge smear (as KCS mucus, alpha 0–0.3); squint aperture 0–25%; slight warm-pink glow around the field edge (Speculative, illustrative). Speculative.
4. **Photo identifiability: Yes (redness, discharge). Cause: No.** Red bulbar or palpebral conjunctiva with fine, mobile, superficial vessels (versus deep straight episcleral vessels in glaucoma); swollen conjunctiva; discharge colour. **Red eye is a sign, not a diagnosis.** It may be glaucoma, uveitis, KCS or an ulcer, so the detector must not reassure. AI Hub-based work reported dog conjunctivitis F1 = 0.846 (Ji et al. 2024 [V]). AIforPet reported "conjunctival hyperemia" as a class [V, news].
5. **Confidence:** Established; shader Speculative.

#### 5.5 Epiphora / tear staining

1. **What.** Tear overflow from overproduction (irritation) or poor drainage (imperforate or narrow puncta, tear-duct obstruction, medial entropion, tight lid conformation in brachycephalic and toy breeds such as Maltese, Poodle, Shih Tzu, Bichon). **Tear staining** is reddish-brown fur discoloration from porphyrins in tears, plus yeast or bacteria [Probable].
2. **Effect on vision.** Minimal; the wet surface causes slight intermittent blur.
3. **Shader recipe:** occasional "tear lens" refraction drop (a dynamic local blur blob) at the inferior field edge; σ 0.5–1% W. Mostly negligible. Speculative.
4. **Photo identifiability: Yes (very good).** Wet periocular fur and a red-brown stain streak from the medial canthus. AI Hub-based work includes epiphora as a class (Jeon et al. 2025 [V]). Its presence should prompt checks for underlying entropion, distichiasis or ulcer.
5. **Confidence:** Established; shader Speculative.

#### 5.6 Microphthalmia (including merle-associated ocular dysgenesis)

1. **What / breeds.** An abnormally small globe, congenital. Strongly associated with **double merle (MM) genotype** (Australian Shepherd, Collie, Shetland Sheepdog, Dachshund, Great Dane harlequin), with multiple ocular defects: microphthalmia, iris colobomas, dyscoria, cataract, retinal dysplasia/detachment, and often deafness [Probable; merle literature not verified in this session]. Also occurs in Cavalier King Charles Spaniel, Miniature Schnauzer (with cataract) and others.
2. **Effect on vision.** Ranges from near-normal (mild, isolated) to blindness, depending on associated defects. Typically reduced acuity (blur), a reduced field, and colobomatous scotomas.
3. **Shader recipe** (s): global blur σ 1–6% W; field radius reduction 0–50%; 1–3 coloboma scotomas (inferior-nasal field bias, Speculative); chain cataract if present; at s = 1 black. Speculative.
4. **Photo identifiability: Partly/Yes.** A small eye, deep-set in the orbit with a prominent third eyelid and a small palpebral fissure. Merle coat and blue/heterochromic irides. **Iris coloboma** (a notch or hole in the iris) and dyscoria (irregular pupil) are visible. Retinal components need fundoscopy.
5. **Confidence:** Probable; shader Speculative.

---

### 6. Additional relevant conditions (brief)

| Condition | Why relevant | Photo-detectable? | Shader |
|---|---|---|---|
| Eyelid tumors (meibomian adenoma, melanoma) | A class in the AI Hub dataset (Jeon et al. 2025 [V]; Ji et al. 2024 dog eyelid tumor F1 0.874 [V]) | Yes | Minimal; lid mass occluder at the field edge |
| Corneal scar / non-ulcerative keratitis | AI Hub class (reported) [unverified list]; common after ulcers | Yes | Soft white occluder (like lipid dystrophy) |
| Blepharitis | AI Hub class (reported) [unverified list] | Yes | Minimal |
| Exposure keratopathy / lagophthalmos (brachycephalic) | Drives PK and ulcers | Partly (incomplete blink needs video) | Chains KCS-like effects |
| Hypertensive retinopathy | Cause of detachment and hyphema | No (fundus) | See §4.4 |
| Anterior lens capsule pigment / pigmentary uveitis (Golden Retriever) | Leads to glaucoma | Partly (cysts, pigment) | See §3.2/§3.1 |

---

### 7. Machine learning: datasets and published accuracy (dog eye photos)

| Work | Data | Modality | Classes | Model | Reported result | Status |
|---|---|---|---|---|---|---|
| **Jeon, Kim, Kim, Kim 2025** (Preprints.org, *not peer reviewed*), DOI 10.20944/preprints202504.2504.v1 | **AI Hub "Canine Ophthalmic Disease" dataset (Korea)**, 44,637 images (75/10/15 split) | External eye photos (AI Hub images include smartphone/digital camera and slit lamp) | Eyelid tumor, nuclear sclerosis, cataract, ulcerative keratitis, epiphora | Dual-input ViT-B (image + Fourier/wavelet) | Accuracy 86.52% (Fourier) vs 85.65% baseline; macro F1 0.854; AUC ~0.983; cataract class 82→84% | [V] |
| **Nam & Dong 2023**, *IEEE Access* 11:143948–55, DOI 10.1109/ACCESS.2023.3344579 | Canine and feline ocular disease images, slit lamp + digital camera (likely AI Hub; not stated on page) | External | Multi-class | Domain-adversarial learning for imbalance | Accuracy 84.7% (dog, all), **86.2% (dog, camera domain)**; cat 65.4% / 73.2% | [V abstract] |
| **Ji, Kim, Park 2024**, *J. KIECS* 19(3):577–582 | AI Hub pet eye disease dataset; the paper states **12 dog disease classes** in the dataset; used 46,450 images (dogs + cats, 3 diseases) | External | Dog: conjunctivitis, eyelid tumor; cat: conjunctivitis, corneal ulcer | EfficientNet + OpenCV HSV lesion segmentation | Val. accuracy ~92%; dog conjunctivitis F1 0.846, eyelid tumor F1 0.874 | [V] |
| **Kim JY et al. 2019**, *Sci Rep* 9:14209 (per Europe PMC record), DOI 10.1038/s41598-019-50437-0 | 526 corneal photos, 281 dogs, Konkuk Univ. + 3 specialty hospitals | Clinical corneal photos (likely fluorescein) | Normal / superficial ulcer / deep ulcer | GoogLeNet, ResNet, VGG (transfer) | > 90% (ResNet, VGG) for 3-class; superficial vs deep ~100% in many models | [V] |
| **Kim JY et al. 2022**, *Sci Rep* 12:21351, DOI 10.1038/s41598-022-25867-y | 52 dogs (~94 eyes), slit-lamp video with a grid illuminator; 59,246 frames | Reflected-grid tear-film imaging | Normal vs abnormal (dry eye: tear-film breakup) | YOLOv5 | mAP 0.995, precision 0.943, recall 0.995 | [V] |
| **Park, Go, Kim, Shim 2025**, *Animals* 15(9):1327, DOI 10.3390/ani15091327 | AI Hub ocular **B-mode ultrasound** + 4 clinics; 3,155 images | Ultrasound (*not photo*) | No cataract / cortical / mature / hypermature | DenseNet-161 best | 92.0% test accuracy; per-class 99/90/86.5/78.6% | [V] |
| **AIforPet "TTcare" (똑똑케어)**, news report 2020 (DailyVet, 2 Dec 2020) | ~7,000 dog eye images (Konkuk Univ. vet faculty labels) | Smartphone photos | Corneal ulcer/damage, ectropion, entropion, epiphora, corneal opacity, conjunctival hyperemia | Not stated | Company claim: average > 90% accuracy; Korean veterinary medical device approval Oct 2020 | [V news; no peer-reviewed metrics] |
| **Penn Vet DogAEye** (announcement, 15 Dec 2025) | Fundus photos uploaded by vets | **Fundus** | Early PRA | Deep learning classifier | No metrics on the page; reportedly "outperformed" a panel of ophthalmologists | [V announcement] |
| **Roboflow Universe** community sets ("dog eye", "dog_eye_disease", "Dogs and Cats Eye Diseases", etc.) | Varies; often scraped or AI Hub derived | Mixed | Mixed | — | Not peer reviewed; licence and label quality unknown | [found in search; not evaluated] |
| Human analogue: **Gu et al. 2025**, *Informatics* 12(1):2 | 1,526 self-captured smartphone images (humans) | External smartphone | Usable/unusable; normal/abnormal | EfficientNet | Diagnosis AUC 0.62, sensitivity 0.29 (self-captured photos are hard); eligibility AUC 0.87 | [V] (shows the need for an **image-quality gate**) |

**AI Hub dataset notes.** The Korean AI Hub (aihub.or.kr) "반려동물 안구질환 데이터" (companion animal eye disease data) is the largest known source. Ji et al. 2024 state that it has 12 dog disease classes [V]. Commonly listed dog classes (from secondary sources and search snippets; **not verified against AI Hub directly**) are:

- conjunctivitis
- ulcerative keratitis
- cataract
- non-ulcerative keratitis
- pigmentary keratitis
- entropion
- blepharitis
- eyelid tumor
- epiphora
- nuclear sclerosis
- plus additional classes (possibly with severity sub-grades)

Access generally requires Korean registration and may be restricted for use outside Korea or for commercial use. Check the licence.

**Takeaways for the detector.**

- Published external-photo classifiers reach **~85–92% accuracy** on curated datasets for **anterior, visible** conditions. That figure covers 5–12 classes and is dominated by cataract/NS, conjunctivitis, eyelid tumor, ulcer and epiphora.
- **No published model detects retinal, optic-nerve or IOP conditions from external photos.**
- Cataract vs nuclear sclerosis is the hardest common pair.
- Real-world, self-captured photos degrade performance sharply (human analogue: Gu et al. 2025). Include an **image-quality/eligibility model**: focus, glare, eye fully in frame, pupil visible.
- Recommend a **multi-shot capture protocol**:
  - (a) no-flash diffuse frontal;
  - (b) flash retro-illumination from about 30–50 cm (tapetal reflex), for cataract vs NS, aphakic crescent, iris transillumination and cysts;
  - (c) both eyes in one frame, for anisocoria, globe size, Horner and buphthalmos;
  - (d) optional 3–5 s video, for blink/tear film, phacodonesis and PLR.

---

### 8. Proposed detection → shader parameter schema

The detector outputs **visible findings** with probabilities and graded severities. A mapping layer converts findings to **condition hypotheses**, and from there to shader parameters. Each shader primitive is a composable pass. Severity combines as `s = p_detect * severity_est`, unless the user overrides it.

```jsonc
// 1) DETECTOR OUTPUT (per eye)
{
  "schema_version": "0.1",
  "eye": "OD|OS",
  "image_quality": {
    "usable": true, "focus": 0.82, "glare_fraction": 0.04,
    "pupil_visible": true, "flash_retroillumination": true,
    "both_eyes_in_frame": false
  },
  "findings": {                       // each: {p: probability 0..1, severity: 0..1, extra fields}
    "lens_opacity":           {"p":0.9, "severity":0.6, "pattern":"cortical|nuclear|diffuse|posterior_subcapsular",
                               "tapetal_reflex_blocked_fraction":0.55},   // from flash image
    "nuclear_haze_reflex_passes": {"p":0.2, "severity":0.3},
    "aphakic_crescent":       {"p":0.0, "direction_deg":null},
    "corneal_pigment":        {"p":0.8, "clock_hours":4.5, "reaches_pupil":false, "crosses_pupil":false,
                               "origin":"medial|temporal|diffuse"},   // -> Maini score estimate
    "corneal_edema":          {"p":0.1, "severity":0.0, "region":"diffuse|dorsolateral|focal"},
    "corneal_vascularization":{"p":0.3, "severity":0.2, "origin":"temporal|medial|diffuse"},
    "corneal_white_crystalline":{"p":0.0, "severity":0.0},
    "corneal_ulcer_visible":  {"p":0.05, "depth":"none|superficial|deep|descemetocele"},
    "tear_film_irregular":    {"p":0.4, "severity":0.4},          // broken flash highlight, from video if available
    "mucoid_discharge":       {"p":0.6, "severity":0.5},
    "conjunctival_hyperemia": {"p":0.5, "severity":0.4, "pattern":"superficial|episcleral|ciliary_flush"},
    "pupil":                  {"diameter_rel":0.7, "anisocoria":false, "shape_irregular":false},
    "globe_enlarged":         {"p":0.0},
    "hypopyon_or_hyphema":    {"p":0.0, "type":"none|hypopyon|hyphema", "fill_fraction":0.0},
    "iris_cyst":              {"p":0.0, "count":0},
    "iris_atrophy":           {"p":0.1},
    "ppm_strands":            {"p":0.0},
    "third_eyelid_gland_prolapse":{"p":0.0},
    "third_eyelid_protrusion":{"p":0.0},
    "ptosis":                 {"p":0.0},
    "entropion":              {"p":0.3, "location":"medial_lower|lateral|upper"},
    "ectropion":              {"p":0.0},
    "tear_staining":          {"p":0.7, "severity":0.6},
    "eyelid_mass":            {"p":0.0},
    "microphthalmia_coloboma":{"p":0.0},
    "tapetal_reflex_hyperreflective":{"p":0.1}   // weak, non-specific PRA/SARDS clue
  },
  "metadata_optional": {                // user-entered; NOT detectable from photo
    "age_years": 9, "breed": "pug", "diabetic": false,
    "night_blindness_reported": false, "sudden_blindness": false,
    "vet_diagnoses": ["KCS"], "STT_mm_per_min": 8, "IOP_mmHg": null, "PRA_genotype": null
  },
  "urgent_flags": []                    // e.g. ["red_eye+cloudy_cornea+dilated_pupil"] -> show "seek vet now"
}
```

```jsonc
// 2) CONDITION HYPOTHESES (mapping layer; rule-based or learned)
{
  "conditions": {
    "cataract":            {"s":0.6, "stage":"immature", "type":"cortical", "source":"photo"},
    "nuclear_sclerosis":   {"s":0.2, "source":"photo"},
    "pigmentary_keratitis":{"s":0.36, "maini_score_est":5.0, "origin":"medial", "source":"photo"},
    "kcs":                 {"s":0.47, "source":"metadata:STT=8", "chronic":true},
    "pra":                 {"s":0.0, "source":"none"},        // only from metadata/vet diagnosis
    "glaucoma":            {"s":0.0, "damage":0.0, "acute":false, "source":"none"},
    "...": {}
  },
  "disclaimer": "Not a veterinary diagnosis. Retinal disease, glaucoma (IOP) and tear production cannot be measured from a photo."
}
```

```jsonc
// 3) SHADER PARAMETERS (composited in this order: retina/neural -> lens -> cornea/tear -> adnexa -> baseline dog vision)
{
  "baseline": {"dichromat": true, "acuity_sigma_frac": 0.002, "night_gain": 2.0},
  "field_mask":   {"tunnel_r_in": 1.0, "edge_soft": 0.1,           // PRA, glaucoma damage, microphthalmia
                   "scotomas": [ /* {x,y,radius,depth,shape:"disc|arc|curtain|streak"} */ ],
                   "curtain": null},                                // retinal detachment {dir_deg, fraction}
  "night":        {"gain_mult": 1.0, "noise_sigma": 0.0, "desat": 0.0},      // PRA, SARDS
  "global":       {"lum_mult": 1.0, "contrast_mult": 1.0, "saturation_mult": 1.0, // SARDS, optic neuritis, uveitis miosis
                   "tint_rgb": [1,1,1]},                                       // hyphema red, NS yellow
  "haze":         {"amount": 0.0, "color": [1,0.97,0.9], "spatial_mask": "uniform|spokes|central|wedge|creep"},
  "blur":         {"sigma_frac": 0.0, "spatial_mask": null},
  "bloom":        {"intensity": 0.0, "radius_frac": 0.05, "threshold": 0.8},
  "halos":        {"intensity": 0.0, "radius_frac": 0.06, "width_frac": 0.01, "chromatic": true}, // corneal edema, acute glaucoma
  "occluders":    [ /* {kind:"pigment|vascular|white|red|cyst|lid|third_eyelid",
                         field_poly_or_wedge, transmission, blur_frac, tint_rgb} */ ],
  "distortion":   {"amp_frac": 0.0, "freq": 3.0, "time_varying": false},      // ulcer, KCS, RD edge
  "ghost":        {"alpha": 0.0, "offset_frac": [0,0], "blur_frac": 0.0, "wobble_hz": 0.0},  // lens subluxation, iris holes
  "tear_film":    {"enabled": false, "breakup_time_s": 20, "blink_interval_s": 6,
                   "sigma_max_frac": 0.0, "mucus_alpha": 0.0},                // KCS
  "aperture":     {"top": 0.0, "bottom": 0.0, "nasal_inferior": 0.0, "bright_squint": 0.0},  // blepharospasm, ptosis, cherry eye
  "particles":    {"count": 0, "kind": "floater|asteroid|sparkle", "settle_s": 2.0},
  "photophobia":  {"exposure_ev_bright": 0.0}                                  // iris atrophy, uveitis, dilated pupils
}
```

**Combination rules (suggested).**

- **Multiplicative transmissions:** `T_total = Π T_i` for stacked occluders and hazes. Additive haze is capped at 0.95.
- **Blur:** combine in quadrature, `σ_total = sqrt(Σ σ_i²)`.
- **Field masks:** take the minimum (a pixel is visible only if every mask allows it).
- **Bloom/halo:** sum, then clamp.
- **Retinal before optical:** apply neural/retinal masks *after* optical blur, so scotomas have sharp-ish neural edges, while corneal occluders stay heavily blurred because they are out of focus.
- **Field mirroring:** a corneal or lens location at (x, y) relative to the pupil maps roughly to field location (−x, −y). Nasal cornea affects the temporal field and the ventral chamber affects the upper field.
- **Urgency override:** if `urgent_flags` is non-empty, the UI must show "seek veterinary care now" **before** any simulation.

---

### 9. Compact summary table

| Condition | Vision effect | Shader effects | Photo-detectable? | Confidence (clinical / shader) |
|---|---|---|---|---|
| Cataract (incipient→hypermature, diabetic) | Diffuse scatter, contrast loss, glare; blind when mature | Haze, contrast↓, blur, bloom; spoke/central mask; sparkle (hypermature) | **Yes** (Partly when incipient); flash retro-illumination key | Established / Speculative |
| Nuclear sclerosis | Minimal; mild myopia | Slight blur, yellow tint, slight bloom | **Partly** (confused with cataract; reflex passes) | Established / Speculative |
| Lens luxation / subluxation | Monocular diplopia, blur, wobble; acute glaucoma if anterior | Ghost image, wobble, blur; chain glaucoma/edema | **Partly** (aphakic crescent with flash; video for tremor) | Established / Speculative |
| KCS (dry eye) | Fluctuating blur between blinks, glare, chronic opacity | Time-varying tear-breakup blur + warp, mucus smear, squint; chain PK | **Partly** (discharge, dull cornea); STT needs vet | Established / Speculative |
| Pigmentary keratitis | Soft darkening/veil, blind if axial | Blurred brown wedge occluder from nasal cornea → temporal field | **Yes** (Maini score approximable) | Established / Speculative |
| Corneal ulcer | Local haze, distortion, tearing, squint | Local haze + warp, wet blur, aperture | **Partly** (deep yes; superficial needs fluorescein) | Established / Speculative |
| Corneal edema | Blue haze, halos, contrast loss | Cool veil, ring halos, blur | **Yes** (red flag) | Established / Speculative |
| Stromal lipid dystrophy | Mild glare | Soft white veil, sparkle | **Yes** | Established / Speculative |
| Endothelial dystrophy | Progressive edema from dorsolateral | Edema recipe with growing quadrant mask | **Yes** | Established / Speculative |
| Pannus (CSK) | Peripheral→central opaque veil | Creeping pink-brown occluder from temporal cornea | **Yes** | Established / Speculative |
| Eosinophilic keratitis (rare in dogs) | Local plaque opacity | White-pink occluder | **Partly** (needs cytology) | Probable / Speculative |
| Glaucoma | Acute: haze, halos, dimming; chronic: field loss → blindness | Edema halos, luminance↓; tunnel + arcuate scotomas (damage) | **Partly** (dilated pupil, episcleral injection, edema, buphthalmos); IOP needs tonometry | Established / Speculative |
| Uveitis | Fog, dim (miosis), photophobia, floaters | Veil, lum↓, bright squint, floaters, upper-field occluder (hypopyon) | **Partly** (red eye, small pupil, cloudy aqueous) | Established / Speculative |
| Hyphema | Red haze, upper-field occlusion | Red tint, haze, upper occluder | **Yes** | Established / Speculative |
| Iris atrophy | Light sensitivity | Exposure boost, bloom, faint ghosts | **Yes** (flash transillumination) | Established / Speculative |
| Iris cysts | Usually none | Rare soft dark floating occluders | **Yes** (transilluminate) | Established / Speculative |
| Persistent pupillary membrane | Usually none | Faint strands/small opacities | **Partly** | Established / Speculative |
| Horner syndrome | Dim (miosis), upper/nasal occlusion | Lum↓, ptosis + third-eyelid aperture mask | **Yes** (both eyes in frame) | Established / Speculative |
| PRA (incl. prcd) | Night blindness → tunnel → blind; secondary cataract | Night gain↓ + noise, tunnel mask, blur; chain cataract | **No** early; Partly late (dilated pupils, bright eyeshine) | Established / Speculative |
| SARDS | Blind within days | Global lum/contrast → 0 | **No** (dilated pupils only) | Established / Speculative |
| Collie eye anomaly | Usually none; coloboma scotoma; RD blind | Small scotomas; chain RD | **No** (fundoscopy/DNA) | Established / Speculative |
| Retinal detachment | Curtain scotoma, distortion, blind | Curtain occluder, warp | **Partly** (dilated pupil, veil behind lens, hyphema) | Established / Speculative |
| Retinal dysplasia | None → local scotoma → blind | Streak/geographic scotomas; chain RD | **No** | Established / Speculative |
| Optic neuritis | Acute blindness; central scotoma/desaturation (human analogue) | Central scotoma, desat, contrast↓ | **No** | Probable / Speculative |
| Asteroid hyalosis | Minimal floaters | Swirling particles | **Partly** (flash) | Probable / Speculative |
| Cherry eye | Minimal | Small nasal-inferior occluder | **Yes** | Probable / Speculative |
| Entropion / ectropion | Indirect (tearing, squint, ulcers) | Aperture mask, wet blur; chain ulcer/PK | **Yes** | Established / Speculative |
| Distichiasis / ectopic cilia | Indirect | Wet blur, squint | **Partly** | Probable / Speculative |
| Conjunctivitis | Minimal; discharge blur | Smear, squint | **Yes** (sign, not cause) | Established / Speculative |
| Epiphora / tear staining | Minimal | Occasional tear-lens blur | **Yes** | Established / Speculative |
| Microphthalmia (merle) | Variable → blind | Blur, field↓, coloboma scotomas | **Partly** (small globe, iris coloboma) | Probable / Speculative |

---

### 10. Limitations

- **No direct perceptual data exist for diseased dogs.** All shader parameters are engineering estimates anchored to clinical descriptions and human analogues (cataract, corneal edema, glaucoma, RP). Dogs can't report percepts. Behavioural vision tests (maze tests, menace and dazzle responses, obstacle courses) measure function, not appearance.
- Canine glaucoma field-loss topography, PRA tunnel-radius-vs-time curves, and the exact Schirmer→vision relationship are **not established**. The mappings above are illustrative.
- AI Hub dataset class list and licence were **not verified directly** against aihub.or.kr.
- Several primary sources could not be opened (PubMed and PMC bot checks); their figures come from secondary sources that quote them and are marked accordingly.

---

### References

`[V]` = fetched and checked in this session. `[unverified]` = cited from background knowledge or seen only as a search-result title; verify before use.

1. Merck Veterinary Manual (Professional). "The Lens in Animals." https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/the-lens-in-animals [V]. Also the "Lens" page: https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/lens [V]
2. Merck Veterinary Manual. "Glaucoma in Animals." https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/glaucoma-in-animals [V]
3. Merck Veterinary Manual. "The Ocular Fundus in Animals." https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/the-ocular-fundus-in-animals [V]
4. Merck Veterinary Manual. "Cornea" (ophthalmology). https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/cornea [V]
5. Merck Veterinary Manual. "Anterior Uvea" (ophthalmology). https://www.merckvetmanual.com/eye-diseases-and-disorders/ophthalmology/anterior-uvea [V]
6. Merck Veterinary Manual. "Sudden Acquired Retinal Degeneration Syndrome (SARDS) in Animals." https://www.merckvetmanual.com/emergency-medicine-and-critical-care/ophthalmic-emergencies/sudden-acquired-retinal-degeneration-syndrome-sards-in-animals [V]
7. Capuzzi (Giresi) J. "Cataracts: How to uncover the imposter lenticular sclerosis." dvm360, 1 Nov 2005. https://dvm360.com/cataracts-how-uncover-imposter-lenticular-sclerosis [V]
8. Gould D. "Clinical assessment of cataracts in dogs." *In Practice* 2002;24(1):28–34. [unverified primary; stage summary seen via Wikipedia "Cataracts (canine)", https://en.wikipedia.org/wiki/Cataracts_(canine) [V]]
9. Beam S, Correa MT, Davidson MG. "A retrospective-cohort study on the development of cataracts in dogs with diabetes mellitus: 200 cases." *Vet Ophthalmol* 1999;2(3):169–172. PubMed 11397260. [primary unverified; figures (50% at ~170 d, 75% at ~370 d) as reported in ref. 10]
10. Williams DL. "Effect of Oral Alpha Lipoic Acid in Preventing the Genesis of Canine Diabetic Cataract: A Preliminary Study." *Vet Sci* 2017;4(1):18. DOI 10.3390/vetsci4010018. https://mdpi.com/2306-7381/4/1/18 [V]
11. Francis JM, Mowat FM, Ludwig A, Hicks JM, Pumphrey SA. "Quantifying refractive error in companion dogs with and without nuclear sclerosis: 229 eyes from 118 dogs." *Vet Ophthalmol* 2024;27(1):70–78. DOI 10.1111/vop.13163. [V via UW summary: https://www.ophth.wisc.edu/blog/2024/01/01/quantifying-refractive-error-in-companion-dogs-with-and-without-nuclear-sclerosis-229-eyes-from-118-dogs/]
12. UC Davis Veterinary Genetics Laboratory. "Primary Lens Luxation (PLL)." https://vgl.ucdavis.edu/test/primary-lens-luxation [V]
13. Oliver J. "Keratoconjunctivitis sicca in canines: diagnostic methods and routine testing." *Vet Times*, 17 Mar 2008. https://www.vettimes.co.uk/app/uploads/wp-post-to-pdf-enhanced-cache/1/keratoconjunctivitis-sicca-in-canines-diagnostic-methods-and-routine-testing.pdf [V]
14. Gionfriddo JR. "Just ask the expert: What is a normal Schirmer tear test result?" dvm360, 1 Oct 2010. https://www.dvm360.com/just-ask-expert-what-normal-schirmer-tear-test-result [V]
15. Maini S, Everson R, Dawson C, Chang YM, Hartley C, Sanchez RF. "Pigmentary keratitis in pugs in the United Kingdom: prevalence and associated features." *BMC Vet Res* 2019;15:384. DOI 10.1186/s12917-019-2127-y [V]
16. Labelle AL, Dresser CB, Hamor RE, Allender MC, Disney JL. "Characteristics of, prevalence of, and risk factors for corneal pigmentation (pigmentary keratopathy) in Pugs." *JAVMA* 2013;243(5):667–674. [unverified; 82.4% prevalence as cited in ref. 15]
17. Krecny M, Tichy A, Rushton J, Nell B. "A retrospective survey of ocular abnormalities in pugs: 130 cases." *J Small Anim Pract* 2015;56(2):96–102. [unverified; dated 2014 in ref. 15's list]
18. Welihozkiy A. "Chronic Superficial Keratitis in Dogs." *Clinician's Brief*, Sep 2017. https://cliniciansbrief.com/article/chronic-superficial-keratitis-dogs [V]
19. Cornell University College of Veterinary Medicine, Riney Canine Health Center. "Progressive Retinal Atrophy." https://www.vet.cornell.edu/progressive-retinal-atrophy [V]
20. Miller PE. "Vision in Animals: What do Dogs and Cats See?" Waltham/OSU Symposium, Small Animal Ophthalmology, 2001. VIN. https://www.vin.com/doc/?id=3844144 [V]
21. Miller PE, Murphy CJ. "Vision in dogs." *JAVMA* 1995;207(12):1623–1634. PubMed 7493905. [unverified; PubMed bot-check blocked]
22. Neitz J, Geist T, Jacobs GH. "Color vision in the dog." *Vis Neurosci* 1989;3(2):119–125. [unverified]
23. Jeon D, Kim S, Kim K, Kim H. "Multi-Modal Vision Transformer Integration for Enhanced Canine Ophthalmic Disease Classification." Preprints.org 2025. DOI 10.20944/preprints202504.2504.v1. https://www.preprints.org/manuscript/202504.2504 [V; not peer reviewed]
24. Nam MG, Dong S-Y. "Classification of Companion Animals' Ocular Diseases: Domain Adversarial Learning for Imbalanced Data." *IEEE Access* 2023;11:143948–143955. DOI 10.1109/ACCESS.2023.3344579. https://scholarworks.sookmyung.ac.kr/item/dddd9f7e-c5ce-4440-bab6-734f9b3fc5a4 [V abstract]
25. Ji M-K, Kim Y-H, Park S-M. "OpenCV-Based Pets Health Age Prediction System for Reasonable Insurance Premium Calculation." *J. Korea Inst. Electronic Communication Sciences* 2024;19(3):577–582. https://koreascience.kr/article/JAKO202417838351227.pdf [V]
26. Kim JY, Lee HE, Choi YH, Lee SJ, Jeon JS. "CNN-based diagnosis models for canine ulcerative keratitis." *Sci Rep* 2019;9:14209. DOI 10.1038/s41598-019-50437-0. https://www.nature.com/articles/s41598-019-50437-0 [V; article number from Europe PMC record]
27. Kim JY, Han MG, Chun JH, Huh EA, Lee SJ, et al. "Developing a diagnosis model for dry eye disease in dogs using object detection." *Sci Rep* 2022;12:21351. DOI 10.1038/s41598-022-25867-y. https://www.nature.com/articles/s41598-022-25867-y [V]
28. Park S, Go S, Kim S, Shim J. "Deep Learning-Based Classification of Canine Cataracts from Ocular B-Mode Ultrasound Images." *Animals* 2025;15(9):1327. DOI 10.3390/ani15091327. https://mdpi.com/2076-2615/15/9/1327 [V]
29. DailyVet (Korea). "반려견 눈 사진만 찍으면 안과 증상을 AI가 알려준다?" (AIforPet TTcare), 2 Dec 2020. https://www.dailyvet.co.kr/news/industry/139751 [V; news / company claim]
30. Penn Vet. "Vision scientists at Penn Vet launch DogAEye, a novel AI-based tool to improve early diagnosis of retinal degeneration in dogs." 15 Dec 2025. https://www.vet.upenn.edu/vision-scientists-at-penn-vet-launch-dogaeye-a-novel-ai-based-tool-to-improve-early-diagnosis-of-retinal-degeneration-in-dogs/ [V]
31. Gu B, Christopher M, Lim S-H, Baxter SL. "Deep Learning-Based Analysis of Ocular Anterior Segment Diseases from Patient-Self-Captured Smartphone Images." *Informatics* 2025;12(1):2. DOI 10.3390/informatics12010002 [V; human data]
32. Haddock LJ, Kim DY, Mukai S. "Simple, Inexpensive Technique for High-Quality Smartphone Fundus Photography in Human and Animal Eyes." *J Ophthalmol* 2013:518479. https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3793314/ [unverified details; title seen in search]
33. "Assessment of a smartphone-based camera for fundus imaging in animals." *Vet Ophthalmol* 2016 (DOI 10.1111/vop.12399; PubMed 26775579). [unverified; title only]
34. Gelatt KN, Ben-Shlomo G, Gilger BC, Hendrix DVH, Kern TJ, Plummer CE (eds). *Veterinary Ophthalmology*, 6th ed. Wiley-Blackwell, 2021. [unverified; general reference for "Probable" statements (breed lists, IOP cutoffs, CEA genetics, Horner, cherry eye, merle), not consulted directly in this session]
35. AI Hub (Korea), 반려동물 안구질환 데이터 (Companion animal eye disease data). https://aihub.or.kr [unverified; dataset page not accessed; details via refs 23, 25]
36. Roboflow Universe community datasets, e.g. https://universe.roboflow.com/petconnect/dog_eye_disease , https://universe.roboflow.com/pet-3/dogs-and-cats-eye-diseases [seen in search; not evaluated]


---
