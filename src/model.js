// ---------- Model: catalog values, profile -> derived -> condition hypotheses -> shader parameters ----------
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a)*t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0)/(e1 - e0), 0, 1); return t*t*(3 - 2*t); };
const sigmoid = x => 1/(1 + Math.exp(-x));
const REF_FOV = 120; // catalog Part III expresses image fractions for a ~120 degree image
const frac = f => f*REF_FOV; // fraction of image width -> degrees, for geometry (radii, field positions)
// Part III blur fractions are calibrated against its baseline acuity_sigma_frac = 0.002, which Part I puts at about
// 3 arcmin. Converting them with a 25 degree reference keeps condition blur in proportion to normal dog acuity.
const REF_BLUR = 25;
const fracB = f => f*REF_BLUR;

// Part I §1.5: linear sRGB -> dog cone catches, and the display axis for the single opponent channel
const L_DOG = [0.1824, 0.6697, 0.1478];
const S_DOG = [0.0367, 0.0656, 0.8977];
const ROD = [-0.0508, 0.6586, 0.3922];
const B_AXIS = [-0.190, -0.0445, 1.0];
function dogMatrix(k){ // rows; k = 1 is the catalog's recommended matrix
  return [0, 1, 2].map(i => [0, 1, 2].map(j => L_DOG[j] + k*B_AXIS[i]*(S_DOG[j] - L_DOG[j])));
}

// Breed table: cephalic index (anchors Speculative), lifespan, refraction offset (Part II A5), cataract multiplier, tapetum
const BREEDS = {
  mixed:       {name:'Mixed breed', ci:62, L:13, dD:0, cat:1, tap:1},
  labrador:    {name:'Labrador retriever', ci:62, L:12.5, dD:0, cat:1.2, tap:1},
  golden:      {name:'Golden retriever', ci:60, L:12, dD:0, cat:1.2, tap:1},
  gsd:         {name:'German shepherd', ci:56, L:11, dD:-1, cat:1, tap:1},
  rottweiler:  {name:'Rottweiler', ci:62, L:10, dD:-1, cat:1, tap:1},
  greyhound:   {name:'Greyhound', ci:46, L:12.5, dD:0, cat:1, tap:1},
  whippet:     {name:'Whippet', ci:48, L:13.5, dD:0, cat:1, tap:1},
  collie:      {name:'Rough collie', ci:48, L:13, dD:0, cat:1, tap:1},
  aussie:      {name:'Australian shepherd', ci:60, L:13, dD:0.75, cat:2, tap:1},
  husky:       {name:'Siberian husky', ci:60, L:13, dD:0, cat:2, tap:1},
  malamute:    {name:'Alaskan malamute', ci:60, L:11, dD:0.75, cat:1, tap:1},
  poodle_toy:  {name:'Toy poodle', ci:60, L:14.5, dD:-1, cat:3, tap:0.88},
  schnauzer:   {name:'Miniature schnauzer', ci:62, L:13.5, dD:-1, cat:2, tap:0.88},
  cocker:      {name:'Cocker spaniel', ci:64, L:12.5, dD:0, cat:2, tap:1},
  bichon:      {name:'Bichon frise', ci:66, L:14, dD:0, cat:3, tap:0.88},
  boston:      {name:'Boston terrier', ci:82, L:12, dD:0, cat:3, tap:0.88},
  pug:         {name:'Pug', ci:88, L:13, dD:0, cat:1, tap:0.88},
  frenchie:    {name:'French bulldog', ci:86, L:11, dD:0, cat:1, tap:0.88},
  shihtzu:     {name:'Shih Tzu', ci:85, L:13.5, dD:0, cat:1, tap:0.88},
  chihuahua:   {name:'Chihuahua', ci:78, L:14.5, dD:0, cat:1, tap:0.88},
  greatdane:   {name:'Great Dane', ci:58, L:7.5, dD:0, cat:1, tap:1},
};

// Conditions, grouped along the light path. photo = detectability from a macro eye photo (Part III / S5).
const GROUPS = [
  ['adnexa', 'Lids and third eyelid'], ['cornea', 'Tear film and cornea'], ['uvea', 'Chamber, iris and pressure'],
  ['lens', 'Lens'], ['retina', 'Vitreous, retina and optic nerve'], ['globe', 'Whole globe'],
];
const CONDS = [
  {id:'cherry_eye', g:'adnexa', name:'Cherry eye', photo:'yes', d:'Prolapsed third-eyelid gland. A small soft occluder low on the nasal side.', s:0.5},
  {id:'entropion', g:'adnexa', name:'Entropion', photo:'yes', d:'Inrolled lid. Indirect effects: squint, tearing and a wet blur.', s:0.5},
  {id:'horner', g:'adnexa', name:'Horner syndrome', photo:'yes', d:'Small pupil, drooping upper lid and a raised third eyelid.', s:0.6},
  {id:'kcs', g:'cornea', name:'Dry eye (KCS)', photo:'partly', d:'Tear film breaks up between blinks: blur grows, patches warp, mucus smears, bright light makes the dog squint. Animated.', s:0.5, extras:[{k:'chronic', t:'bool', label:'Chronic (adds pigment)'}]},
  {id:'pigmentary_keratitis', g:'cornea', name:'Pigmentary keratitis', photo:'yes', d:'Melanin on the cornea, usually from the nasal side, veiling the temporal field. Present in about 92% of UK pugs.', s:0.35, extras:[{k:'origin', t:'sel', label:'Starts from', opts:[['medial','Nasal cornea'],['temporal','Temporal cornea'],['diffuse','Diffuse']]}]},
  {id:'corneal_edema', g:'cornea', name:'Corneal edema', photo:'yes', d:'Blue-white corneal haze with coloured halos around lights.', s:0.5},
  {id:'corneal_ulcer', g:'cornea', name:'Corneal ulcer', photo:'partly', d:'Local haze and warp over the ulcer, tearing and a squint.', s:0.5},
  {id:'pannus', g:'cornea', name:'Pannus (CSK)', photo:'yes', d:'Pink-brown vascular tissue creeping in from the temporal cornea, veiling the nasal field.', s:0.4},
  {id:'lipid_dystrophy', g:'cornea', name:'Corneal lipid deposits', photo:'yes', d:'Soft white veil, mild glare and a faint sparkle.', s:0.4},
  {id:'glaucoma', g:'uvea', name:'Glaucoma', photo:'partly', d:'Pressure causes edema, halos and dimming. Nerve damage closes the field with arc-shaped gaps.', s:0.4, extras:[{k:'damage', t:'num', label:'Nerve damage', min:0, max:1, step:0.01, def:0.4}]},
  {id:'uveitis', g:'uvea', name:'Uveitis', photo:'partly', d:'Aqueous flare fogs the view; a small pupil dims it; floaters drift; pus settles low in the chamber and hides the upper field.', s:0.45},
  {id:'hyphema', g:'uvea', name:'Hyphema', photo:'yes', d:'Blood in the chamber: red haze and an upper-field occluder as blood settles.', s:0.4},
  {id:'iris_atrophy', g:'uvea', name:'Iris atrophy', photo:'yes', d:'The pupil cannot close fully: glare, light sensitivity and faint ghosts.', s:0.5},
  {id:'nuclear_sclerosis', g:'lens', name:'Nuclear sclerosis', photo:'partly', d:'Normal ageing of the lens core. Small effects: slight blur, contrast loss and bloom, mild myopic shift. Owners see blue haze; the dog does not.', s:0.6},
  {id:'cataract', g:'lens', name:'Cataract', photo:'yes', d:'Lens opacity scatters light: haze, contrast loss, glare and blur. Mature cataract leaves only light and dark.', s:0.5, extras:[{k:'type', t:'sel', label:'Type', opts:[['cortical','Cortical spokes'],['nuclear','Nuclear'],['posterior_subcapsular','Posterior subcapsular'],['diffuse','Diffuse']]},{k:'hypermature', t:'bool', label:'Hypermature (crystals)'}]},
  {id:'lens_luxation', g:'lens', name:'Lens luxation', photo:'partly', d:'Displaced lens: a doubled ghost image that wobbles, plus blur.', s:0.5},
  {id:'asteroid_hyalosis', g:'retina', name:'Asteroid hyalosis', photo:'partly', d:'Small bright particles that swirl in the vitreous. Usually minimal effect.', s:0.5},
  {id:'pra', g:'retina', name:'Progressive retinal atrophy', photo:'no', d:'Night vision fails first, then the field closes to a tunnel, then blindness. Often a secondary cataract late.', s:0.5},
  {id:'sards', g:'retina', name:'SARDS', photo:'no', d:'Sudden acquired retinal degeneration: global loss of light and contrast within days.', s:0.6},
  {id:'cea', g:'retina', name:'Collie eye anomaly', photo:'no', d:'Usually silent; colobomas make small blind spots; severe cases detach.', s:0.5},
  {id:'retinal_detachment', g:'retina', name:'Retinal detachment', photo:'partly', d:'A curtain of lost field moving in from one side.', s:0.4, extras:[{k:'dir_deg', t:'num', label:'Curtain from', min:0, max:359, step:1, def:90, unit:'°'}]},
  {id:'retinal_dysplasia', g:'retina', name:'Retinal dysplasia', photo:'no', d:'Retinal folds and geographic patches become streaky blind spots.', s:0.5},
  {id:'optic_neuritis', g:'retina', name:'Optic neuritis', photo:'no', d:'Central blind spot, faded colour and lower contrast (human analogue).', s:0.5},
  {id:'microphthalmia', g:'globe', name:'Microphthalmia (merle)', photo:'partly', d:'Small eye from double merle: blur, smaller field and coloboma gaps.', s:0.5},
];
const COND_BY_ID = Object.fromEntries(CONDS.map(c => [c.id, c]));

const VISION_DEFAULTS = {cpd:8, chroma:1, csf:0.03, periph:3, nightGain:2.5, lower:0.18, noise:0.5, veil:0.05, salience:0.2, rodTau:100, ageLens:0.5, hdr:4};

function catStage(s, hyper){ if(hyper) return 'hypermature'; return s < 0.15 ? 'incipient' : s < 0.85 ? 'immature' : 'mature'; }
function skullOf(ci){ return ci >= 80 ? 'brachycephalic' : ci <= 52 ? 'dolichocephalic' : 'mesocephalic'; }

// Stage ids in the order the catalog's S3 table lists them
const STAGES = [
  {n:0, name:'Decode', fixed:true, tip:'sRGB to linear light'},
  {n:1, name:'Geometry', tip:'Muzzle silhouette and field zones'},
  {n:2, name:'Lids', tip:'Squint, ptosis, third eyelid, blinks'},
  {n:3, name:'Tear film & cornea', tip:'Tear break-up, pigment, pannus, edema, ulcers'},
  {n:4, name:'Chamber & iris', tip:'Pupil size and glare, hyphema, uveitis'},
  {n:5, name:'Lens', tip:'Nuclear sclerosis, cataract, luxation'},
  {n:6, name:'Optics', tip:'Base acuity, defocus, puppy development'},
  {n:7, name:'Colour', tip:'Dichromat matrix and rod mixing'},
  {n:8, name:'Retinal acuity', tip:'Visual streak or area centralis, contrast sensitivity'},
  {n:9, name:'Field loss', tip:'Tunnel vision, scotomas, curtains'},
  {n:10, name:'Gain, glare, noise', tip:'Night gain, tapetum, veiling glare, bloom, noise'},
  {n:11, name:'Temporal', tip:'Rod integration, motion salience, blinks, particles'},
  {n:12, name:'Encode', fixed:true, tip:'Linear to sRGB'},
];

// Compile state -> {derived, hyp, shader (schema §8 part 3), U (uniforms), anim}
function compile(state, srcInfo){
  const P = state.profile, V = state.vision, S = state.scene, on = state.stages;
  const br = BREEDS[P.breed] || BREEDS.mixed;
  const age = P.age_years, L = P.lifespan_years, a = age/L;
  const s = clamp((80 - P.ci)/30, 0, 1);
  const brachy = P.ci >= 80;
  const F = lerp(200, 270, s), B = lerp(60, 30, s), noseW = lerp(3, 22, s);
  const topoH = lerp(15, 45, s), topoV = lerp(15, 10, s);
  const tw = age*52, closed = tw < 2;
  const dev = closed ? 0 : smooth(2, 7, tw)*smooth(4, 14, tw);
  const NS = V.ageLens > 0 ? smooth(0.45, 0.85, a) : 0;
  const catAge = clamp(sigmoid((a - 0.75)/0.12)*br.cat, 0, 1)*V.ageLens;
  const Amax = 2.5*(1 - smooth(0.4, 0.9, a)) + 0.5;
  const ys = age*12.5/L;
  const Rp = clamp(1 - 0.028*(ys - 1), 0.2, 1), Rs = clamp(1 - 0.035*(ys - 1), 0.1, 1);
  const fc = lerp(75, 58, smooth(0.5, 1.0, a));
  const coat = P.coat;
  let pig = 1; if(coat === 'merle_MM' || coat === 'white') pig = 0.2; else if(coat === 'merle_Mm' || P.iris === 'blue') pig = 0.5; else if(coat === 'dilute') pig = 0.8;
  const T = coat === 'merle_MM' ? 0 : P.tapetum;
  const m = 1 - smooth(-2, 1, S.logL); // mesopic weight, shifted ~0.5 log up from human (Coile 1989)

  // condition severities
  const C = state.conditions;
  const sv = id => (C[id] && C[id].on) ? C[id].s : 0;
  const ex = (id, k, d) => (C[id] && C[id].x && C[id].x[k] !== undefined) ? C[id].x[k] : d;
  const pra = sv('pra');
  let cat = sv('cataract'); if(pra > 0.7) cat = Math.max(cat, 0.3*(pra - 0.7)/0.3);
  const kcs = sv('kcs');
  let pk = sv('pigmentary_keratitis'); if(kcs > 0 && ex('kcs', 'chronic', false)) pk = Math.max(pk, 0.5*kcs);
  const pkOrigin = sv('pigmentary_keratitis') > 0 ? ex('pigmentary_keratitis', 'origin', 'medial') : 'medial';
  const cea = sv('cea');
  let rd = sv('retinal_detachment'); if(cea > 0.8) rd = Math.max(rd, (cea - 0.8)/0.2*0.6);
  const glS = sv('glaucoma'), glD = C.glaucoma && C.glaucoma.on ? ex('glaucoma', 'damage', 0.4) : 0;
  const uve = sv('uveitis'), hyp = sv('hyphema'), ia = clamp(0.3*smooth(0.6, 1.0, a)*(V.ageLens > 0 ? 1 : 0) + sv('iris_atrophy'), 0, 1);
  const nsC = sv('nuclear_sclerosis'), lux = sv('lens_luxation'), edema = sv('corneal_edema'), ulcer = sv('corneal_ulcer');
  const pannus = sv('pannus'), lipid = sv('lipid_dystrophy'), horner = sv('horner'), cherry = sv('cherry_eye'), entro = sv('entropion');
  const sards = sv('sards'), on_ = sv('optic_neuritis'), ast = sv('asteroid_hyalosis'), dys = sv('retinal_dysplasia'), micro = sv('microphthalmia');
  const NSall = Math.max(NS, nsC);

  // pupil (Mills 2022: max 6-11 mm), glare ∝ (d/dref)^2
  let dmin = 4.0, dmax = 9.0;
  dmin = dmin + 0.6*ia*(dmax - dmin);
  dmin = lerp(dmin, dmax, Math.max(0.6*glS, 0.5*pra, 0.7*sards));
  let pupil = lerp(dmin, dmax, m)*(1 - 0.4*uve)*(1 - 0.35*horner);
  const glarePupil = on[4] ? (pupil/6.5)**2 : 1;

  // ---- blur buckets (degrees)
  const q = x => x*x;
  let corneaB2 = 0, lensB2 = 0, opticsB2 = 0, retinaB2 = 0;
  const pkAx = clamp((pk - 0.7)/0.3, 0, 1);
  if(on[3]){
    corneaB2 += q(pkAx > 0 ? lerp(fracB(0.02), fracB(0.06), pkAx) : 0) + q(fracB(0.015)*edema) + q(fracB(0.015)*glS) + q(fracB(0.003)*lipid)
      + q(pannus > 0.6 ? fracB(0.03)*(pannus - 0.6)/0.4 : 0) + q(fracB(0.006)*entro);
  }
  if(on[5]){
    // Part D's degree values assume a 0.12 deg base blur; Part I's baseline is about 0.05 deg, so scale by 0.4
    lensB2 += q(0.4*(0.15*NS + 2.5*Math.max(0, catAge - 0.3)));
    if(nsC > 0) lensB2 += q(fracB(0.002 + 0.008*nsC));
    if(cat > 0){ let sc = cat < 0.15 ? fracB(0.005)*cat/0.15 : fracB(0.005 + 0.035*cat**1.5); if(cat > 0.9) sc = Math.max(sc, fracB(0.06)); lensB2 += q(sc); }
    lensB2 += q(fracB(0.01)*lux);
  }
  if(on[4]) lensB2 += q(fracB(0.01)*uve);
  // defocus: refraction, accommodation and object distance
  const refr = P.refraction_D + (NSall > 0 ? -1.75*lerp(0.07, 0.30, NSall) : 0);
  const need = 1/Math.max(S.dist, 0.05) + refr;
  const err = need < 0 ? -need : (need > Amax ? need - Amax : 0);
  const defocusDeg = 0.35*(pupil/1000)*err*57.2958;
  if(on[6]){ opticsB2 += q(defocusDeg); if(closed) opticsB2 += q(10); }
  if(on[9]){ retinaB2 += q(pra > 0.6 ? fracB(0.03)*(pra - 0.6)/0.4 : 0) + q(fracB(0.03)*micro); }
  const devMult = on[6] ? (closed ? 1 : 1/Math.max(dev, 0.1)) : 1;
  const cpdEff = V.cpd*lerp(1, 0.36, m); // scotopic acuity ~2-3.5 cpd (Lind 2017)
  const acuDeg = on[6] ? 0.389/cpdEff : 0;

  // ---- haze (additive, capped at 0.95)
  const hz = []; // [amount, rgb]
  if(on[3]){
    hz.push([(brachy ? 0.1 : 0.03) + 0.03*Math.max(0, age - 6) + 0.2*kcs, [1, 0.98, 0.95]]);
    hz.push([0.55*edema + 0.55*glS, [0.86, 0.93, 1]]);
    hz.push([0.25*lipid, [1, 1, 1]]);
    hz.push([0.2*pannus, [1, 0.85, 0.8]]);
    hz.push([pkOrigin === 'diffuse' ? 0.35*pk : 0.12*pk, [0.85, 0.75, 0.65]]);
  }
  if(on[4]){ hz.push([0.45*uve, [1, 0.97, 0.9]]); hz.push([0.35*hyp, [1, 0.55, 0.5]]); }
  let hAmt = 0, hCol = [0, 0, 0];
  hz.forEach(([v, col]) => { if(v > 0){ hAmt += v; hCol = hCol.map((c, i) => c + v*col[i]); } });
  hCol = hAmt > 0 ? hCol.map(c => c/hAmt) : [1, 1, 1];
  hAmt = Math.min(0.95, hAmt);

  // cataract spatial haze
  const catType = ex('cataract', 'type', 'cortical');
  const hyper = !!ex('cataract', 'hypermature', false);
  const catH = on[5] && cat > 0 ? 0.05 + 0.85*cat**1.3 : 0;
  const catC = on[5] && cat > 0 ? 0.9*cat : 0;
  const catTypeId = catType === 'cortical' ? 1 : catType === 'diffuse' ? 0 : 2;
  const catInner = clamp(lerp(0.8, 0, cat/0.7), 0, 0.8);

  // ---- contrast and luminance multipliers
  let contrast = 1, lum = 1, desat = 0;
  if(on[5]) contrast *= (1 - 0.10*NS)*(1 - 0.5*catAge)*(1 - 0.15*nsC);
  if(on[3]) { contrast *= (1 - (pkAx > 0 ? lerp(0.4, 0.9, pkAx) : 0))*(1 - 0.3*pannus)*(1 - 0.3*edema)*(1 - 0.25*glS); lum *= (1 - (pkAx > 0 ? lerp(0.3, 0.8, pkAx) : 0))*(1 - (pkOrigin === 'diffuse' ? 0.3 : 0.45)*pk*(1 - pkAx)); }
  if(on[4]) { contrast *= (1 - 0.35*uve); lum *= (1 - 0.6*glS)*(1 - 0.35*horner)*(1 - 0.3*uve)*(1 - 0.3*hyp); desat += 0.2*uve; }
  if(on[6]) contrast *= 0.3 + 0.7*(closed ? 0 : dev);
  if(on[9]) {
    contrast *= (1 - 0.7*glD)*(1 - (pra > 0.6 ? 0.6*(pra - 0.6)/0.4 : 0))*(1 - sards)*(1 - 0.5*on_);
    lum *= (1 - 0.97*sards)*(1 - 0.3*on_)*(1 - 0.3*micro)*(1 - smooth(0.9, 1.0, pra))*(glD > 0.97 ? 0.05 : 1);
    desat += 0.4*glD + 0.6*on_;
  }
  const sN = clamp(pra*2.5, 0, 1); // PRA: night loss saturates early
  if(on[9]) desat += 0.5*sN*m;
  desat = clamp(desat, 0, 1);

  // ---- glare terms (multiply: pigment × lens × pupil × brachycephalic)
  const glareLens = on[5] ? 0.15*NS + 1.0*catAge : 0;
  const glareMult = (1 + 2*(1 - pig))*(1 + glareLens)*glarePupil*(brachy ? 1.2 : 1);
  let bloom = 0;
  if(on[5]) bloom += (cat > 0 ? 0.2 + 1.5*cat : 0) + 0.3*nsC + 0.3*glareLens;
  if(on[3]) bloom += 0.6*kcs + 0.4*lipid + 0.4*edema + 0.5*glS;
  if(on[4]) bloom += 1.0*ia;
  if(on[9]) bloom += 0.4*pra;
  bloom = on[10] ? Math.min(3, bloom*(1 + 2*(1 - pig))*Math.sqrt(glarePupil)*(brachy ? 1.2 : 1)) : 0;
  const bloomDeg = cat > 0 ? lerp(frac(0.03), frac(0.15), cat) : 4;
  const halo = on[3] ? Math.min(2, 0.8*edema + 0.8*glS) : 0;
  const veil = on[10] ? V.veil*glareMult : 0;

  // ---- ghost
  let ghost = [0, 0, 0, 0];
  if(on[5] && lux > 0) ghost = [0.4*lux, 1.5 + 2.5*lux, -(0.8 + 1.2*lux), 0.6];
  else if(on[4] && ia > 0.2) ghost = [0.1*ia, 1.0, -0.4, 0.4];

  // ---- occluders (field wedges in eye coords, +x temporal)
  const occ = [];
  if(on[3] && pk > 0 && pkOrigin !== 'diffuse'){
    occ.push({kind:'pigment', dir: pkOrigin === 'medial' ? [1, 0] : [-1, 0], edge: lerp(70, -15, pk), soft:18, tint:[0.85, 0.75, 0.65], dens: 0.95*clamp(0.35 + 0.65*pk, 0, 1)});
  }
  if(on[3] && pannus > 0) occ.push({kind:'vascular', dir:[-1, 0], edge: lerp(70, -5, pannus), soft:18, tint:[0.92, 0.7, 0.66], dens: 0.85*clamp(0.3 + 0.7*pannus, 0, 1)});
  if(on[4] && hyp > 0) occ.push({kind:'red', dir:[0, 1], edge: lerp(35, -25, hyp), soft:10, tint:[0.75, 0.22, 0.18], dens: 0.9*clamp(0.3 + 0.7*hyp, 0, 1)});
  if(on[4] && uve > 0.5) occ.push({kind:'white', dir:[0, 1], edge: lerp(40, 8, (uve - 0.5)/0.5), soft:10, tint:[1, 0.97, 0.9], dens:0.6});

  // ---- apertures (lids)
  const bright = 0.4 + 0.6*(1 - m);
  const sq = Math.max(0.4*kcs, 0.5*ulcer, 0.35*uve, 0.3*entro, 0.3*glS, 0.25*ia*(1 - m))*bright;
  let lidTop = 0, lidBot = 0, third = 0, thirdTint = [0.95, 0.7, 0.7];
  if(on[2]){
    lidTop = sq*0.55 + 0.3*horner; lidBot = sq*0.45;
    third = Math.max(0.35*horner, cherry > 0 ? 0.18 + 0.25*cherry : 0);
    if(cherry > 0 && 0.18 + 0.25*cherry >= 0.35*horner) thirdTint = [0.95, 0.42, 0.42];
    if(micro > 0) third = Math.max(third, 0.25*micro);
  }

  // ---- field masks
  let tunnel = 180, tsoft = 10;
  if(on[9]){
    if(pra > 0){ const th = Math.max(6, 120*(1 - smooth(0.25, 0.9, pra))); if(th < tunnel){ tunnel = th; tsoft = lerp(15, 5, pra); } }
    if(glD > 0){ const th = 65*(1 - 0.9*glD); if(th < tunnel){ tunnel = th; tsoft = 10; } }
    if(micro > 0){ const th = lerp(120, 30, micro); if(th < tunnel){ tunnel = th; tsoft = 12; } }
  }
  const scot = [];
  if(on[9]){
    if(cea > 0){ scot.push([14, -2, 2 + 5*cea, 0.5 + 0.5*cea]); if(cea > 0.4) scot.push([20, -8, 1.5 + 3*cea, 0.7]); }
    if(on_ > 0) scot.push([0, 0, 1.5 + 10*on_, 0.35 + 0.6*on_]);
    if(micro > 0.25) scot.push([0, -16, 3 + 8*micro, 0.8]);
    if(dys > 0.3) scot.push([-8, 6, 2 + 4*dys, 0.7]);
  }
  const arc = on[9] && glD > 0.2 ? (glD - 0.2)/0.8 : 0;
  const streak = on[9] ? dys*0.9 : 0;
  const rdDir = ex('retinal_detachment', 'dir_deg', 90)*Math.PI/180;
  const curtain = on[9] && rd > 0 ? [Math.cos(rdDir), Math.sin(rdDir), lerp(90, -90, rd), 6] : [0, 0, 0, 0];
  const resid = (sards > 0.9 || glD > 0.97 || pra > 0.98) ? 0.03 : 0.06;

  // ---- distortion
  const kcsOn = on[3] && kcs > 0;
  const ulcerU = on[3] && ulcer > 0 ? [8, -4, 4 + 5*ulcer, ulcer] : [0, 0, 1, 0];

  // ---- gain: human brightness at this light level, dog advantage from rods + tapetum, minus retinal ageing and disease
  const humanB = 0.06 + 0.94*smooth(-3.5, 1.2, S.logL);
  const ng = V.nightGain*(on[9] ? (1 - sN) : 1);
  const night = on[10] ? lerp(1, Math.max(ng*(0.6 + 0.4*T)*Rs, 0), m) : 1;
  const ret = on[10] ? lerp(Rp, 1, m) : 1;
  const ev = on[4] ? (0.7*ia + 0.5*uve + 0.4*(1 - pig))*(1 - m) : 0;
  let gain = Math.min(1, humanB*night)*ret*lum*2**ev;
  if(closed && on[6]) gain *= 0.12;
  const tint = [1, 1, 1];
  if(on[5]){ const bg = (1 - 0.15*NS)*(1 - 0.1*nsC); tint[2] *= bg; }
  if(closed && on[6]){ tint[0] *= 1; tint[1] *= 0.35; tint[2] *= 0.3; }
  const noise = on[10] ? V.noise*Math.pow(m, 1.2)*0.12 + (on[9] ? 0.1*sN*m : 0) : 0;
  const lower = on[10] ? V.lower*T*m : 0;

  // ---- colour
  const k = V.chroma;
  const dm = on[7] ? dogMatrix(k) : [[1,0,0],[0,1,0],[0,0,1]];
  const rowL = on[7] ? L_DOG : [0.2126, 0.7152, 0.0722];
  const mU = on[7] ? m : 0;

  // particles
  let part = [0, 0];
  if(on[11]){ if(ast > 0) part = [0.15 + 0.5*ast, 0]; else if(uve > 0.2) part = [0.08 + 0.3*uve, 1]; }
  const sparkle = on[5] && hyper && cat > 0 ? 1 : (on[3] && lipid > 0 ? 0.35*lipid : 0);

  const blurG = Math.sqrt(corneaB2 + lensB2 + opticsB2 + retinaB2);
  const csf = on[8] ? V.csf*(1 + 1.5*m) : 0;

  const anim = (kcsOn) || (on[5] && lux > 0) || part[0] > 0 || noise > 0.004 || sparkle > 0 || !!S.flicker;

  const U = {
    uAcu: acuDeg, uPeri: on[8] ? V.periph : 0, uTopo: [topoH, topoV], uBlurG: blurG, uDev: devMult,
    uUlcer: ulcerU, uMucus: 0, uWarp: [0, 3, 0],
    uHaze: [...hCol, hAmt], uCat: [catH, catC, catTypeId, catInner], uCatTint: catType === 'nuclear' ? [1.0, 0.96, 0.88] : [1, 0.99, 0.96], uSparkle: sparkle,
    uContrast: contrast, uLocalDeg: 3,
    uVeil: veil, uBloom: bloom, uBloomDeg: bloomDeg, uHalo: [halo, frac(0.06), frac(0.01), 1], uGhost: ghost,
    uTint: tint, uDog: dm, uRowL: rowL, uRod: ROD, uM: mU, uDesat: desat, uCsf: csf,
    uTunnel: [tunnel, tsoft], uScot: scot, uArc: arc, uStreak: streak, uCurtain: curtain, uResid: resid,
    uLid: [lidTop, lidBot, 0, 0], uThird: third, uThirdTint: thirdTint, uNose: [noseW, on[1] && S.nose ? 1 : 0],
    uGain: gain, uLower: lower, uNoise: noise, uPart: [part[0], part[1], 0],
    uZone: [B/2, F/2], occ,
  };
  const kcsState = kcsOn ? {s:kcs, tbu: 20*(1 - kcs) + 1*kcs, interval: 6, sigmaMax: fracB(0.03)} : null;

  const derived = {
    a: +a.toFixed(3), streak_strength: +s.toFixed(2), skull: skullOf(P.ci), field_total_deg: Math.round(F), binocular_overlap_deg: Math.round(B),
    nose_mask_width_deg: +noseW.toFixed(1), refraction_D: +refr.toFixed(2), accommodation_max_D: +Amax.toFixed(2),
    nuclear_sclerosis: +NS.toFixed(2), age_lens_opacity: +catAge.toFixed(2), retina_gain_photopic: +Rp.toFixed(2), retina_gain_scotopic: +Rs.toFixed(2),
    pigment: pig, tapetum: T, glare_multiplier: +glareMult.toFixed(2), pupil_mm: +pupil.toFixed(1), temporal_cutoff_Hz: Math.round(fc),
    development: closed ? 'eyes closed' : +dev.toFixed(2), mesopic_rod_weight: +m.toFixed(2), acuity_cpd_centre: +(0.389/Math.max(Math.sqrt(q(acuDeg) + q(blurG))*devMult, 1e-4)).toFixed(1),
    defocus_D: +err.toFixed(2),
  };

  // Shader parameters in the shape of Part III §8 (3). Fractions are of a 120° reference image.
  const shader = {
    reference_fov_deg: {blur: REF_BLUR, geometry: REF_FOV},
    baseline: {dichromat: !!on[7], chroma_k: k, acuity_sigma_frac: +(acuDeg/REF_BLUR).toFixed(5), night_gain: +V.nightGain.toFixed(2)},
    field_mask: {tunnel_r_in: +Math.min(1, tunnel/REF_FOV).toFixed(3), edge_soft: +(tsoft/REF_FOV).toFixed(3),
      scotomas: scot.map(([x, y, r, d]) => ({x:+(x/REF_FOV).toFixed(3), y:+(y/REF_FOV).toFixed(3), radius:+(r/REF_FOV).toFixed(3), depth:+d.toFixed(2), shape:'disc'})),
      arcuate: +arc.toFixed(2), streaks: +streak.toFixed(2),
      curtain: rd > 0 ? {dir_deg: ex('retinal_detachment', 'dir_deg', 90), fraction: +rd.toFixed(2)} : null},
    night: {gain_mult: +(ng/V.nightGain || 0).toFixed(2), noise_sigma: +noise.toFixed(3), desat: +(0.5*sN*m).toFixed(2)},
    global: {lum_mult: +lum.toFixed(3), contrast_mult: +contrast.toFixed(3), saturation_mult: +(1 - desat).toFixed(2), tint_rgb: tint.map(v => +v.toFixed(3))},
    haze: {amount: +hAmt.toFixed(3), color: hCol.map(v => +v.toFixed(3)), cataract: catH > 0 ? {amount: +catH.toFixed(3), contrast_loss: +catC.toFixed(2), spatial_mask: catTypeId === 1 ? 'spokes' : catTypeId === 2 ? 'central' : 'uniform'} : null},
    blur: {sigma_frac: +(blurG/REF_BLUR).toFixed(4), spatial_mask: 'topography', topography: {sigma_h_deg: +topoH.toFixed(1), sigma_v_deg: +topoV.toFixed(1), peripheral_gain: on[8] ? V.periph : 0}, defocus_D: +err.toFixed(2)},
    bloom: {intensity: +bloom.toFixed(2), radius_frac: +(bloomDeg/REF_FOV).toFixed(3), threshold: 0.8, veiling: +veil.toFixed(3)},
    halos: {intensity: +halo.toFixed(2), radius_frac: 0.06, width_frac: 0.01, chromatic: true},
    occluders: occ.map(o => ({kind:o.kind, field_wedge:{dir_deg: Math.round(Math.atan2(o.dir[1], o.dir[0])*180/Math.PI), edge_deg: +o.edge.toFixed(1), soft_deg:o.soft}, transmission: +(1 - o.dens).toFixed(2), tint_rgb:o.tint})),
    distortion: {amp_frac: kcsOn ? +(0.015*kcs).toFixed(4) : 0, freq: 3, time_varying: kcsOn},
    ghost: {alpha: +ghost[0].toFixed(2), offset_frac: [+(ghost[1]/REF_FOV).toFixed(3), +(ghost[2]/REF_FOV).toFixed(3)], blur_frac: +(ghost[3]/REF_BLUR).toFixed(4), wobble_hz: lux > 0 ? 3 : 0},
    tear_film: kcsState ? {enabled:true, breakup_time_s: +kcsState.tbu.toFixed(1), blink_interval_s: 6, sigma_max_frac: +(0.03*kcs).toFixed(3), mucus_alpha: +(0.35*kcs).toFixed(2)} : {enabled:false},
    aperture: {top: +lidTop.toFixed(2), bottom: +lidBot.toFixed(2), nasal_inferior: +third.toFixed(2), bright_squint: +sq.toFixed(2)},
    particles: {count: Math.round(part[0]*200), kind: part[0] > 0 ? (part[1] > 0.5 ? 'floater' : 'asteroid') : null, settle_s: 2.0},
    photophobia: {exposure_ev_bright: +ev.toFixed(2)},
  };
  return {derived, shader, U, anim, kcsState, lux: on[5] ? lux : 0, m, cpdEff, rodTau: V.rodTau, fc};
}

function profileJSON(state, comp){
  const P = state.profile;
  return {
    profile: {skull: skullOf(P.ci), cephalic_index: P.ci, breed: P.breed, coat: P.coat, iris: {[P.eye]: P.iris}, eye: P.eye,
      age_years: +P.age_years.toFixed(2), lifespan_years: P.lifespan_years, refraction_D: P.refraction_D, tapetum: P.tapetum,
      conditions: condHypotheses(state).conditions},
    derived: comp.derived,
  };
}
function condHypotheses(state){
  const out = {};
  for(const c of CONDS){
    const st = state.conditions[c.id]; if(!st || !st.on) continue;
    const o = {s: +st.s.toFixed(2)};
    if(c.id === 'cataract'){ o.stage = catStage(st.s, st.x.hypermature); o.type = st.x.type || 'cortical'; }
    if(c.id === 'glaucoma'){ o.damage = +(st.x.damage ?? 0.4).toFixed(2); o.acute = st.s > 0.5; }
    if(c.id === 'pigmentary_keratitis'){ o.origin = st.x.origin || 'medial'; o.maini_score_est = +(st.s*14).toFixed(1); }
    if(c.id === 'kcs') o.chronic = !!st.x.chronic;
    if(c.id === 'retinal_detachment') o.dir_deg = st.x.dir_deg ?? 90;
    o.source = st.source || 'manual';
    out[c.id] = o;
  }
  return {conditions: out, disclaimer: 'Not a veterinary diagnosis. Retinal disease, glaucoma (IOP) and tear production cannot be measured from a photo.'};
}

// Detector output (schema 0.1) -> condition hypotheses. s = p * severity unless stated.
function mapDetector(det){
  const f = det.findings || {}, md = det.metadata_optional || {};
  const conds = {}; const notes = [];
  const ps = (o, d = 0.5) => o ? clamp((o.p ?? 0)*(o.severity ?? d), 0, 1) : 0;
  const put = (id, s, extra = {}) => { if(s > 0.02) conds[id] = Object.assign({s: +s.toFixed(2), source:'photo'}, extra); };
  if(f.lens_opacity){ const pat = f.lens_opacity.pattern; put('cataract', ps(f.lens_opacity), {type: ['cortical','nuclear','diffuse','posterior_subcapsular'].includes(pat) ? pat : 'cortical'}); }
  put('nuclear_sclerosis', ps(f.nuclear_haze_reflex_passes, 0.3));
  if(f.aphakic_crescent && f.aphakic_crescent.p > 0.5) put('lens_luxation', 0.6*f.aphakic_crescent.p);
  if(f.corneal_pigment){ const cp = f.corneal_pigment; const score = (cp.clock_hours || 0) + (cp.reaches_pupil ? 1 : 0) + (cp.crosses_pupil ? 2 : 0); put('pigmentary_keratitis', (cp.p ?? 1)*clamp(score/14, 0, 1), {origin: cp.origin || 'medial', maini_score_est: +score.toFixed(1)}); }
  put('corneal_edema', ps(f.corneal_edema));
  put('pannus', ps(f.corneal_vascularization));
  put('lipid_dystrophy', ps(f.corneal_white_crystalline));
  if(f.corneal_ulcer_visible){ const dmap = {superficial:0.3, deep:0.6, descemetocele:0.85}; put('corneal_ulcer', (f.corneal_ulcer_visible.p ?? 0)*(dmap[f.corneal_ulcer_visible.depth] || 0)); }
  let kcs = Math.max(ps(f.tear_film_irregular), 0.8*ps(f.mucoid_discharge));
  if(typeof md.STT_mm_per_min === 'number'){ kcs = clamp((15 - md.STT_mm_per_min)/15, 0, 1); }
  if(kcs > 0.02) conds.kcs = {s: +kcs.toFixed(2), chronic: (f.corneal_pigment?.p || 0) > 0.5 || (f.corneal_vascularization?.p || 0) > 0.5, source: typeof md.STT_mm_per_min === 'number' ? 'metadata:STT=' + md.STT_mm_per_min : 'photo'};
  if(f.hypopyon_or_hyphema){ const h = f.hypopyon_or_hyphema; if(h.type === 'hyphema') put('hyphema', (h.p ?? 0)*clamp(h.fill_fraction*2 || 0.5, 0, 1)); if(h.type === 'hypopyon') put('uveitis', (h.p ?? 0)*0.7); }
  if(f.conjunctival_hyperemia && f.conjunctival_hyperemia.pattern === 'ciliary_flush' && f.pupil && f.pupil.diameter_rel < 0.4) put('uveitis', Math.max(conds.uveitis?.s || 0, ps(f.conjunctival_hyperemia)));
  if(f.iris_atrophy) put('iris_atrophy', (f.iris_atrophy.p ?? 0)*0.7);
  put('cherry_eye', (f.third_eyelid_gland_prolapse?.p || 0)*0.7);
  const hornerP = Math.min(f.ptosis?.p || 0, f.third_eyelid_protrusion?.p || 0); put('horner', hornerP*0.7);
  if(f.entropion) put('entropion', (f.entropion.p ?? 0)*0.6);
  put('microphthalmia', (f.microphthalmia_coloboma?.p || 0)*0.6);
  let glS = 0, glD = 0;
  if(typeof md.IOP_mmHg === 'number'){ glS = clamp((md.IOP_mmHg - 20)/40, 0, 1); }
  else if((f.conjunctival_hyperemia?.pattern === 'episcleral') && (f.pupil?.diameter_rel || 0) > 0.8 && (f.corneal_edema?.p || 0) > 0.5){ glS = 0.5; notes.push('Possible glaucoma signs: pressure needs tonometry.'); }
  if((f.globe_enlarged?.p || 0) > 0.5){ glD = Math.max(glD, 0.7); glS = Math.max(glS, 0.3); }
  if(glS > 0 || glD > 0) conds.glaucoma = {s: +glS.toFixed(2), damage: +glD.toFixed(2), acute: glS > 0.5, source: typeof md.IOP_mmHg === 'number' ? 'metadata:IOP' : 'photo'};
  // vet-entered diagnoses for what a photo cannot see
  const dx = (md.vet_diagnoses || []).map(s => String(s).toLowerCase());
  const dxMap = {pra:'pra', 'prcd-pra':'pra', sards:'sards', cea:'cea', 'collie eye anomaly':'cea', kcs:'kcs', 'dry eye':'kcs', glaucoma:'glaucoma', 'optic neuritis':'optic_neuritis', 'retinal dysplasia':'retinal_dysplasia', 'retinal detachment':'retinal_detachment'};
  dx.forEach(d => { const id = dxMap[d]; if(id && !conds[id]) conds[id] = {s: 0.5, source:'metadata:vet'}; });
  if(md.PRA_genotype && /affected/i.test(md.PRA_genotype) && !conds.pra) conds.pra = {s:0.3, source:'metadata:genotype'};
  if(md.sudden_blindness && !conds.sards) notes.push('Sudden blindness reported: see a vet urgently.');
  const urgent = [...(det.urgent_flags || [])];
  if((f.conjunctival_hyperemia?.p || 0) > 0.5 && (f.corneal_edema?.p || 0) > 0.5 && (f.pupil?.diameter_rel || 0) > 0.8) urgent.push('red_eye+cloudy_cornea+dilated_pupil');
  if((f.corneal_ulcer_visible?.depth === 'descemetocele') && (f.corneal_ulcer_visible?.p || 0) > 0.5) urgent.push('possible_descemetocele');
  if(md.sudden_blindness) urgent.push('sudden_blindness');
  return {conditions: conds, urgent, notes, metadata: md};
}

const EXAMPLE_DETECTOR = {
  schema_version: '0.1', eye: 'OD',
  image_quality: {usable:true, focus:0.82, glare_fraction:0.04, pupil_visible:true, flash_retroillumination:true, both_eyes_in_frame:false},
  findings: {
    lens_opacity: {p:0.9, severity:0.6, pattern:'cortical', tapetal_reflex_blocked_fraction:0.55},
    nuclear_haze_reflex_passes: {p:0.2, severity:0.3},
    aphakic_crescent: {p:0.0, direction_deg:null},
    corneal_pigment: {p:0.8, clock_hours:4.5, reaches_pupil:false, crosses_pupil:false, origin:'medial'},
    corneal_edema: {p:0.1, severity:0.0, region:'diffuse'},
    corneal_vascularization: {p:0.3, severity:0.2, origin:'temporal'},
    corneal_white_crystalline: {p:0.0, severity:0.0},
    corneal_ulcer_visible: {p:0.05, depth:'none'},
    tear_film_irregular: {p:0.4, severity:0.4},
    mucoid_discharge: {p:0.6, severity:0.5},
    conjunctival_hyperemia: {p:0.5, severity:0.4, pattern:'superficial'},
    pupil: {diameter_rel:0.7, anisocoria:false, shape_irregular:false},
    globe_enlarged: {p:0.0}, hypopyon_or_hyphema: {p:0.0, type:'none', fill_fraction:0.0},
    iris_cyst: {p:0.0, count:0}, iris_atrophy: {p:0.1}, ppm_strands: {p:0.0},
    third_eyelid_gland_prolapse: {p:0.0}, third_eyelid_protrusion: {p:0.0}, ptosis: {p:0.0},
    entropion: {p:0.3, location:'medial_lower'}, ectropion: {p:0.0}, tear_staining: {p:0.7, severity:0.6},
    eyelid_mass: {p:0.0}, microphthalmia_coloboma: {p:0.0}, tapetal_reflex_hyperreflective: {p:0.1},
  },
  metadata_optional: {age_years:9, breed:'pug', diabetic:false, night_blindness_reported:false, sudden_blindness:false, vet_diagnoses:['KCS'], STT_mm_per_min:8, IOP_mmHg:null, PRA_genotype:null},
  urgent_flags: [],
};
