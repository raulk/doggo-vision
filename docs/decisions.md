# Decisions log: shader and preset choices, and the science behind them

Each entry gives the choice, where it lives in the code, the evidence, and how sure we are. For the full evidence, see the [research catalog](research/catalog.md) and the [realism audit](research/realism-audit.md). For the limits of all of this, see [What we don't know](unknowns.md).

This log describes the renderer changes accompanying the November 26 scientific audit. Audited regression values refer to the build tested in that audit.

**Confidence labels** (from the catalog, §S1):

- **Established**: measured directly in peer-reviewed work, and read during the research.
- **Probable**: one good study, standard veterinary teaching, or a figure relayed by a reliable review.
- **Speculative**: extrapolation, engineering estimate or analogy.

**Human-derived** marks a number taken from human data and transferred to dogs. No dog measurement exists for it. Nearly every disease magnitude in this simulator is human-derived or an engineering estimate.

**Measured** means we measured it on the simulator itself, with the regression tests in `tests/` (see [section 4](#4-how-accuracy-claims-are-checked)).

---

## 1. Pipeline structure

### D1. One shader that follows the light path through the eye

**Choice.** The renderer applies off-axis vignetting for pre-pupil adnexa (lids, muzzle and third eyelid). Anterior lesions alter pupil-plane transmission, aberration and scatter (D10). The glare path uses light subject to anterior attenuation. The retinal stages apply acuity and field loss after optical image formation, followed by neural gain, noise and temporal processing (`src/shaders.ts`, `STAGES` in `src/model.ts`).

**Combination rules.** Transmissions multiply, independent Gaussian blur variances add, and the renderer takes the minimum of overlapping retinal field masks. The Gaussian rule follows from convolution and approximates non-Gaussian point-spread functions.

### D2. Every spatial value in degrees of visual angle, not pixels

**Choice.** Photographs use a rectilinear pinhole projection. With normalized horizontal image coordinate `x` and horizontal FOV `H`, the horizontal ray angle is `atan(x·tan(H/2))`. A local angular Jacobian converts between image distances and visual angles so an optical kernel keeps its angular scale across the photo. Synthetic grating targets use equiangular projection for constant pixels per degree. The default horizontal FOV is 50°.

**Why.** Acuity, straylight and field loss are defined in degrees. Rod noise also scales in degrees (P8). Legacy Part III blur and geometry fractions use 25° and 120° reference fields respectively (`REF_BLUR` and `REF_FOV` in `src/model.ts`).

---

## 2. Normal adult dog vision

### D3. Dichromat colour from a dog-specific matrix, not a stock deuteranopia filter

**Choice.** A 3×3 linear-RGB matrix fitted to canine cone sensitivities (`L_DOG`, `S_DOG` and `dogMatrix` in `src/model.ts`).

**Evidence.** Dogs have two cone classes, with S sensitivity peaking at about 429–435 nm and L at about 555 nm. Neitz et al. found a behavioural neutral match near 480 nm against a 4,800 K comparison light. **Established.** [Neitz et al. 1989](https://doi.org/10.1017/S0952523800004430) · [Jacobs et al. 1993](https://pubmed.ncbi.nlm.nih.gov/8424924/)

**Model results.** Direct Govardovskii A1 energy-based cone templates with 429/555 nm peaks over 390–780 nm cross at about **485.3 nm** when normalized to D65. The implemented matrix crosses at about **495.9 nm** when evaluated on the unclipped CIE 1931 spectral locus in linear sRGB. The matrix is an RGB approximation to cone catches. [Govardovskii et al.](https://pubmed.ncbi.nlm.nih.gov/11016572/) · [CIE observer data](https://cie.co.at/datatable/cie-1931-colour-matching-functions-2-degree-observer)

### D4. Baseline acuity of 8 cpd, with blur σ = 0.389 / cpd

**Choice.** An adult dog's default resolution limit is 8 cycles per degree (`VISION_DEFAULTS.cpd`). This is turned into a Gaussian blur of σ ≈ 0.389 / cpd degrees, about 3 arcmin at 8 cpd. The 0.389 coefficient sets the **5% MTF** cutoff. At **10% MTF**, the coefficient is 0.3415, so the baseline 8 cpd Gaussian crosses 10% at 7.02 cpd before the contrast-sensitivity function (CSF) is applied.

**Evidence.** Dog grating acuity is typically 6–12 cpd (about 20/75). The best individuals reach 19.5 cpd (Lind et al. 2017, behavioural, 43 cd/m²; Murphy et al. 1997, sweep VEP, 7.0–9.5 cpd in beagles). **Established.** 8 cpd sits at the cautious end of the typical range.

**Renderer regression.** The adult Labrador render crosses 10% relative grating transfer at **5.70 cpd** (target 5.5–9.0) after the five-band contrast-sensitivity stage. With only the isolated Gaussian optical stage active, it crosses 5% MTF at **8.013 cpd** (analytic 8.012) and 10% MTF at **7.024 cpd** (analytic 7.024) at both 20° and 40° FOV.

### D5. Night: brighter but blurrier and noisier

**Choice.** Under dim light, acuity drops to about 0.36× the photopic value. Rod luminance replaces the cone colour signal (mesopic weight `m`), and gain and noise rise.

**Evidence.** At 0.0087 cd/m², dogs resolved 1.8–3.5 cpd, against 5.9–9.9 cpd for humans (Lind et al. 2017). **Probable** (one study). The study measured resolution under dim illumination. Night *gain* (default 2.5×) has no dog measurement. It is extrapolated from cats and exposed as a slider (catalog §S3). **Speculative.**

### D6. Retinal topography by skull shape

**Choice.** A per-pixel blur map that changes from a round area centralis (short noses) to a horizontal visual streak (long noses), driven by one parameter `s` computed from the cephalic index.

**Evidence.** The ratio of ganglion-cell densities between the area centralis and the streak correlates with skull length (r = −0.795) and cephalic index (r = +0.687) in the 22-dog study. **Established.** The exact blur values per zone are **Speculative** (catalog Part I §4, Part II §A1). [McGreevy et al. 2004](https://doi.org/10.1159/000073756)

### D7. Field of view and binocular overlap

**Choice.** Total field from 200° (brachycephalic) to 270° (long-nosed), and binocular overlap from 60° to 30°.

**Evidence.** Behavioural perimetry in two normally reared dogs found about 240° total field and 15–30° of contralateral extension per eye, supporting 30–60° of central overlap. **Probable** for these ranges and **Speculative** for the per-breed interpolation. [Sherman & Wilson 1975, Fig. 1](https://bpb-us-w2.wpmucdn.com/voices.uchicago.edu/dist/a/2050/files/2019/11/19-1975-SMS-Wilson-VD-dog-JCN.pdf)

---

## 3. The "Senior, 15" reference presets

These presets model a representative 15-year-old mixed-breed senior case with dry eye (KCS), asymmetric corneal changes, and nuclear sclerosis without cataract: a cloudy left eye (grade-2-like stromal haze with small central pigment dots) and a mostly clear right eye (small focal white scars). The parameter mapping is documented in the realism audit, §2.

An earlier version of these presets was about **4× too blurry**: it measured 1.1–1.3 cpd, near "counting fingers" for a human. It was fixed in commit `e574629` by tuning the renderer to engineering targets (D8–D9).

### D8. Blur set by target acuity, as logMAR penalties over the baseline

**Choice.** For each eye, the model sums the acuity penalties in logMAR to scale the baseline Gaussian width: `σ_total = σ_baseline × 10^ΔlogMAR` (`dLogMAR` in `src/model.ts`). Penalties:

| Source | Penalty | Basis | Confidence |
|---|---|---|---|
| Optical and neural ageing | up to 0.11 logMAR at end of life | Engineering estimate scaled by age / lifespan | Speculative |
| Corneal scar (haze) | 0.15 × severity | Engineering estimate. The model assigns much of the haze effect to straylight (D9) | Speculative |
| Lipid deposits | 0.15 × severity | Engineering estimate using the same coefficient as scars | Speculative |

**Provenance.** Fantes et al. graded and examined 29 rhesus-monkey corneas after experimental PRK. The study provides a histopathology and haze grading reference. It gives no grade-2 acuity estimate. Acuity calibration for scars and lipid deposits remains open. [Fantes et al. 1990](https://jamanetwork.com/journals/jamaophthalmology/article-abstract/638442)

**Targets.** The senior ranges are engineering estimates based on an adult baseline and assumed haze and ageing penalties.

**Renderer regression** (fresh tear film at 1.2 s, verified 2026-11-26):

| Preset | Measured renderer cutoff | Target |
|---|---|---|
| Adult Labrador (control) | 5.70 cpd | 5.5–9.0 |
| Senior, 15: clearer right eye | 4.51 cpd | 4.5–6.0 |
| Senior, 15: cloudy left eye | 3.09 cpd | 3.0–4.5 |
| Senior, 15: both eyes | 4.27 cpd | 4.0–6.0 |

### D9. Fog as straylight with an approximate 1/θ² tail

**Choice.** Corneal haze, lens ageing and pigment are modelled as one straylight parameter log(s). It is turned into a scattered fraction `η = 1 − exp(−0.0086·s)`, and the scattered light is spread across Gaussian-pyramid levels starting at about 0.25°. The inner octave is weighted continuously as image scale changes, and wider octaves have equal weights. That approximates the `s/θ²` tail of the CIE glare spread function (`logS` and `veil` in `src/model.ts`).

**Integral and saturation.** In the flat-angle approximation, integrating the simple tail from 1° to 90° gives `0.0086 ≈ 2π(π/180)² ln(90)`. CIE 146 specifies the simple tail over 1°–30°, which gives about `0.0065` under the same approximation. The exponential mapping to η is an added saturation model. [CIE 146:2002](https://cie.co.at/publications/cie-collection-glare-2002)

**Evidence.**

- Intraocular straylight follows the CIE 2002 glare spread function, with a tail of about `s/θ²` from 1° to 30° (CIE 146:2002; van den Berg). **Established** in humans.
- In humans, log(s) is about 0.9 in young eyes and increases with age. Łabuz et al. report preoperative log(s) of **1.57 ± 0.25** for cataract patients aged 80–90 years. **Established** in humans. [Łabuz et al. 2015, Table 2](https://repub.eur.nl/pub/102424/G.Labuz_PhD_Thesis.pdf)
- An equal weight per octave of radius gives a 1/θ² falloff. This is a mathematical identity, checked numerically in the audit.

**Dog transfer (human-derived, Speculative).** The model treats a dog at age/lifespan `a` as a human of 75·a years. Corneal haze adds 0.7 × scar severity to log(s). No dog straylight data exist.

Verified model exports:

| Eye | Target η | Model η | Model log(s) |
|---|---|---|---|
| Adult Labrador | 0.03–0.12 | 0.07 | 0.90 |
| Clearer right eye | 0.18–0.30 | 0.24 | 1.49 |
| Cloudy left eye | 0.35–0.50 | 0.46 | 1.85 |

**Verified falloff.** For a 0.5° light, linear float-buffer readback measures a 1°–8° glare tail slope of **−2.02** (Labrador), **−2.08** (clearer right), and **−2.08** (cloudy left), with encircled core fractions of 0.805, 0.505, and 0.381. On 8-bit screenshots between 1° and 4°, the slopes are −1.45 (clearer eye), −1.63 (cloudy eye), and −1.50 (both eyes; target −2.6 to −1.3), with mean core luminances of 0.47, 0.32, and 0.43.

### D10. Anterior lesions modify the pupil-plane optics

**Choice.** Corneal ulcer, cataract, pigment, pannus, hyphema and hypopyon are represented by pupil-plane transmission, aberration and scatter. The lesion controls describe optical effects across rays from many scene points. Off-axis vignetting is reserved for pre-pupil adnexa (lids, muzzle and third eyelid), and glare respects anterior attenuation (D1).

**Why.** An anterior lesion intercepts some of the rays from each affected scene point. How much light gets through or scatters depends on pupil coverage and ray geometry. This supports field-wide effective optics and source-dependent glare. **Established** as an optical principle. Lesion-specific magnitudes are **Speculative**. [Optical image formation](https://pmc.ncbi.nlm.nih.gov/articles/PMC6126933/) · [Lens scatter across the pupil](https://pmc.ncbi.nlm.nih.gov/articles/PMC7387518/)

### D11. Corneal pigment absorbs; it does not scatter

**Choice.** The cloudy eye's few central pigment dots dim the image neutrally (luminance about × 0.9). They add no tint, blur or field wedge. The clearer eye has no pigment term because it models small focal white scars rather than pigment.

**Why.** Melanin absorbs light. A few dots covering about 10% of the pupil remove about 10% of the light (audit §2). **Probable.** The 10% coverage is an illustrative estimate, not a clinical measurement.

### D12. Nuclear sclerosis: a refraction prior and reduced opponent gain

**Choice.** Nuclear sclerosis (NS) contributes a severity-dependent myopic prior to the distance-dependent defocus model and reduces blue–yellow gain (D14). A measured total refraction for either eye overrides its NS prior, preventing double-counting of lenticular myopia.

**Evidence.** Francis et al. measured 229 eyes from 118 dogs. Mean refraction at NS grades 0/1/2/3 was **+0.04 / −0.11 / −0.44 / −0.63 D**. The age-adjusted mean shift was small and nonsignificant, and the share of eyes with more than 1.5 D of myopia rose from **6.9% to 30.4%** across grades. These are cross-sectional results. The per-eye prior is **Speculative**. [Francis et al. 2024, full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC10842750/)

### D13. No age-related cataract term when cataract is absent

**Choice.** The age-based cataract risk (`catAge`) no longer blurs the image.

**Why.** It is a population prior: 50% of dogs have some cataract by 9.4 ± 3.3 years, and all dogs over 13.5 years have some lens opacity (catalog §S2.12). When nuclear sclerosis is present without cataract, an explicit finding beats a population prior.

### D14. White stays white: renormalisation for lens yellowing

**Choice.** The renderer preserves neutral colours and reduces blue–yellow opponent gain.

**Evidence.** Four human cataract patients showed slow, partial readaptation of their achromatic settings after surgery. In an ex-vivo canine study, normal whole globes transmitted about 1.6 times as much UV as nuclear-sclerotic globes. Age-dependent visible lens spectra in dogs remain unmeasured, and the visible opponent gain reduction is **Speculative**. [Delahunt et al. 2004, PMID 15518204](https://pubmed.ncbi.nlm.nih.gov/15518204/) · [Himebaugh et al. 2023, PMID 37356536](https://pubmed.ncbi.nlm.nih.gov/37356536/)

### D15. Dry eye: a clear phase, then gradual degradation

**Choice.** After each blink the tear film is clear until the break-up time (`tbu`). Over the next 3 s, blur grows by up to (1 + 0.6 × severity), straylight η increases with a mixing weight of up to 0.08 × severity, and a faint drifting ghost about 1.5 σ away appears (`renderMain()` in `src/gl.ts`).

**Evidence.** During blink suppression, mean functional acuity was 0.11 logMAR in the human dry-eye group and 0.05 in controls. The **0.06 logMAR** is a between-group difference. Mean OSI was 1.53 vs 0.73. OSI is a double-pass instrument index and provides no direct conversion to straylight η. Nascimento et al. measured canine tear break-up times of **25.82 ± 5.47 s** in controls and **10.78 ± 4.23 s** in dogs with KCS. These results support a difference in tear stability. The simulated intra-blink blur, scatter and ghosting magnitudes are **Speculative**. [Human dry-eye study, PMC10068140](https://pmc.ncbi.nlm.nih.gov/articles/PMC10068140/) · [Nascimento et al. 2023, PMID 35544927](https://pubmed.ncbi.nlm.nih.gov/35544927/)

**Preset values (Speculative).** Break-up time 4 s (cloudy eye) and 6 s (clearer eye), with a blink every 6 s. These are placeholders until measured (see [What we don't know](unknowns.md)).

**Verified renderer output.** At 5.8 s after a blink, the cloudy-eye grating cutoff drops from **3.09 to 2.41 cpd**. The clearer eye stays at **4.51 cpd** because its 6 s break-up time equals the blink interval. The regression test checks both probe times.

### D16. No squint and no mucus by default

**Choice.** Squint and mucus default to 0 for both eyes.

**Why.** Squint and discharge should come from direct observation, not from a KCS diagnosis alone (audit §2). The controls remain for days when they apply.

### D17. Both eyes: the clearer eye leads where the fields overlap

**Choice.** Each eye is rendered with its own optics, including refraction and iris settings. Default dominance uses modelled optical quality. In the overlap (±21° for a mesocephalic skull shape), the illustrative pixel blend weights the clearer eye 75:25 (`FS_BLEND` in `src/shaders.ts`, "Clearer-eye dominance" slider). Outside the overlap, each side shows its own eye.

**Evidence.** Human experiments show that asymmetry can affect binocular summation. The pixel blend and its weight are **Speculative** for dogs. [Human binocular experiment](https://pmc.ncbi.nlm.nih.gov/articles/PMC6202146/) · [What we don't know](unknowns.md#4-how-binocular-blending-is-modelled)

**Verified renderer output.** The blend crosses 10% relative grating transfer at **4.27 cpd** at 1.2 s after a blink and **4.12 cpd** at 5.8 s.

### D18. Lifespan of 14 years for the senior presets

**Choice.** The senior presets use a lifespan of 14 years, so a 15-year-old dog is at age/lifespan ≈ 1.07.

**Why.** Age effects are scaled by lifespan, because a 10-year-old Great Dane and a 10-year-old toy poodle are at very different life stages (catalog Part II §B0). 14 years is a working value for a medium-sized mixed breed. **Speculative.**

---

## 4. How accuracy claims are checked

The browser checks in `tests/` probe fresh and late interblink phases. They measure 10% relative transfer on synthetic gratings, point-light halo falloff and normalized core luminance. Exported η is checked against the model's target range.

The float-buffer optical checks cover the analytic Gaussian MTF, FOV invariance, float PSF and zero optical light on black input. The browser checks run in headless Chromium with SwiftShader. Passing establishes renderer behaviour against engineering targets. Real-device GPU behaviour and clinical functional-vision validation remain open.

## 5. Planned but not done

- **P3, partially implemented.** JPEG gain maps, EXIF-based luminance estimates and Display P3 input are supported. HEIC gain maps and live camera exposure remain open.
- **P6, implemented.** The optics pass computes defocus from inverse depth and each eye’s refraction, pupil and accommodation. Static samples supply procedural maps. Uploaded photos can estimate relative depth locally with a lazily loaded ONNX model. The distance slider sets focus and supplies scalar defocus when depth is unavailable.
- **Panorama projection, implemented.** A spherical dog-head viewport reprojects color, gain and depth before optics. Breed-dependent field and binocular overlap set the visible field and monocular crescents.
- **P9, implemented.** Independent sustained and fast histories drive a spatially localized transient accent in video. Separate cone and rod time constants govern dark adaptation, with instant, 60× preview and real-time modes.

**Implemented.** P7 uses a multi-band Laplacian CSF. P8 sizes rod noise in degrees of visual angle.

## References

Full reference lists are in the [catalog](research/catalog.md) (one per part) and the [audit](research/realism-audit.md#sources). The ones this log leans on most:

- Lind et al. (2017). High visual acuity revealed in dogs. [DOI 10.1371/journal.pone.0188557](https://doi.org/10.1371/journal.pone.0188557)
- Neitz, Geist & Jacobs (1989). Color vision in the dog. [DOI 10.1017/S0952523800004430](https://doi.org/10.1017/S0952523800004430)
- Jacobs et al. (1993). Photopigments of dogs and foxes and their implications for canid vision. [PMID 8424924](https://pubmed.ncbi.nlm.nih.gov/8424924/)
- Miller & Murphy (1995). Vision in dogs. [PMID 7493905](https://pubmed.ncbi.nlm.nih.gov/7493905/)
- Murphy et al. (1997). Effect of optical defocus on visual acuity in dogs. [PMID 9099390](https://pubmed.ncbi.nlm.nih.gov/9099390/)
- McGreevy, Grassi & Harman (2004). A strong correlation exists between the distribution of retinal ganglion cells and nose length in the dog. [DOI 10.1159/000073756](https://doi.org/10.1159/000073756)
- Mowat et al. (2008). Topographical characterization of cone photoreceptors and the area centralis of the canine retina. *Mol Vis* 14:2518–2527. [PMC2610288](https://pmc.ncbi.nlm.nih.gov/articles/PMC2610288/)
- Sherman & Wilson (1975). Canine behavioural perimetry. [Primary paper, Fig. 1](https://bpb-us-w2.wpmucdn.com/voices.uchicago.edu/dist/a/2050/files/2019/11/19-1975-SMS-Wilson-VD-dog-JCN.pdf)
- CIE 146:2002. CIE equations for disability glare. [Public summary](https://cie.co.at/publications/cie-collection-glare-2002)
- Łabuz, Reus & van den Berg (2015). Ocular straylight in the normal pseudophakic eye. [PMID 26287879](https://pubmed.ncbi.nlm.nih.gov/26287879/)
- Fantes et al. (1990). Experimental PRK haze grading and histopathology in rhesus monkeys. [Primary paper](https://jamanetwork.com/journals/jamaophthalmology/article-abstract/638442)
- Francis et al. (2024). Quantifying refractive error in companion dogs with and without nuclear sclerosis. [PMC10842750](https://pmc.ncbi.nlm.nih.gov/articles/PMC10842750/)
- Delahunt, Webster, Ma & Werner (2004). Long-term renormalization of chromatic mechanisms following cataract surgery. [PMID 15518204](https://pubmed.ncbi.nlm.nih.gov/15518204/)
- Himebaugh et al. (2023). Canine whole-globe UV transmission. [DOI 10.1016/j.exer.2023.109550](https://doi.org/10.1016/j.exer.2023.109550)
- Simultaneous real-time analysis of tear film optical quality dynamics and functional visual acuity in dry eye disease. [PMC10068140](https://pmc.ncbi.nlm.nih.gov/articles/PMC10068140/)
- Nascimento et al. (2023). Canine tear-film testing in controls and dogs with KCS. [PMID 35544927](https://pubmed.ncbi.nlm.nih.gov/35544927/)
- Peli (1990). Contrast in complex images. The local band-limited contrast method is an image-analysis framework. [Primary paper](https://www.ics.uci.edu/~majumder/vispercep/peli.pdf)
- Pretterer et al. (2004) measured brightness discrimination in dogs. Pongrácz et al. (2017) tested humans viewing simulated images. [Pretterer, DOI 10.1167/4.3.10](https://doi.org/10.1167/4.3.10) · [Pongrácz, PMID 28396145](https://pubmed.ncbi.nlm.nih.gov/28396145/)
- de Rivera et al. (2005) tested contrast sensitivity in beagles. The age-related performance trend did not reach statistical significance. [DOI 10.1016/j.pnpbp.2004.12.004](https://doi.org/10.1016/j.pnpbp.2004.12.004)
