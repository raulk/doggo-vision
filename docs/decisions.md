# Decisions log: shader and preset choices, and the science behind them

Each entry gives the choice, where it lives in the code, the evidence, and how sure we are. For the full evidence, see the [research catalog](research/catalog.md) and the [realism audit](research/realism-audit.md). For the limits of all of this, see [What we don't know](unknowns.md).

**Confidence labels** (from the catalog, §S1):

- **Established**: measured directly in peer-reviewed work, and read during the research.
- **Probable**: one good study, standard veterinary teaching, or a figure relayed by a reliable review.
- **Speculative**: extrapolation, engineering estimate or analogy.

**Human-derived** marks a number taken from human data and transferred to dogs. No dog measurement exists for it. Nearly every disease magnitude in this simulator is human-derived or an engineering estimate.

**Measured** means we measured it on the simulator itself, with the regression tests in `tests/` (see [section 4](#4-how-accuracy-claims-are-checked)).

---

## 1. Pipeline structure

### D1. One shader that follows the light path through the eye

**Choice.** A single composite pass, in the order lids → tear film and cornea → chamber and iris → lens → optics → dichromat colour → retinal acuity map → field loss → gain, glare and noise → temporal (`src/shaders.js`, `STAGES` in `src/model.js`).

**Why.** Each stage changes the light before the next one sees it, so the order matters. Light is scattered by the cornea before the retina samples it, and field loss in the retina is not blurred by the optics. The three research passes proposed different orders. The catalog reconciles them into this one (catalog §S3).

**Combination rules** (catalog §S3, from Part III §8). Transmissions multiply. Blur widths add in quadrature. Field masks take the minimum. These are standard optics conventions (independent Gaussian blurs convolve to a Gaussian whose variance is the sum). **Established** as optics, and an approximation for real non-Gaussian point spread functions.

### D2. Every spatial value in degrees of visual angle, not pixels

**Choice.** `px_per_deg = width_px / camera_hfov_deg`. The user sets the camera's horizontal field of view, 50° by default.

**Why.** Acuity, straylight and field loss are defined in degrees. A pixel-based blur would make the same dog see differently on a phone and on a monitor. Two exceptions remain: the old Part III blur *fractions* are converted with a 25° reference, and geometry fractions with a 120° reference (`REF_BLUR` and `REF_FOV` in `src/model.js`). Night noise is still in pixels (audit P8, not done).

---

## 2. Normal adult dog vision

### D3. Dichromat colour from a dog-specific matrix, not a stock deuteranopia filter

**Choice.** A 3×3 matrix in linear RGB built from the dog's own cone sensitivities (`L_DOG`, `S_DOG` and `dogMatrix` in `src/model.js`).

**Evidence.** Dogs have two cone classes, with an S cone at about 429–435 nm and an L cone at about 555 nm (Neitz, Geist & Jacobs 1989; Jacobs et al. 1993). The neutral point is about 480 nm, against about 505 nm for a human deuteranope (Neitz 1989, via Miller & Murphy 1995). **Established.** The matrix is our own derivation from Govardovskii A1 photopigment templates, and it predicts a neutral point of 485 nm, which agrees with the behavioural figure (catalog Part I §1.4–1.5).

**Caveat.** The matrix is model-derived and has not been checked against spectral rendering (catalog §S6.8).

### D4. Baseline acuity of 8 cpd, with blur σ = 0.389 / cpd

**Choice.** An adult dog's default resolution limit is 8 cycles per degree (`VISION_DEFAULTS.cpd`). This is turned into a Gaussian blur of σ ≈ 0.389 / cpd degrees, about 3 arcmin at 8 cpd.

**Evidence.** Dog grating acuity is typically 6–12 cpd (about 20/75). The best individuals reach 19.5 cpd (Lind et al. 2017, behavioural, 43 cd/m²; Murphy et al. 1997, sweep VEP, 7.0–9.5 cpd in beagles). **Established.** 8 cpd sits at the cautious end of the typical range.

**Measured.** The adult Labrador preset resolves **6.4 cpd** in the grating test (target 5.5–9.0). It falls a little below 8 because the contrast-sensitivity stage also removes low-contrast detail.

### D5. Night: brighter but blurrier and noisier

**Choice.** Under dim light, acuity drops to about 0.36× the photopic value. Rod luminance replaces the cone colour signal (mesopic weight `m`), and gain and noise rise.

**Evidence.** At 0.0087 cd/m², dogs resolved 1.8–3.5 cpd, against 5.9–9.9 cpd for humans (Lind et al. 2017). **Probable** (one study). The dog's advantage at night is detection, not detail. Night *gain* (default 2.5×) has no dog measurement. It is extrapolated from cats and exposed as a slider (catalog §S3). **Speculative.**

### D6. Retinal topography by skull shape

**Choice.** A per-pixel blur map that changes from a round area centralis (short noses) to a horizontal visual streak (long noses), driven by one parameter `s` computed from the cephalic index.

**Evidence.** The ratio of ganglion-cell densities between the area centralis and the streak correlates with nose length (r = −0.795, McGreevy, Grassi & Harman 2004, n = 22). **Established.** The exact blur values per zone are **Speculative** (catalog Part I §4, Part II §A1).

### D7. Field of view and binocular overlap

**Choice.** Total field from 200° (brachycephalic) to 270° (long-nosed), and binocular overlap from 60° to 30°.

**Evidence.** Overlap is 30–60° behaviourally (Miller & Murphy 1995). The per-skull field figures are popular values without a primary source found. **Probable** for the overlap range, **Speculative** for the per-breed values (catalog §S3, §S6.4).

---

## 3. The "Senior, 15" reference presets

These presets model a representative 15-year-old mixed-breed senior case with dry eye (KCS), asymmetric corneal changes, and nuclear sclerosis without cataract: a cloudy left eye (grade-2-like stromal haze with small central pigment dots) and a mostly clear right eye (small focal white scars). The parameter mapping is documented in the realism audit, §2.

An earlier version of these presets was about **4× too blurry**: it measured 1.1–1.3 cpd, near "counting fingers" for a human. It was fixed in commit `e574629` by calibrating against measured targets (D8–D9) rather than stacking separate blur terms. The entries below describe the fixed version.

### D8. Blur set by target acuity, as logMAR penalties over the baseline

**Choice.** Each eye's blur comes from an acuity *penalty* in logMAR, applied to the baseline in quadrature: `σ_total = σ_baseline × 10^ΔlogMAR` (`dLogMAR` in `src/model.js`). Penalties:

| Source | Penalty | Basis | Confidence |
|---|---|---|---|
| Optical and neural ageing | up to 0.11 logMAR at end of life | Engineering estimate scaled by age / lifespan | Speculative |
| Corneal scar (haze) | 0.15 × severity | Grade-2 corneal haze costs about 0.2–0.3 logMAR in humans (post-PRK haze grading). Most of the haze's effect goes through straylight (D9) instead | Probable in humans; **human-derived** |
| Lipid deposits | 0.15 × severity | Same reasoning as scar | Speculative; **human-derived** |

**Why not stack blur terms.** The earlier build added separate blurs for the age-related cataract risk, nuclear sclerosis, age NS and scars. Together they gave the clearer eye about 1.4 cpd before contrast losses (audit P1, Measured). Calibrating to a target acuity makes the result testable.

**Targets** (audit §1). The clearer right eye 4.5–6 cpd, the cloudy left eye 3–4.5 cpd, and both eyes together about the clearer eye. These ranges are themselves estimates: a 6–12 cpd adult baseline minus human-derived penalties for haze and ageing.

**Measured** (fresh tear film, `tests/realism.py`, run on 2026-11-26):

| Preset | Measured | Target |
|---|---|---|
| Adult Labrador (control) | 6.4 cpd | 5.5–9.0 |
| Senior, 15: clearer right eye | 5.1 cpd | 4.5–6.0 |
| Senior, 15: cloudy left eye | 4.0 cpd | 3.0–4.5 |
| Senior, 15: both eyes | 4.9 cpd | 4.0–6.0 |

### D9. Fog as straylight with a CIE 1/θ² spread

**Choice.** Corneal haze, lens ageing and pigment are modelled as one straylight parameter log(s). It is turned into a scattered fraction `η = 1 − exp(−0.0086·s)`, and the scattered light is spread as the sum of Gaussian-pyramid levels with equal weights. That approximates the `s/θ²` tail of the CIE glare spread function (`logS` and `veil` in `src/model.js`).

**Evidence.**

- Intraocular straylight follows the CIE 2002 glare spread function, with a tail of about `s/θ²` from 1° to 30° (CIE 146:2002; van den Berg). **Established** in humans.
- In humans, log(s) is about 0.9 in young eyes, stable until the 40s, then rises about 0.15 log per decade and doubles by 65. Pre-surgery cataract eyes aged 80–90 sit at about 1.57 (Łabuz et al. 2015). **Established** in humans.
- An equal weight per octave of radius gives a 1/θ² falloff. This is a mathematical identity, checked numerically in the audit.

**Dog transfer (human-derived, Speculative).** The model treats a dog at age/lifespan `a` as a human of 75·a years. Corneal haze adds 0.7 × scar severity to log(s). No dog straylight data exist.

| Eye | Target η | Measured η | Measured log(s) |
|---|---|---|---|
| Adult Labrador | 0.03–0.12 | 0.07 | 0.90 |
| Clearer right eye | 0.18–0.30 | 0.24 | 1.49 |
| Cloudy left eye | 0.35–0.50 | 0.43 | 1.81 |

**Measured falloff.** For a 0.5° light, the veil between 1° and 4° falls with a slope of −1.68 to −1.72 (target −1.3 to −2.6; −2.0 would be an exact 1/θ²). The light's core keeps 0.44 of its energy in the clearer eye and 0.31 in the cloudy eye.

**Why not a contrast cut.** The earlier build mixed toward the image mean *and* multiplied contrast down *and* added bloom. That counted the same scattered light three times, and it did nothing around a lamp in a dark scene (audit P2). Straylight conserves energy: light that leaves a lamp lands around it.

### D10. Corneal effects are field-wide, never spots in the picture

**Choice.** Corneal haze, pigment, scars and the tear film change the whole view (veil, contrast, blur, dimming). They are never drawn as local spots, streaks or warps in image space.

**Why.** The cornea sits almost at the pupil, far out of focus. Each point on it sends light to the whole retina, so an opacity there spreads over the whole field. It does not appear as a shape. This is standard geometric optics (the same reason a smudge on a camera's front element shows as flare, not as a smudge). **Established.**

### D11. Corneal pigment absorbs; it does not scatter

**Choice.** The cloudy eye's few central pigment dots dim the image neutrally (luminance about × 0.9). They add no tint, blur or field wedge. The clearer eye has no pigment term because it models small focal white scars rather than pigment.

**Why.** Melanin absorbs light. A few dots covering about 10% of the pupil remove about 10% of the light (audit §2). **Probable.** The 10% coverage is an illustrative estimate, not a clinical measurement.

### D12. Nuclear sclerosis: a small myopic shift and lens yellowing, no blur term

**Choice.** No blur bucket for nuclear sclerosis. It adds about −0.5 D of lenticular myopia (the defocus term, which grows with object distance) and a slight loss of blue–yellow contrast.

**Evidence.** Veterinary consensus is that nuclear sclerosis causes little visual loss. Owners see the blue sheen, but the dog does not see a blue world (catalog Part III §1.2). **Established.** A 2024 study measured the refractive shift in 229 eyes from 118 dogs (PMC10842750), but we could not open the full text, so the exact dioptre value is not taken from it. The −0.5 D figure is **Probable**.

### D13. No age-related cataract term when cataract is absent

**Choice.** The age-based cataract risk (`catAge`) no longer blurs the image.

**Why.** It is a population prior: 50% of dogs have some cataract by 9.4 ± 3.3 years, and all dogs over 13.5 years have some lens opacity (catalog §S2.12). When nuclear sclerosis is present without cataract, an explicit finding beats a population prior.

### D14. White stays white: renormalisation for lens yellowing

**Choice.** Lens yellowing lowers the gain of the blue–yellow channel instead of tinting the image sepia.

**Evidence.** The visual system adapts to its own lens over months. Older humans do not see the world yellow, and the shift reverses gradually after cataract surgery (Delahunt, Webster & Werner 2004). **Established** in humans, **Probable** for dogs; **human-derived**. Lens transmission data for ageing dogs do not exist (catalog §S6.5).

### D15. Dry eye: a clear phase, then gradual degradation

**Choice.** After each blink the tear film is clear until the break-up time (`tbu`). Over the next 3 s, blur grows by up to (1 + 0.6 × severity), straylight η rises by up to 0.08 × severity, and a faint drifting ghost about 1.5 σ away appears (`render()` in `src/app.js`).

**Evidence.** In human dry eye, the objective scatter index roughly doubles (1.53 vs 0.73), and functional acuity drops by about 0.06 logMAR on average over a blink-free interval (PMC10068140). **Established** in humans; **human-derived**. Normal dog tear break-up time is about 20 s, and KCS dogs are often under 10 s (audit P5).

**Preset values (Speculative).** Break-up time 4 s (cloudy eye) and 6 s (clearer eye), with a blink every 6 s. These are placeholders until measured (see [What we don't know](unknowns.md)).

**Measured, dry phase** (5.8 s after a blink): the cloudy eye drops to **2.75 cpd**, below its 3–4.5 cpd fresh-film target. The clearer eye does not reach its dry phase before the next blink. The regression test checks only the fresh phase.

### D16. No squint and no mucus by default

**Choice.** Squint and mucus default to 0 for both eyes.

**Why.** Squint and discharge should come from direct observation, not from a KCS diagnosis alone (audit §2). The controls remain for days when they apply.

### D17. Both eyes: the clearer eye leads where the fields overlap

**Choice.** Each eye is rendered separately. Inside the binocular zone (±21° for a mesocephalic skull shape), the two images are mixed 75 : 25 in favour of the clearer eye (`FS_BLEND` in `src/shaders.js`, "Clearer-eye dominance" slider). Outside it, each side shows only its own eye.

**Why.** With unequal eyes, binocular vision is usually close to the better eye, and the poorer eye still adds some veil. The 75% weight is an engineering choice, **Speculative**. A linear mix of two images is not how binocular combination works. See [What we don't know](unknowns.md#how-binocular-blending-is-modelled).

**Measured.** Both eyes together: 4.9 cpd (fresh), 4.7 cpd (dry phase), against 5.1 cpd for the clearer eye alone.

### D18. Lifespan of 14 years for the senior presets

**Choice.** The senior presets use a lifespan of 14 years, so a 15-year-old dog is at age/lifespan ≈ 1.07.

**Why.** Age effects are scaled by lifespan, because a 10-year-old Great Dane and a 10-year-old toy poodle are at very different life stages (catalog Part II §B0). 14 years is a working value for a medium-sized mixed breed. **Speculative.**

---

## 4. How accuracy claims are checked

The first version of the senior presets was presented as realistic before it was measured, and it was about 4× too blurry. Since commit `e574629`, no preset is described as faithful unless it passes these tests:

```
node tests/probe.js tests/out && python3 tests/realism.py tests/out
```

1. **Grating acuity.** 50%-contrast sine gratings at 1–16 cpd, at 60 px/deg. The frequency where output modulation falls to 0.1 is the preset's effective acuity. It must fall in the target range.
2. **Glare spread.** A 0.5° light on black. The veil between 1° and 4° must fall roughly as 1/θ², and the core must keep a sensible share of its energy.
3. **Straylight fraction.** Each eye's η must sit in its target range.

**What passing means.** The simulator matches *our targets*. The targets are estimates, and several of them are human-derived. Passing does not show that any individual dog sees this way. The tests run in headless Chromium with software WebGL (SwiftShader), not on a phone GPU.

## 5. Planned but not done

From the realism audit, not yet implemented:

- **P3.** Real highlight energy for glare (HDR gain maps, exposure-based luminance).
- **P6, partly done.** The defocus kernel uses `σ ≈ 0.25·d_pupil·ΔD`, but there is no per-pixel depth, so distance is one global setting.
- **P7.** A band-limited contrast sensitivity (Laplacian pyramid, Peli 1990) instead of one threshold.
- **P8.** Night noise sized in degrees instead of pixels.
- **P9.** A sustained-plus-transient temporal filter instead of the stylised motion brightening.

## References

Full reference lists are in the [catalog](research/catalog.md) (one per part) and the [audit](research/realism-audit.md#sources). The ones this log leans on most:

- Lind O, Milton I, Andersson E, Jensen P, Roth LSV (2017). High visual acuity revealed in dogs. *PLoS ONE* 12:e0188557. https://doi.org/10.1371/journal.pone.0188557
- Neitz J, Geist T, Jacobs GH (1989). Color vision in the dog. *Visual Neuroscience* 3:119–125.
- Jacobs GH, Deegan JF, Crognale MA, Fenwick JA (1993). Photopigments of dogs and foxes and their implications for canid vision. *Visual Neuroscience* 10:173–180.
- Miller PE, Murphy CJ (1995). Vision in dogs. *JAVMA* 207:1623–1634.
- Murphy CJ, Mutti DO, Zadnik K, Ver Hoeve J (1997). Effect of optical defocus on visual acuity in dogs. *Am J Vet Res* 58:414–418.
- McGreevy P, Grassi TD, Harman AM (2004). A strong correlation exists between the distribution of retinal ganglion cells and nose length in the dog. *Brain Behav Evol* 63:13–22.
- Mowat FM et al. (2008). Topographical characterization of cone photoreceptors and the area centralis of the canine retina. *Mol Vis* 14:2518–2527.
- CIE 146:2002 / 147:2002. CIE equations for disability glare. https://cie.co.at/publications/cie-collection-glare-2002
- Łabuz G et al. (2015). Ocular straylight in the normal pseudophakic eye. https://repub.eur.nl/pub/102424/
- Simultaneous real-time analysis of tear film optical quality dynamics and functional visual acuity in dry eye disease. https://pmc.ncbi.nlm.nih.gov/articles/PMC10068140/
- Quantifying refractive error in companion dogs with and without nuclear sclerosis (2024). https://pmc.ncbi.nlm.nih.gov/articles/PMC10842750/ (full text not read)
- Cited from memory in the audit, not re-checked: Delahunt PB, Webster MA, Werner JS (2004) on colour renormalisation after cataract surgery; Fantes FE et al. (1990) on corneal haze grading; Peli E (1990) on contrast in complex images; de Rivera C et al. (2005) on contrast sensitivity in ageing beagles.
