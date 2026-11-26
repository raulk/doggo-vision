# What we don't know

This simulator is an estimate. This page lists where it rests on guesses, on human data, or on nothing at all, so nobody mistakes a render for a measurement. Each item says what the simulator does in the meantime and what would settle it.

The choices themselves, and their sources, are in the [decisions log](decisions.md).

## 1. No one knows what a dog sees

No dog can report its percept. Every render here is a model of the *optics and retina* of the eye, fed with measurements where they exist. Even a perfect optical model would not show what the dog's brain makes of the signal. A dog with poor acuity may still use smell, hearing, motion and memory of its home so well that it seems to see better than the render suggests.

## 2. Human-derived parameters and engineering estimates

The simulator uses these **Speculative** parameters where direct calibration for canine vision is unavailable.

| What | Value used | Evidence and limits |
|---|---|---|
| How straylight grows with age | log(s) starts at 0.9 and increases by 0.13 per human-equivalent decade after 40. A dog at age/lifespan `a` is mapped to 75·a years | Human studies report age-related straylight, including preoperative log(s) of 1.57 ± 0.25 at 80–90 years in cataract patients. The canine age mapping is an engineering estimate. No normative canine wide-angle straylight function in units of s was found. [Łabuz et al. 2015, Table 2](https://repub.eur.nl/pub/102424/G.Labuz_PhD_Thesis.pdf) |
| How much corneal haze scatters | +0.7 log(s) per unit of scar severity | Engineering estimate informed by human straylight data |
| How much haze costs in acuity | 0.15 logMAR per unit of scar severity | Engineering estimate. Fantes et al. examined and graded 29 rhesus-monkey corneas after PRK. Their histopathology study supplies no logMAR calibration. [Fantes et al. 1990](https://jamanetwork.com/journals/jamaophthalmology/article-abstract/638442) |
| Tear-film degradation | Blur ×1.36 and η increase of up to about 0.05 at full dryness (severity 0.6) | During blink suppression, human dry-eye and control groups differed by 0.06 logMAR in mean functional acuity. The OSI means, 1.53 and 0.73, are double-pass index values. These group results provide no within-blink trajectory or calibration of η. [PMC10068140](https://pmc.ncbi.nlm.nih.gov/articles/PMC10068140/) |
| Colour renormalisation after lens yellowing | Whites stay white and blue–yellow gain is reduced | Four human cataract patients showed slow, partial adaptation after surgery. Normal canine whole globes transmitted about 1.6 times as much UV as nuclear-sclerotic globes. The visible opponent gain remains an engineering estimate. [Delahunt et al. 2004](https://pubmed.ncbi.nlm.nih.gov/15518204/) · [Himebaugh et al. 2023](https://pubmed.ncbi.nlm.nih.gov/37356536/) |
| Optical and neural ageing | Up to 0.11 logMAR | Engineering estimate. Longitudinal acuity calibration for senior dogs remains open |
| Refraction shift from nuclear sclerosis | Severity-dependent myopic prior, overridden by measured total refraction for that eye | Full-text canine data cover 229 eyes from 118 dogs. Mean refraction for grades 0/1/2/3 was +0.04 / −0.11 / −0.44 / −0.63 D. The age-adjusted mean shift was small and nonsignificant. Myopia exceeding 1.5 D rose from 6.9% to 30.4% across grades. Individual shifts remain uncertain. [Francis et al. 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC10842750/) |

The fresh-tear acuity targets for the senior presets (clearer eye 4.5–6 cpd, cloudy eye 3–4.5 cpd) are engineering estimates. The tests check whether the renderer hits those targets.

## 3. Clinical inputs needed to calibrate an individual senior dog

The "Senior, 15" presets use working estimates for a representative senior KCS/nuclear-sclerosis case. For any individual dog, these clinical measurements would replace guesses with data:

| Missing | Would set | Current guess |
|---|---|---|
| Slit-lamp haze grade, per eye (0–4) | log(s) and η for each eye | Grade 2 (cloudy left), about 0–1 (clearer right), illustrative estimate |
| Fluorescein tear break-up time, per eye | When the dry phase starts | 4 s (left), 6 s (right). One canine cohort measured 25.82 ± 5.47 s in controls and 10.78 ± 4.23 s in dogs with KCS. [Nascimento et al. 2023](https://pubmed.ncbi.nlm.nih.gov/35544927/) |
| Blink rate | Length of each tear cycle | One blink every 6 s |
| Schirmer tear test, per eye | Dry-eye severity | 0.6 (left), 0.4 (right) |
| Retinoscopy (refraction), per eye | Total refraction used for defocus | Severity-dependent NS prior |
| Menace and dazzle responses, per eye | Sanity check that both eyes see | Assumed both see |
| Current treatment (cyclosporine, tacrolimus, artificial tears) | Whether the dry phase is ever reached | Assumed untreated between drops |
| Indoor room brightness | Scene luminance | 50 cd/m² indoors |

Simple behavioural checks can also sanity-check a preset (realism audit §5): detection distance for a rolled grey toy, hesitation near bright windows or lamps at night, and obstacle avoidance under one dim lamp.

## 4. How binocular blending is modelled

The "both eyes" view renders each eye with its own refraction and iris settings. A modelled optical-quality score selects the dominant eye. The illustrative pixel blend weights that eye **75:25** inside the ±21° overlap zone. Outside it, each side shows only its own eye.

- The blend and its weight are **Speculative**. Human experiments show that asymmetric optical quality affects binocular summation. Canine fusion weights remain unmeasured. [Human binocular experiment](https://pmc.ncbi.nlm.nih.gov/articles/PMC6202146/)
- The overlap width comes from the skull-shape model. Behavioural perimetry supports 30–60° of overlap in the dogs tested. Per-breed interpolation is **Speculative**. [Sherman & Wilson 1975, Fig. 1](https://bpb-us-w2.wpmucdn.com/voices.uchicago.edu/dist/a/2050/files/2019/11/19-1975-SMS-Wilson-VD-dog-JCN.pdf)
- At the default 50° camera field, most of the picture sits inside the blended zone. The wider monocular crescents are largely outside the camera crop.

## 5. Limits of validation

- **Browser regressions.** Fresh and dry tear phases are covered. The audited cloudy-eye grating cutoff changed from 4.27 to 2.83 cpd. The clearer eye stayed at 5.31 cpd. These are renderer outputs.
- **Optical checks.** Float-buffer checks cover analytic Gaussian MTF, FOV invariance, float PSF and zero optical light on black input. The screenshot regressions also check halo falloff and core luminance, with precision limited by 8-bit capture. The exported η is an internal model value.
- **Real-device coverage.** The browser tests use headless Chromium with SwiftShader. Testing on a real iPhone GPU remains open.
- **Calibration scope.** Gratings and point sources check selected optical properties. The adult control has a wide preset target, and individual disease effects still use engineering estimates. Comparison with clinical and behavioural measurements remains open.

## 6. Gaps in the basic science

From the catalog (§S6), these hold for every preset:

1. No measured dog contrast-sensitivity curve. The "peak about 3 cpd, 2–3× worse than human" shape is inferred.
2. Canine threshold ERG studies exist. A canine-to-human behavioural absolute detection ratio suitable for setting night gain remains open. Night gain is extrapolated from cats. [Canine threshold ERG](https://pubmed.ncbi.nlm.nih.gov/8669769/)
3. Maze navigation and ERG studies measure visual function in affected dogs, including dogs with sudden acquired retinal degeneration syndrome (SARDS). The dog’s conscious percept remains unobservable. [SARDS maze and ERG study](https://pmc.ncbi.nlm.nih.gov/articles/PMC13482314/)
4. Primary studies report refraction by breed. The simulator’s per-breed visual-field interpolation still lacks primary validation. [Murphy et al. 1992, PMID 1634344](https://pubmed.ncbi.nlm.nih.gov/1634344/) · [Kubai et al. 2008, AJVR 69:946–951](https://pubmed.ncbi.nlm.nih.gov/18593249/)
5. Himebaugh et al. measured whole-globe UV transmission in dogs. Normal eyes transmitted about 1.6 times as much UV as nuclear-sclerotic eyes. Age-dependent visible lens spectra remain unmeasured. [Himebaugh et al. 2023](https://pubmed.ncbi.nlm.nih.gov/37356536/)
6. No dog figure for tapetum gain.
7. Canine rod-driven ERG responses approached a plateau at 25–30 minutes under the tested dark-adaptation protocol. Behavioural dark-adaptation curves and canine stereoacuity remain unmeasured. [Canine ERG time course](https://doi.org/10.1292/jvms.14-0647)
8. The audit checked the RGB matrix on the unclipped CIE spectral locus and evaluated direct cone templates separately (D3). A calibrated scene-to-canine-perception validation remains open.

## 7. Research that could not be read

The November 26 audit verified Francis et al. in full text. It also checked primary papers, abstracts or figures for Fantes, Delahunt, Himebaugh, the human blink-suppression study, Nascimento, Sherman & Wilson, Murphy, Kubai, Łabuz (including Table 2), Coile, Peli, Pretterer, Pongrácz and de Rivera. See the [decisions log](decisions.md#references) for the source links.

Still unavailable or unverified in that audit:

- Full paid normative texts of CIE 146:2002 and ISO 21496-1. The CIE glare domains were checked against the public CIE summary.
- Ji et al. (2024) result table for the quoted condition-specific F1 scores. The bibliographic record was accessible.
- The 1936 police-dog primary report behind the moving and stationary target-distance figures. The figures were traced to a later veterinary review.

## Depth, panoramas and time

- **Monocular depth.** Depth Anything V2 Small estimates relative inverse depth from one image. Percentile normalization and the near and far controls supply approximate scale. Reflections, occlusions and stitched seams can produce depth errors that affect focus. Procedural maps use authored object distances.
- **Panorama geometry.** GPano crops use their recorded angular extents. Cylindrical images inferred from aspect ratio have approximate angular extents. The dome models head orientation and the angular field of each breed. It lacks parallax for nearby objects.
- **Temporal physiology.** The fast and sustained impulse-response constants, edge-accent strength and adaptation kinetics are modelling assumptions. Canine temporal impulse responses and perceptual recovery curves for these presets have yet to be measured. The adaptation curves use scene-level luminance in place of a measured retinal light history.
