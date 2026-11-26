// Where the standalone (camera-capable) build is served.
const HOSTED_URL = 'https://doggo-vision.unstoppablesys.workers.dev/';
// ---------- State ----------
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
function freshConditions(){ const o = {}; CONDS.forEach(c => { o[c.id] = {on:false, s:c.s, x:{}}; (c.extras || []).forEach(e => { o[c.id].x[e.k] = e.t === 'bool' ? false : e.t === 'sel' ? e.opts[0][0] : e.def; }); }); return o; }
function breedProfile(id, age){ const b = BREEDS[id]; return {breed:id, age_years:age, lifespan_years:b.L, ci:b.ci, coat:'normal', iris:'brown', eye:'OD', tapetum:b.tap, refraction_D:b.dD}; }
const state = {
  profile: breedProfile('labrador', 4),
  conditions: freshConditions(),
  vision: {...VISION_DEFAULTS},
  scene: {logL:2.8, hfov:50, dist:6, nose:false, live:true, flicker:false},
  stages: STAGES.map(() => true),
  view: {mode:0, split:0.5, zoom:1, cx:0.5, cy:0.5, overlay:0, hud:false},
  preset: 'lab',
  // Both-eyes mode: each eye keeps its own conditions; state.conditions is the eye being edited (profile.eye)
  binoc: {on:false, dom:0.75, eyes:{OS:null, OD:null}},
};
const otherEye = e => e === 'OD' ? 'OS' : 'OD';
const condLoad = C => Object.values(C).reduce((n, c) => n + (c.on ? c.s : 0), 0);
function setBinoc(on){
  const B = state.binoc;
  if(on && !B.on){ const cur = state.profile.eye; B.eyes[cur] = state.conditions; B.eyes[otherEye(cur)] = JSON.parse(JSON.stringify(state.conditions)); }
  B.on = on; state.preset = null; syncAll(); invalidate();
}
function editEye(e){
  const B = state.binoc; if(!B.on) return;
  state.profile.eye = e; state.conditions = B.eyes[e]; syncAll(); invalidate();
}

const PRESETS = [
  {id:'kcs15both', name:'Senior, 15: both eyes', note:'Both eyes blended: clearer right eye leads where the fields overlap', p:['mixed', 15], prof:{lifespan_years:14, eye:'OS'}, eyes:{OS:'kcs15', OD:'kcs15b'}},
  {id:'kcs15', name:'Senior, 15: cloudy left eye', note:'Dry eye, corneal scarring and pigment, lens fog', p:['mixed', 15], prof:{lifespan_years:14, eye:'OS'}, c:{kcs:{s:0.6, x:{chronic:false, blink:6, tbu:4, mucus:0, squint:0}}, corneal_scar:{s:0.55}, pigmentary_keratitis:{s:0.35, x:{origin:'diffuse'}}, nuclear_sclerosis:{s:0.5}}},
  {id:'kcs15b', name:'Senior, 15: clearer right eye', note:'Milder dry eye, a few small scars, lens fog', p:['mixed', 15], prof:{lifespan_years:14, eye:'OD'}, c:{kcs:{s:0.4, x:{chronic:false, blink:6, tbu:6, mucus:0, squint:0}}, corneal_scar:{s:0.1}, nuclear_sclerosis:{s:0.45}}},
  {id:'puppy3', name:'Puppy, 3 weeks', note:'Eyes just open, retina maturing', p:['labrador', 3/52]},
  {id:'puppy10', name:'Puppy, 10 weeks', note:'Near-adult optics', p:['labrador', 10/52]},
  {id:'lab', name:'Adult Labrador', note:'Baseline: dichromat, 20/75', p:['labrador', 4]},
  {id:'greyhound', name:'Greyhound', note:'Strong visual streak, 270° field', p:['greyhound', 4]},
  {id:'pug', name:'Pug', note:'Area centralis, glare, mild pigment', p:['pug', 4], c:{pigmentary_keratitis:{s:0.3, x:{origin:'medial'}}}},
  {id:'gsd', name:'Myopic German shepherd', note:'About −1.5 D at distance', p:['gsd', 5], prof:{refraction_D:-1.5}},
  {id:'senior', name:'Senior, 11 years', note:'Lens scatter, slower night vision', p:['mixed', 11], prof:{lifespan_years:12.5}},
  {id:'cataract', name:'Cataract, immature', note:'Toy poodle, cortical spokes', p:['poodle_toy', 9], c:{cataract:{s:0.55, x:{type:'cortical'}}}},
  {id:'diabetic', name:'Diabetic cataract', note:'Mature, fast onset', p:['labrador', 8], c:{cataract:{s:0.93, x:{type:'diffuse'}}}},
  {id:'merle', name:'Double merle', note:'Small eye, colobomas, no tapetum', p:['aussie', 3], prof:{coat:'merle_MM', iris:'blue', tapetum:0}, c:{microphthalmia:{s:0.45}}},
  {id:'pra', name:'PRA, mid stage', note:'Night loss, closing tunnel', p:['cocker', 7], c:{pra:{s:0.55}}},
  {id:'glaucoma', name:'Glaucoma', note:'Halos now, field loss after', p:['cocker', 8], c:{glaucoma:{s:0.45, x:{damage:0.55}}}},
  {id:'kcs', name:'Dry eye, Shih Tzu', note:'Tear film breaks up between blinks', p:['shihtzu', 8], c:{kcs:{s:0.6, x:{chronic:true}}}},
  {id:'brachy', name:'Brachycephalic senior', note:'French bulldog, 9 years', p:['frenchie', 9], c:{pigmentary_keratitis:{s:0.45, x:{origin:'medial'}}, entropion:{s:0.4}}},
];

function presetConds(c){
  const C = freshConditions();
  Object.entries(c || {}).forEach(([id, v]) => { const k = C[id]; k.on = true; k.s = v.s; Object.assign(k.x, v.x || {}); k.source = 'preset'; });
  return C;
}
function applyPreset(pr){
  state.profile = Object.assign(breedProfile(pr.p[0], pr.p[1]), pr.prof || {});
  const B = state.binoc;
  if(pr.eyes){
    B.on = true; B.eyes = {OS: presetConds(PRESETS.find(p => p.id === pr.eyes.OS).c), OD: presetConds(PRESETS.find(p => p.id === pr.eyes.OD).c)};
    state.conditions = B.eyes[state.profile.eye];
  } else { B.on = false; state.conditions = presetConds(pr.c); }
  state.preset = pr.id;
  syncAll(); invalidate();
}

// ---------- WebGL engine ----------
const canvas = $('#gl');
const gl = canvas.getContext('webgl2', {antialias:false, premultipliedAlpha:false, preserveDrawingBuffer:false, alpha:false});
let engineOK = !!gl;
let floatRT = false, AS = 1;
const progs = {};
function compileProg(fs, label){
  const mkS = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(label + ': ' + gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mkS(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'aPos'); gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(label + ': ' + gl.getProgramInfoLog(p));
  const locs = {};
  p.loc = n => (n in locs) ? locs[n] : (locs[n] = gl.getUniformLocation(p, n));
  return p;
}
function setU(p, name, v){
  const l = p.loc(name); if(l === null) return;
  if(typeof v === 'number') gl.uniform1f(l, v);
  else if(v.length === 2) gl.uniform2fv(l, v);
  else if(v.length === 3) gl.uniform3fv(l, v);
  else if(v.length === 4) gl.uniform4fv(l, v);
}
function setI(p, name, v){ const l = p.loc(name); if(l !== null) gl.uniform1i(l, v); }

let quad, fbo, srcTex, pyr, levels = 1, dogTex, dogTex2, blendTex, hist = [], histIdx = 0, W = 0, H = 0;
function initGL(){
  floatRT = !!gl.getExtension('EXT_color_buffer_float');
  AS = floatRT ? 1 : 4;
  progs.lin = compileProg(FS_LINEARIZE, 'linearize');
  progs.down = compileProg(FS_DOWN, 'downsample');
  progs.main = compileProg(FS_MAIN, 'main');
  progs.temp = compileProg(FS_TEMPORAL, 'temporal');
  progs.blend = compileProg(FS_BLEND, 'blend');
  progs.disp = compileProg(FS_DISPLAY, 'display');
  quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  fbo = gl.createFramebuffer();
}
function tex2D(w, h, internal, format, type, filter){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h); return t;
}
function allocate(w, h){
  [srcTex, pyr, dogTex, dogTex2, blendTex, ...hist].forEach(t => t && gl.deleteTexture(t));
  W = w; H = h;
  srcTex = tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
  pyr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, pyr);
  gl.texStorage2D(gl.TEXTURE_2D, levels, floatRT ? gl.RGBA16F : gl.RGBA8, w, h);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  dogTex = tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  dogTex2 = tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  blendTex = tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR);
  hist = [tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR), tex2D(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, gl.LINEAR)];
}
function bindTarget(tex, level, w, h){
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, level);
  gl.viewport(0, 0, w, h);
}
function draw(){ gl.drawArrays(gl.TRIANGLES, 0, 3); }
function uploadSource(el){
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, el);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
}
function buildPyramid(){
  const p = progs.lin; gl.useProgram(p);
  bindTarget(pyr, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, srcTex); setI(p, 'uSrc', 0);
  setU(p, 'uHdr', state.vision.hdr); setU(p, 'uAS', AS); draw();
  const d = progs.down; gl.useProgram(d); setI(d, 'uTex', 0);
  gl.bindTexture(gl.TEXTURE_2D, pyr);
  for(let k = 1; k < levels; k++){
    const sw = Math.max(1, W >> (k - 1)), sh = Math.max(1, H >> (k - 1));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, k - 1); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, k - 1);
    bindTarget(pyr, k, Math.max(1, W >> k), Math.max(1, H >> k));
    setU(d, 'uTexel', [1/sw, 1/sh]); draw();
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL, 0); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, levels - 1);
}

// ---------- Sources ----------
const source = {kind:'image', name:'', el:null, video:null, work:null, needsPyr:true, resetHist:true};
const MAX_SIDE = 1600;
function setImageSource(cnv, meta){
  stopVideo();
  source.kind = 'image'; source.el = cnv; source.name = meta.name;
  if(engineOK){ allocate(cnv.width, cnv.height); uploadSource(cnv); }
  source.needsPyr = true; source.resetHist = true;
  Object.assign(state.scene, {hfov: meta.hfov, dist: meta.dist, logL: meta.logL ?? state.scene.logL});
  state.view.zoom = 1; state.view.cx = 0.5; state.view.cy = 0.5;
  syncAll(); invalidate();
}
function stopVideo(){
  if(source.video){ source.video.pause(); if(source.video.src && source.video.src.startsWith('blob:')) URL.revokeObjectURL(source.video.src); source.video.remove(); source.video.srcObject = null; source.video = null; }
  if(source.stream){ source.stream.getTracks().forEach(t => t.stop()); source.stream = null; }
  source.mirror = false; source.live = false; updateMediaUI();
}
const COARSE = matchMedia('(pointer: coarse)').matches;
const VIDEO_SIDE = COARSE ? 960 : 1280; // phones: keep the full pipeline near 30 fps
// Upload each decoded frame once (requestVideoFrameCallback), falling back to every animation frame
function watchFrames(v){
  source.newFrame = true;
  if(!v.requestVideoFrameCallback) return;
  const tick = () => { if(source.video !== v) return; source.newFrame = true; v.requestVideoFrameCallback(tick); };
  v.requestVideoFrameCallback(tick);
}
function useVideo(v, name, mirror){
  const sc = Math.min(1, VIDEO_SIDE/Math.max(v.videoWidth, v.videoHeight));
  const work = document.createElement('canvas'); work.width = Math.round(v.videoWidth*sc); work.height = Math.round(v.videoHeight*sc);
  source.kind = 'video'; source.video = v; source.work = work; source.name = name; source.mirror = mirror;
  if(engineOK) allocate(work.width, work.height);
  source.needsPyr = true; source.resetHist = true;
  Object.assign(state.scene, {hfov:68, dist:3});
  state.view.zoom = 1; state.view.cx = 0.5; state.view.cy = 0.5;
  watchFrames(v); syncAll(); invalidate(); updateMediaUI();
}
let facing = 'environment';
async function startCamera(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){ cameraBlocked(); return; }
  let stream;
  try{
    stream = await navigator.mediaDevices.getUserMedia({audio:false, video:{facingMode:{ideal:facing}, width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30}}});
  }catch(e){
    if(inArtifact() || !window.isSecureContext) cameraBlocked();
    else if(e && e.name === 'NotAllowedError') toast("Camera permission was refused. Allow it in your browser's site settings to use live mode.");
    else if(e && e.name === 'NotFoundError') toast('No camera was found on this device.');
    else toast('The camera could not start: ' + (e && e.message ? e.message : 'unknown error'));
    return;
  }
  stopVideo();
  $$('#samples button').forEach(b => b.setAttribute('aria-pressed', 'false'));
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.autoplay = true; v.setAttribute('playsinline', '');
  v.srcObject = stream; source.stream = stream;
  await new Promise(r => { if(v.readyState >= 2) r(); else v.onloadeddata = r; });
  try{ await v.play(); }catch(e){}
  const tr = stream.getVideoTracks()[0];
  const set = (tr && tr.getSettings) ? tr.getSettings() : {};
  const front = set.facingMode ? set.facingMode === 'user' : facing === 'user';
  useVideo(v, front ? 'Front camera' : 'Camera', front);
  source.live = true; updateMediaUI();
}
function inArtifact(){ try{ return window.top !== window.self; }catch(e){ return true; } }
function cameraBlocked(){
  const url = (typeof HOSTED_URL === 'string' && HOSTED_URL) ? HOSTED_URL : '';
  const n = $('#camnote'); n.hidden = false; n.innerHTML = '';
  const p = document.createElement('span');
  p.textContent = 'This preview cannot use the camera. ' + (url ? 'Open the standalone version for live mode:' : 'Live mode works in the standalone version served over https.');
  n.appendChild(p);
  if(url){ const l = document.createElement('a'); l.href = url; l.target = '_blank'; l.rel = 'noopener'; l.textContent = url.replace(/^https:\/\//, ''); n.appendChild(l); }
  const x = document.createElement('button'); x.type = 'button'; x.textContent = 'Close'; x.className = 'btn'; x.onclick = () => { n.hidden = true; }; n.appendChild(x);
}
function updateMediaUI(){
  const isVid = source.kind === 'video' && !!source.video;
  $('#camflip').hidden = !source.live;
  $('#camstop').hidden = !isVid;
  $('#vidplay').hidden = !isVid || !!source.live;
  if(isVid && !source.live) $('#vidplay').textContent = source.video.paused ? 'Play' : 'Pause';
  $('#camlive').setAttribute('aria-pressed', String(!!source.live));
}
function loadSample(id){
  stopVideo();
  $$('#samples button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sample === id)));
  setImageSource(SAMPLES[id]().canvas, SAMPLES[id]());
}
// iOS WebKit is picky about local video: it may not load a detached element until play() is called,
// it can reject a blob whose type is video/quicktime, and some embedded views refuse blob: media.
// Try each route in turn and only give up when all of them fail.
let vidHost = null;
function tryVideoSrc(src, revoke){
  return new Promise((res, rej) => {
    if(!vidHost){ vidHost = document.createElement('div'); vidHost.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none;overflow:hidden'; document.body.appendChild(vidHost); }
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.autoplay = true;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.preload = 'auto';
    v.style.cssText = 'width:2px;height:2px';
    let done = false;
    const fail = why => { if(done) return; done = true; clearTimeout(t); v.removeAttribute('src'); v.load(); v.remove(); if(revoke) URL.revokeObjectURL(src); rej(new Error(why)); };
    const ok = () => { if(done || !v.videoWidth) return; done = true; clearTimeout(t); res(v); };
    v.addEventListener('loadeddata', ok); v.addEventListener('canplay', ok); v.addEventListener('playing', ok);
    v.addEventListener('error', () => fail('code ' + (v.error ? v.error.code : '?')));
    const t = setTimeout(() => fail('timeout'), 15000);
    vidHost.appendChild(v);
    v.src = src; v.load();
    const p = v.play(); if(p && p.catch) p.catch(() => {});
  });
}
async function openVideo(file){
  const routes = [() => [URL.createObjectURL(file), true]];
  if(file.type !== 'video/mp4') routes.push(() => [URL.createObjectURL(new Blob([file], {type:'video/mp4'})), true]);
  if(file.size < 80e6) routes.push(async () => [await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('read')); r.readAsDataURL(file.type === 'video/quicktime' ? new Blob([file], {type:'video/mp4'}) : file); }), false]);
  const errs = [];
  for(const route of routes){
    try{ const [src, revoke] = await route(); const v = await tryVideoSrc(src, revoke); try{ await v.play(); }catch(e){} return v; }
    catch(e){ errs.push(e.message); }
  }
  const hint = inArtifact() && HOSTED_URL ? ' Try the standalone version at ' + HOSTED_URL.replace(/^https:\/\//, '') + '.' : '';
  throw new Error('This video could not be played here (' + errs.join(', ') + ').' + hint);
}
async function loadFile(file){
  if(!file) return;
  $$('#samples button').forEach(b => b.setAttribute('aria-pressed', 'false'));
  const isVid = /^video\//.test(file.type) || (!file.type && /\.(mov|mp4|m4v|webm|3gp)$/i.test(file.name || ''));
  if(isVid){
    stopVideo();
    toast('Opening ' + (file.name || 'video') + '…');
    let v; try{ v = await openVideo(file); }catch(e){ loadSample('yard'); throw e; }
    useVideo(v, file.name || 'Video', false);
    toast('Playing ' + (file.name || 'video'));
    return;
  }
  let bmp;
  try{ bmp = await createImageBitmap(file, {imageOrientation:'from-image'}); }
  catch(e){ toast('That file could not be read as an image. Try a JPEG, PNG or WebP.'); return; }
  const sc = Math.min(1, MAX_SIDE/Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width*sc); c.height = Math.round(bmp.height*sc);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  setImageSource(c, {name:file.name, hfov:65, dist:3, logL:state.scene.logL});
}

// ---------- Render loop ----------
let comp2 = null;
let dirty = true, comp = null, t0 = performance.now(), lastT = 0, freezeT = 3.7;
function invalidate(){ dirty = true; comp = null; comp2 = null; scheduleUI(); }
function needsAnim(){ return state.scene.live && (source.kind === 'video' || (comp && comp.anim) || (state.binoc.on && comp2 && comp2.anim)); }
function frame(now){
  requestAnimationFrame(frame);
  if(!engineOK || !srcTex) return;
  const anim = needsAnim();
  if(!dirty && !anim && !resized) return;
  if(!comp) comp = compile(state, source);
  const B = state.binoc;
  if(B.on && !comp2){ const e2 = otherEye(state.profile.eye); comp2 = compile({...state, conditions: B.eyes[e2], profile: {...state.profile, eye: e2}}, source); }
  const t = state.scene.live ? (now - t0)/1000 : freezeT;
  const dt = lastT ? Math.min(0.1, (now - lastT)/1000) : 1/60; lastT = now;
  if(source.kind === 'video' && source.video && source.video.readyState >= 2 && (source.newFrame || !source.video.requestVideoFrameCallback)){
    const v = source.video, w = source.work, x = w.getContext('2d');
    if(source.mirror){ x.setTransform(-1, 0, 0, 1, w.width, 0); x.drawImage(v, 0, 0, w.width, w.height); x.setTransform(1, 0, 0, 1, 0, 0); }
    else x.drawImage(v, 0, 0, w.width, w.height);
    uploadSource(w); source.needsPyr = true; source.newFrame = false;
  }
  if(source.needsPyr){ buildPyramid(); source.needsPyr = false; }
  if(B.on){
    const cur = state.profile.eye;
    renderMain(t, comp, dogTex, cur); renderMain(t, comp2, dogTex2, otherEye(cur));
    const texL = cur === 'OS' ? dogTex : dogTex2, texR = cur === 'OS' ? dogTex2 : dogTex;
    const loadL = condLoad(B.eyes.OS), loadR = condLoad(B.eyes.OD);
    const wR = loadR <= loadL ? B.dom : 1 - B.dom;  // the clearer eye leads in the overlap
    const p = progs.blend; gl.useProgram(p); bindTarget(blendTex, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texL); setI(p, 'uL', 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texR); setI(p, 'uR', 1);
    setU(p, 'uHalfX', state.scene.hfov/2); setU(p, 'uBino', comp.derived.binocular_overlap_deg/2); setU(p, 'uWR', wR);
    draw(); gl.activeTexture(gl.TEXTURE0);
    renderTemporal(anim ? dt : 0, blendTex);
  } else {
    renderMain(t, comp, dogTex, state.profile.eye);
    renderTemporal(anim ? dt : 0, dogTex);
  }
  renderDisplay();
  dirty = false; resized = false;
}
function renderMain(t, comp, target, eye){
  const p = progs.main, U = comp.U, S = state.scene; gl.useProgram(p);
  bindTarget(target, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pyr); setI(p, 'uPyr', 0);
  const ppd = W/S.hfov;
  setU(p, 'uLevels', levels); setU(p, 'uAS', AS); setU(p, 'uSize', [W, H]); setU(p, 'uPPD', ppd);
  setU(p, 'uHalf', [S.hfov/2, S.hfov*H/W/2]); setU(p, 'uTime', t); setU(p, 'uTS', eye === 'OD' ? 1 : -1);
  for(const k of ['uAcu','uPeri','uTopo','uBlurG','uDev','uUlcer','uHaze','uCat','uCatTint','uSparkle','uContrast','uLocalDeg','uVeil','uBloom','uBloomDeg','uHalo','uTint','uRowL','uRod','uM','uDesat','uCsf','uTunnel','uArc','uStreak','uCurtain','uResid','uThird','uThirdTint','uNose','uLower','uNoise','uPart','uZone']) setU(p, k, U[k]);
  const m = U.uDog; gl.uniformMatrix3fv(p.loc('uDog'), false, [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
  const sc = new Float32Array(24); U.uScot.slice(0, 6).forEach((s, i) => sc.set(s, i*4)); gl.uniform4fv(p.loc('uScot[0]'), sc);
  const oa = new Float32Array(16), ob = new Float32Array(16);
  U.occ.slice(0, 4).forEach((o, i) => { oa.set([o.dir[0], o.dir[1], o.edge, o.soft], i*4); ob.set([...o.tint, o.dens], i*4); });
  gl.uniform4fv(p.loc('uOccA[0]'), oa); gl.uniform4fv(p.loc('uOccB[0]'), ob);
  // time-varying terms: tear film cycle, lens wobble, flicker illustration
  let blurG = U.uBlurG, warp = [0, 3, 0], mucus = 0, blink = 0, kdry = 0, veil = U.uVeil, sigTot = 0;
  const ks = comp.kcsState;
  if(ks){
    const tempOn = state.stages[11];
    const ph = tempOn ? t % ks.interval : 4.2;
    if(tempOn && ph < 0.22) blink = Math.sin(Math.PI*ph/0.22);
    const dry = smooth(ks.tbu, ks.tbu + 3, ph);
    kdry = ks.s*dry;
    const acu = U.uAcu;
    sigTot = Math.sqrt(acu*acu + blurG*blurG)*(1 + 0.6*kdry);
    blurG = Math.sqrt(Math.max(0, sigTot*sigTot - acu*acu));
    veil = 1 - (1 - veil)*(1 - 0.08*kdry);
    mucus = 0.7*ks.mucus*ks.s*(0.4 + 0.6*dry);
  }
  setU(p, 'uVeil', veil);
  setU(p, 'uBlurG', blurG); setU(p, 'uWarp', warp); setU(p, 'uMucus', mucus);
  const lid = U.uLid.slice(); lid[3] = state.stages[2] ? blink : 0; setU(p, 'uLid', lid);
  const g = U.uGhost.slice();
  if(kdry > 0 && g[0] === 0){ const d = 1.5*sigTot, th = 0.8 + 0.15*t; g[0] = 0.25*kdry; g[1] = d*Math.cos(th); g[2] = d*Math.sin(th); g[3] = sigTot; }
  if(comp.lux > 0 && state.stages[11]){ g[1] += Math.sin(t*2*Math.PI*3)*0.4*comp.lux; g[2] += Math.cos(t*2*Math.PI*3)*0.25*comp.lux; }
  setU(p, 'uGhost', g);
  let gain = U.uGain; if(S.flicker && state.stages[11]) gain *= (Math.sin(t*2*Math.PI*6) > 0) ? 1 : 0.82;
  setU(p, 'uGain', gain);
  setU(p, 'uOverlay', state.view.overlay);
  draw();
}
function renderTemporal(dt, cur){
  const p = progs.temp; gl.useProgram(p);
  const prev = hist[histIdx], next = hist[1 - histIdx];
  bindTarget(next, 0, W, H);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, cur); setI(p, 'uCur', 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, prev); setI(p, 'uPrev', 1);
  let a = 1, sal = 0;
  if(dt > 0 && state.stages[11] && !source.resetHist){
    const tauCone = 1/(2*Math.PI*comp.fc), tau = lerp(tauCone, comp.rodTau/1000, comp.m);
    a = 1 - Math.exp(-dt/tau);
    sal = source.kind === 'video' ? state.vision.salience : 0;
  }
  source.resetHist = false;
  setU(p, 'uA', a); setU(p, 'uSal', sal); draw();
  histIdx = 1 - histIdx;
  gl.activeTexture(gl.TEXTURE0);
}
let resized = true, rect = [0, 0, 1, 1];
function renderDisplay(){
  const p = progs.disp; gl.useProgram(p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  const cw = canvas.width, ch = canvas.height; gl.viewport(0, 0, cw, ch);
  const sc = Math.min(cw/W, ch/H); const rw = W*sc, rh = H*sc; rect = [(cw - rw)/2, (ch - rh)/2, rw, rh];
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, hist[histIdx]); setI(p, 'uDogT', 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, srcTex); setI(p, 'uSrcT', 1);
  const V = state.view;
  setU(p, 'uRect', rect); setU(p, 'uZoom', V.zoom); setU(p, 'uCenter', [V.cx, V.cy]);
  setU(p, 'uSplitX', rect[0] + V.split*rect[2]); setU(p, 'uMode', V.mode);
  setU(p, 'uBg', bgColor);
  const L = state.scene.logL;
  setU(p, 'uHG', 0.06 + 0.94*smooth(-3.5, 1.2, L)); setU(p, 'uHD', 0.85*(1 - smooth(-3, 0, L)));
  draw(); gl.activeTexture(gl.TEXTURE0);
  placeSplit();
}
let bgColor = [0.03, 0.035, 0.05];
function readBg(){ const c = getComputedStyle($('#vp')).backgroundColor.match(/\d+/g); if(c) bgColor = c.slice(0, 3).map(v => Math.pow(+v/255, 1)); }
function resize(){
  const r = $('#vp').getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width*dpr)), h = Math.max(1, Math.round(r.height*dpr));
  if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; resized = true; }
}
function placeSplit(){
  const dpr = canvas.width/Math.max(1, canvas.clientWidth);
  const el = $('#split');
  el.hidden = state.view.mode !== 0;
  el.style.left = ((rect[0] + state.view.split*rect[2])/dpr) + 'px';
  $('#tagL').hidden = state.view.mode === 1; $('#tagR').hidden = state.view.mode === 2;
  const pct = Math.round(rect[2]*state.view.zoom/W/dpr*100);
  $('#zlabel').textContent = state.view.zoom === 1 ? 'Fit' : pct + '%';
}

// ---------- Viewport interaction ----------
(function interaction(){
  const vp = $('#vp'); const ptrs = new Map(); let mode = null, start = null;
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const dpr = () => canvas.width/Math.max(1, canvas.clientWidth);
  function splitX(){ return (rect[0] + state.view.split*rect[2])/dpr(); }
  vp.addEventListener('pointerdown', e => {
    if(e.target.closest('.zoom')) return;
    vp.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, local(e));
    const [x] = local(e);
    if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; mode = 'pinch'; start = {d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: state.view.zoom}; return; }
    if(state.view.mode === 0 && (Math.abs(x - splitX()) < 22 || state.view.zoom === 1)) { mode = 'split'; setSplit(x); }
    else { mode = 'pan'; start = {p: local(e), cx: state.view.cx, cy: state.view.cy}; }
  });
  vp.addEventListener('pointermove', e => {
    if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, local(e));
    if(mode === 'split') setSplit(local(e)[0]);
    else if(mode === 'pan' && start){ const [x, y] = local(e); const d = dpr();
      state.view.cx = start.cx - (x - start.p[0])*d/rect[2]/state.view.zoom; state.view.cy = start.cy + (y - start.p[1])*d/rect[3]/state.view.zoom; clampView(); dirty = true; }
    else if(mode === 'pinch' && ptrs.size === 2){ const [a, b] = [...ptrs.values()]; setZoom(start.z*Math.hypot(a[0] - b[0], a[1] - b[1])/start.d); }
  });
  const end = e => { ptrs.delete(e.pointerId); if(ptrs.size === 0) mode = null; };
  vp.addEventListener('pointerup', end); vp.addEventListener('pointercancel', end);
  vp.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = local(e); zoomAt(state.view.zoom*Math.exp(-e.deltaY*0.0015), x, y); }, {passive:false});
  vp.addEventListener('dblclick', () => { setZoom(1); });
  function setSplit(x){ const d = dpr(); state.view.split = clamp((x*d - rect[0])/rect[2], 0, 1); dirty = true; }
  function zoomAt(z, x, y){
    const d = dpr(), V = state.view; z = clamp(z, 1, 16);
    const lx = (x*d - rect[0])/rect[2], ly = 1 - (y*d - rect[1])/rect[3];
    const ix = (lx - 0.5)/V.zoom + V.cx, iy = (ly - 0.5)/V.zoom + V.cy;
    V.zoom = z; V.cx = ix - (lx - 0.5)/z; V.cy = iy - (ly - 0.5)/z; clampView(); dirty = true;
  }
  window.zoomAt = zoomAt;
  $('#zin').onclick = () => setZoom(state.view.zoom*1.5);
  $('#zout').onclick = () => setZoom(state.view.zoom/1.5);
  $('#zlabel').onclick = () => setZoom(1);
  $('#z11').onclick = () => setZoom(W/rect[2]);
  // drag and drop, paste
  ['dragenter', 'dragover'].forEach(ev => vp.addEventListener(ev, e => { e.preventDefault(); $('#drop').hidden = false; }));
  ['dragleave', 'drop'].forEach(ev => vp.addEventListener(ev, e => { e.preventDefault(); if(ev === 'dragleave' && vp.contains(e.relatedTarget)) return; $('#drop').hidden = true; }));
  vp.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if(f) loadFile(f).catch(err => toast(err.message)); });
  window.addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])][0]; if(f) loadFile(f).catch(err => toast(err.message)); });
})();
function clampView(){ const V = state.view, h = 0.5/V.zoom; V.cx = clamp(V.cx, h, 1 - h); V.cy = clamp(V.cy, h, 1 - h); }
function setZoom(z){ const vp = canvas.getBoundingClientRect(); zoomAt(clamp(z, 1, 16), vp.width/2, vp.height/2); if(z <= 1){ state.view.cx = state.view.cy = 0.5; } dirty = true; }

// ---------- UI ----------
let controls = [];
const baseControls = controls; let condControls = [];
function fmtAge(y){ return y < 1 ? Math.max(0, Math.round(y*52)) + ' weeks' : (y < 2 ? y.toFixed(1) : y.toFixed(1)) + ' years'; }
function confBadge(c){ const t = {E:'Established', P:'Probable', S:'Speculative'}[c]; return c ? `<span class="conf ${c}" title="${t}">${c}</span>` : ''; }
let uid = 0;
function slider(host, d){
  const id = 'c' + (uid++);
  const wrap = document.createElement('div'); wrap.className = 'ctl';
  wrap.innerHTML = `<label for="${id}">${d.label}${confBadge(d.conf)}</label><output for="${id}"></output><input type="range" id="${id}" min="${d.min}" max="${d.max}" step="${d.step}">${d.hint ? `<div class="hint">${d.hint}</div>` : ''}`;
  host.appendChild(wrap);
  const inp = wrap.querySelector('input'), out = wrap.querySelector('output');
  const toS = d.toSlider || (v => v), fromS = d.fromSlider || (v => v);
  inp.addEventListener('input', () => { d.set(fromS(+inp.value)); out.textContent = d.fmt(d.get()); if(d.after) d.after(); state.preset = null; markPreset(); invalidate(); });
  const sync = () => { inp.value = toS(d.get()); out.textContent = d.fmt(d.get()); };
  controls.push(sync); sync(); return wrap;
}
function select(host, d){
  const id = 'c' + (uid++);
  const wrap = document.createElement('div'); wrap.className = 'ctl';
  wrap.innerHTML = `<label for="${id}">${d.label}${confBadge(d.conf)}</label><select id="${id}">${d.opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>${d.hint ? `<div class="hint">${d.hint}</div>` : ''}`;
  host.appendChild(wrap);
  const sel = wrap.querySelector('select');
  sel.addEventListener('change', () => { d.set(sel.value); if(d.after) d.after(); state.preset = null; markPreset(); invalidate(); });
  controls.push(() => { sel.value = String(d.get()); }); controls[controls.length - 1](); return wrap;
}
function check(host, d){
  const id = 'c' + (uid++);
  const wrap = document.createElement('label'); wrap.className = 'check'; wrap.htmlFor = id;
  wrap.innerHTML = `<input type="checkbox" id="${id}"><span>${d.label}</span>${confBadge(d.conf)}`;
  host.appendChild(wrap);
  const cb = wrap.querySelector('input');
  cb.addEventListener('change', () => { d.set(cb.checked); invalidate(); });
  controls.push(() => { cb.checked = !!d.get(); }); controls[controls.length - 1](); return wrap;
}
function buildPanels(){
  slider($('#binoSliders'), {label:'Clearer-eye dominance', conf:'S', min:0.5, max:1, step:0.01, get:() => state.binoc.dom, set:v => state.binoc.dom = v, fmt:v => Math.round(v*100) + '%',
    hint:'How much the clearer eye leads where the two fields overlap. 50% is an even mix.'});
  // presets
  const ph = $('#presets');
  PRESETS.forEach(pr => { const b = document.createElement('button'); b.type = 'button'; b.className = 'preset'; b.dataset.id = pr.id;
    b.innerHTML = `<b>${pr.name}</b><span>${pr.note}</span>`; b.onclick = () => applyPreset(pr); ph.appendChild(b); });
  const P = () => state.profile, pc = $('#profileCtl');
  select(pc, {label:'Breed', opts: Object.entries(BREEDS).map(([k, b]) => [k, b.name]), get:() => P().breed,
    set:v => { const b = BREEDS[v]; Object.assign(state.profile, {breed:v, ci:b.ci, lifespan_years:b.L, refraction_D:b.dD, tapetum:b.tap}); }, after: syncAll});
  slider(pc, {label:'Age', min:0, max:1000, step:1, conf:'P', get:() => P().age_years, set:v => P().age_years = v, fmt:fmtAge,
    toSlider: y => y < 1 ? y*300 : 300 + (y - 1)*700/15, fromSlider: s => s < 300 ? Math.max(1/52, s/300) : 1 + (s - 300)*15/700,
    hint:'Lifespan-scaled: a giant breed ages faster than a toy.'});
  slider(pc, {label:'Expected lifespan', min:6, max:17, step:0.5, conf:'P', get:() => P().lifespan_years, set:v => P().lifespan_years = v, fmt:v => v.toFixed(1) + ' years'});
  slider(pc, {label:'Cephalic index', min:40, max:95, step:1, conf:'S', get:() => P().ci, set:v => P().ci = v, fmt:v => v + ' · ' + skullOf(v),
    hint:'Skull width over length. Long noses get a horizontal visual streak; short noses a round area centralis (r = −0.795).'});
  select(pc, {label:'Coat', opts:[['normal','Normal'],['merle_Mm','Merle (Mm)'],['merle_MM','Double merle (MM)'],['dilute','Dilute'],['white','White / subalbinotic']], get:() => P().coat, set:v => P().coat = v, conf:'P'});
  select(pc, {label:'Iris of this eye', opts:[['brown','Brown'],['blue','Blue']], get:() => P().iris, set:v => P().iris = v, conf:'S', hint:'Less pigment means more stray light and glare.'});
  select(pc, {label:'Tapetum', opts:[['1','Full'],['0.88','Smaller (small breeds)'],['0','Absent']], get:() => String(P().tapetum), set:v => P().tapetum = +v, conf:'S'});
  slider(pc, {label:'Refraction', min:-3, max:2, step:0.25, conf:'S', get:() => P().refraction_D, set:v => P().refraction_D = v, fmt:v => (v > 0 ? '+' : '') + v.toFixed(2) + ' D', hint:'Negative is myopic. Rottweilers 64% and German shepherds 53% myopic in one clinic sample.'});
  select(pc, {label:'Simulated eye', opts:[['OD','Right (OD)'],['OS','Left (OS)']], get:() => P().eye, set:v => P().eye = v, hint:'Sets which side of the image is temporal for one-sided conditions.'});
  slider(pc, {label:'Age-related lens change', min:0, max:1, step:0.05, conf:'S', get:() => state.vision.ageLens, set:v => state.vision.ageLens = v, fmt:v => Math.round(v*100) + '%', hint:'Scales the typical nuclear sclerosis and lens opacity for this age.'});

  const sc = $('#sceneCtl'), S = () => state.scene;
  slider(sc, {label:'Light level', min:-3.5, max:3.5, step:0.1, conf:'P', get:() => S().logL, set:v => S().logL = v,
    fmt:v => { const n = v < -2.5 ? 'starlight' : v < -1.5 ? 'moonlight' : v < -0.3 ? 'dusk' : v < 0.6 ? 'street lighting' : v < 2 ? 'indoors' : 'daylight'; return `${n} · 10^${v.toFixed(1)} cd/m²`; },
    hint:'Below about 10 cd/m² rods take over: colour drains, acuity falls toward 3 cpd, and the dog stays brighter than a human would.'});
  slider(sc, {label:'Image field of view', min:4, max:120, step:1, conf:'', get:() => S().hfov, set:v => S().hfov = v, fmt:v => v + '° wide', hint:'How much of the world the photo spans. A phone camera is about 65°.'});
  slider(sc, {label:'Distance to subject', min:0, max:1000, step:1, get:() => S().dist, set:v => S().dist = v,
    toSlider: d => Math.log(d/0.15)/Math.log(40/0.15)*1000, fromSlider: s => 0.15*Math.pow(40/0.15, s/1000),
    fmt:v => v < 1 ? Math.round(v*100) + ' cm' : v.toFixed(1) + ' m', hint:'Dogs accommodate only 2 to 3 D, so anything nearer than about 40 cm blurs.'});
  check(sc, {label:'Show muzzle silhouette', get:() => S().nose, set:v => S().nose = v, conf:'S'});
  check(sc, {label:'Animate (tear film, particles, noise, video)', get:() => S().live, set:v => S().live = v});
  check(sc, {label:'CRT flicker illustration (slowed down)', get:() => S().flicker, set:v => S().flicker = v, conf:'P'});
  const info = document.createElement('p'); info.className = 'note'; info.id = 'srcinfo'; sc.appendChild(info);

  const vc = $('#visionCtl'), V = () => state.vision;
  slider(vc, {label:'Colour separation', min:0.5, max:1, step:0.05, conf:'P', get:() => V().chroma, set:v => V().chroma = v, fmt:v => 'k = ' + v.toFixed(2)});
  slider(vc, {label:'Peak acuity', min:4, max:19, step:0.5, conf:'E', get:() => V().cpd, set:v => V().cpd = v, fmt:v => `${v} cpd · 20/${Math.round(600/v)}`, hint:'Typical dogs 6 to 12 cycles per degree; humans 30 to 60.'});
  slider(vc, {label:'Peripheral blur growth', min:0, max:12, step:0.5, conf:'S', get:() => V().periph, set:v => V().periph = v, fmt:v => '×' + (1 + v).toFixed(1) + ' at edge'});
  slider(vc, {label:'Contrast threshold', min:0, max:0.15, step:0.005, conf:'S', get:() => V().csf, set:v => V().csf = v, fmt:v => (v*100).toFixed(1) + '%', hint:'No dog contrast sensitivity curve has been measured.'});
  slider(vc, {label:'Night gain', min:1, max:5, step:0.1, conf:'S', get:() => V().nightGain, set:v => V().nightGain = v, fmt:v => '×' + v.toFixed(1), hint:'Extrapolated from cats; the catalog suggests 2.5×.'});
  slider(vc, {label:'Tapetal lower-field boost', min:0, max:0.5, step:0.01, conf:'S', get:() => V().lower, set:v => V().lower = v, fmt:v => '+' + Math.round(v*100) + '%'});
  slider(vc, {label:'Rod noise', min:0, max:1.5, step:0.05, conf:'S', get:() => V().noise, set:v => V().noise = v, fmt:v => v.toFixed(2)});
  slider(vc, {label:'Rod integration time', min:20, max:250, step:5, conf:'P', get:() => V().rodTau, set:v => V().rodTau = v, fmt:v => v + ' ms', hint:'Rods follow flicker to about 20 Hz, so dim scenes smear motion.'});
  slider(vc, {label:'Veiling glare', min:0, max:0.2, step:0.005, conf:'S', get:() => V().veil, set:v => V().veil = v, fmt:v => v.toFixed(3)});
  slider(vc, {label:'Highlight energy', min:0, max:10, step:0.5, conf:'S', get:() => V().hdr, set:v => V().hdr = v, fmt:v => v.toFixed(1), after:() => { source.needsPyr = true; }, hint:'Restores brightness to clipped lights in ordinary photos so glare can spread.'});
  slider(vc, {label:'Motion salience (video)', min:0, max:0.5, step:0.01, conf:'S', get:() => V().salience, set:v => V().salience = v, fmt:v => '+' + Math.round(v*100) + '%'});
  $('#visReset').onclick = () => { state.vision = {...VISION_DEFAULTS}; source.needsPyr = true; syncAll(); invalidate(); };

  buildConditions();
  buildPipeline();
  drawSpectra();
}
function buildConditions(){
  const host = $('#condList'); host.innerHTML = '';
  condControls = []; const saved = controls; controls = condControls;
  GROUPS.forEach(([g, gname]) => {
    const sec = document.createElement('div'); sec.className = 'cgroup';
    sec.innerHTML = `<h4><span>${gname}</span></h4>`;
    CONDS.filter(c => c.g === g).forEach(c => {
      const st = state.conditions[c.id];
      const el = document.createElement('div'); el.className = 'cond' + (st.on ? ' on' : '');
      const id = 'cond_' + c.id;
      el.innerHTML = `<label class="chead" for="${id}"><input type="checkbox" id="${id}" ${st.on ? 'checked' : ''}><span class="nm">${c.name}</span><span class="sv">${st.on ? st.s.toFixed(2) : ''}</span><span class="photo ${c.photo}">Photo: ${c.photo}</span></label>`;
      const body = document.createElement('div'); body.className = 'cbody'; body.hidden = !st.on;
      el.appendChild(body);
      const cb = el.querySelector('input');
      cb.addEventListener('change', () => { st.on = cb.checked; st.source = 'manual'; el.classList.toggle('on', st.on); body.hidden = !st.on; el.querySelector('.sv').textContent = st.on ? st.s.toFixed(2) : ''; state.preset = null; markPreset(); invalidate(); });
      const sl = slider(body, {label: c.id === 'glaucoma' ? 'Pressure (acute)' : 'Severity', conf:'S', min:0, max:1, step:0.01, get:() => st.s, set:v => { st.s = v; el.querySelector('.sv').textContent = v.toFixed(2); }, fmt:v => c.id === 'cataract' ? `${v.toFixed(2)} · ${catStage(v, st.x.hypermature)}` : c.id === 'pigmentary_keratitis' ? `${v.toFixed(2)} · Maini ≈ ${(v*14).toFixed(1)}` : v.toFixed(2)});
      (c.extras || []).forEach(e => {
        if(e.t === 'bool') check(body, {label:e.label, get:() => st.x[e.k], set:v => { st.x[e.k] = v; condControls.forEach(f => f()); }});
        if(e.t === 'sel') select(body, {label:e.label, opts:e.opts, get:() => st.x[e.k], set:v => st.x[e.k] = v});
        if(e.t === 'num') slider(body, {label:e.label, conf:'S', min:e.min, max:e.max, step:e.step, get:() => st.x[e.k], set:v => st.x[e.k] = v, fmt:v => e.unit ? Math.round(v) + e.unit : v.toFixed(2)});
      });
      const pd = document.createElement('p'); pd.textContent = c.d; body.appendChild(pd);
      sec.appendChild(el);
    });
    host.appendChild(sec);
  });
  controls = saved;
}
function buildPipeline(){
  const host = $('#pipe'); host.innerHTML = '';
  STAGES.forEach(s => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'st' + (s.fixed ? ' fixed' : ''); b.title = s.tip;
    b.innerHTML = `<span class="n">${s.n}</span>${s.name}`;
    b.setAttribute('aria-pressed', String(state.stages[s.n]));
    if(!s.fixed) b.onclick = () => { state.stages[s.n] = !state.stages[s.n]; b.setAttribute('aria-pressed', String(state.stages[s.n])); if(s.n === 11) source.resetHist = true; invalidate(); };
    else b.disabled = true;
    host.appendChild(b);
  });
}
function syncBino(){
  const B = state.binoc;
  $('#binoOn').checked = B.on; $('#binoCtl').hidden = !B.on;
  $$('#eyeSeg button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.eye === state.profile.eye)));
  if(B.on){
    const better = condLoad(B.eyes.OD) <= condLoad(B.eyes.OS) ? 'right' : 'left';
    $('#binoNote').textContent = `Editing the ${state.profile.eye === 'OS' ? 'left' : 'right'} eye. The ${better} eye currently looks clearer, so it leads in the binocular zone (±${Math.round((comp ? comp.derived.binocular_overlap_deg : 50)/2)}°). Each side crescent shows only that eye. A photo narrower than the overlap sits entirely in the blended zone.`;
  }
  $('#tagR').textContent = B.on ? 'Dog · both eyes' : 'Dog';
}
function markPreset(){
  syncBino();
  $$('#presets .preset').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === state.preset)));
  const pr = PRESETS.find(p => p.id === state.preset), b = BREEDS[state.profile.breed];
  $('#presetName').textContent = pr ? pr.name : `${b ? b.name : 'Custom dog'}, ${fmtAge(state.profile.age_years)}`;
}
function syncAll(){ baseControls.forEach(f => f()); buildConditions(); markPreset(); }

// spectrum strips: approximate spectral colours, then the dog matrix
function wl2rgb(l){
  let r = 0, g = 0, b = 0;
  if(l < 440){ r = -(l - 440)/60; b = 1; } else if(l < 490){ g = (l - 440)/50; b = 1; } else if(l < 510){ g = 1; b = -(l - 510)/20; }
  else if(l < 580){ r = (l - 510)/70; g = 1; } else if(l < 645){ r = 1; g = -(l - 645)/65; } else r = 1;
  const f = l < 420 ? 0.3 + 0.7*(l - 380)/40 : l > 645 ? 0.3 + 0.7*(700 - l)/55 : 1;
  const lin = v => { v = Math.max(0, v*f); return v <= 0.04045 ? v/12.92 : Math.pow((v + 0.055)/1.055, 2.4); };
  return [lin(r), lin(g), lin(b)];
}
function drawSpectra(){
  const enc = v => Math.round(255*clamp(v <= 0.0031308 ? 12.92*v : 1.055*Math.pow(clamp(v, 0, 1), 1/2.4) - 0.055, 0, 1));
  const M = dogMatrix(state.vision.chroma);
  ['specH', 'specD'].forEach(id => {
    const c = $('#' + id), x = c.getContext('2d'), w = c.width, h = c.height;
    for(let i = 0; i < w; i++){
      const l = 400 + 300*i/w; let rgb = wl2rgb(l);
      if(id === 'specD') rgb = M.map(row => row[0]*rgb[0] + row[1]*rgb[1] + row[2]*rgb[2]);
      x.fillStyle = `rgb(${rgb.map(enc).join(',')})`; x.fillRect(i, 0, 1, h);
    }
  });
  $('#ticks').innerHTML = [400, 480, 555, 620, 700].map(l => `<span style="left:${(l - 400)/3}%" class="${l === 480 ? 'np' : ''}">${l === 480 ? '480 neutral' : l}</span>`).join('');
}

// derived panel, field diagram, HUD, JSON views
let uiPending = false;
function scheduleUI(){ if(uiPending) return; uiPending = true; requestAnimationFrame(() => { uiPending = false; updateUI(); }); }
function updateUI(){
  if(!comp) comp = compile(state, source);
  const d = comp.derived;
  const rows = [
    ['Skull type', d.skull], ['Visual streak strength', d.streak_strength], ['Normalised age (age ÷ lifespan)', d.a],
    ['Nuclear sclerosis', d.nuclear_sclerosis], ['Typical lens opacity', d.age_lens_opacity], ['Accommodation range', d.accommodation_max_D + ' D'],
    ['Effective refraction', d.refraction_D + ' D'], ['Defocus at subject', d.defocus_D + ' D'], ['Pupil', d.pupil_mm + ' mm'],
    ['Retinal gain, day / night', d.retina_gain_photopic + ' / ' + d.retina_gain_scotopic], ['Glare multiplier', '×' + d.glare_multiplier],
    ['Flicker fusion', '≈ ' + d.temporal_cutoff_Hz + ' Hz'], ['Development', d.development],
  ];
  $('#derived').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  drawFov(d.field_total_deg, d.binocular_overlap_deg);
  const m = comp.m, regime = m < 0.05 ? 'Photopic' : m > 0.95 ? 'Scotopic' : 'Mesopic';
  const cpd = d.acuity_cpd_centre;
  const ov = state.view.overlay === 1 ? `<span class="chip">Acuity map: <b>blue</b> 2 cpd or less, <b>gold</b> 16 cpd, a line at each doubling</span>`
    : state.view.overlay === 2 ? `<span class="chip">Dashed lines: binocular zone ±${Math.round(d.binocular_overlap_deg/2)}°${comp.U.uTunnel[0] < 179 ? ' · blue ring: remaining field' : ''}</span>` : '';
  const hud = $('#hud'); hud.hidden = !(state.view.hud || ov);
  hud.innerHTML = ov + (!state.view.hud ? '' : `<span class="chip">${regime}${m >= 0.05 ? ` · rods <b>${Math.round(m*100)}%</b>` : ''}</span><span class="chip">Centre <b>${cpd} cpd</b> · 20/${Math.round(600/Math.max(cpd, 0.1))}</span><span class="chip">${(W/state.scene.hfov).toFixed(0)} px/°</span>`);
  const n = CONDS.filter(c => state.conditions[c.id].on).length;
  $('#ccount').hidden = n === 0; $('#ccount').textContent = n;
  const si = $('#srcinfo'); if(si) si.textContent = `Source: ${source.name || 'sample'} · ${W}×${H} px${source.kind === 'video' ? ' · video' : ''}.`;
  if(!$('[data-pane="data"]').hidden) renderJSON();
  if(lastChroma !== state.vision.chroma){ lastChroma = state.vision.chroma; drawSpectra(); }
}
let lastChroma = 1;
function renderJSON(){
  $('#jProfile').textContent = JSON.stringify(profileJSON(state, comp), null, 2);
  $('#jCond').textContent = JSON.stringify(condHypotheses(state), null, 2);
  $('#jShader').textContent = JSON.stringify(comp.shader, null, 2);
}
function arcPath(cx, cy, r, a0, a1){ // angles in degrees, 0 = straight ahead (up), clockwise positive
  const p = a => [cx + r*Math.sin(a*Math.PI/180), cy - r*Math.cos(a*Math.PI/180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1), large = (a1 - a0) > 180 ? 1 : 0;
  return `M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
}
function drawFov(F, B){
  const svg = $('#fovsvg'), cx = 80, cy = 84, r = 70;
  svg.innerHTML = `
    <path d="${arcPath(cx, cy, r, F/2, 360 - F/2)}" fill="var(--glass-2)" stroke="var(--line)"/>
    <path d="${arcPath(cx, cy, r, -F/2, F/2)}" fill="var(--fg)" fill-opacity="0.12" stroke="var(--fg)" stroke-opacity="0.35"/>
    <path d="${arcPath(cx, cy, r, -B/2, B/2)}" fill="var(--fg)" fill-opacity="0.55"/>
    <ellipse cx="${cx}" cy="${cy + 4}" rx="11" ry="15" fill="var(--fg)"/>
    <ellipse cx="${cx}" cy="${cy - 12}" rx="5" ry="7" fill="var(--fg)"/>`;
  $('#fovlegend').innerHTML = `<div><i style="background:var(--fg);opacity:.55"></i>Binocular ${B}°</div><div><i style="background:var(--fg);opacity:.15;border:1px solid var(--fg)"></i>Total field ${F}°</div><div><i style="background:var(--glass-2);border:1px solid var(--line)"></i>Blind behind ${360 - F}°</div><div style="color:var(--muted)">Field sizes by skull type are working values with no primary source.</div>`;
}

// tabs
$$('#tabs button').forEach(b => b.addEventListener('click', () => {
  $$('#tabs button').forEach(x => x.setAttribute('aria-selected', String(x === b)));
  $$('.pane').forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab);
  if(b.dataset.tab === 'data'){ if(!comp) comp = compile(state, source); renderJSON(); }
}));
$$('#viewmode button').forEach(b => b.addEventListener('click', () => { state.view.mode = +b.dataset.mode; $$('#viewmode button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); dirty = true; }));
$('#overlay').addEventListener('change', e => { state.view.overlay = +e.target.value; dirty = true; scheduleUI(); });
$$('#samples button').forEach(b => b.addEventListener('click', () => loadSample(b.dataset.sample)));
$('#file').addEventListener('change', e => { loadFile(e.target.files[0]).catch(err => toast(err.message)); e.target.value = ''; });
$('#cam').addEventListener('change', e => { loadFile(e.target.files[0]).catch(err => toast(err.message)); e.target.value = ''; });
if(COARSE) $('#camlabel').hidden = false;
const MENUS = {srcBtn:'srcMenu', viewBtn:'viewMenu'};
function closeMenus(except){ Object.entries(MENUS).forEach(([b, mn]) => { if(b === except) return; $('#' + mn).hidden = true; $('#' + b).setAttribute('aria-expanded', 'false'); }); }
function setDrawer(open, tab){
  const d = $('#drawer'); d.hidden = !open; $('#menuBtn').setAttribute('aria-expanded', String(open)); $('#app').classList.toggle('drawer-open', open);
  if(open){ closeMenus(); if(tab) $(`#tabs button[data-tab="${tab}"]`).click(); }
}
Object.entries(MENUS).forEach(([b, mn]) => $('#' + b).addEventListener('click', e => {
  e.stopPropagation(); const open = $('#' + mn).hidden; closeMenus(b);
  $('#' + mn).hidden = !open; $('#' + b).setAttribute('aria-expanded', String(open));
  if(open && matchMedia('(max-width:700px)').matches) setDrawer(false);
}));
$('#menuBtn').addEventListener('click', () => setDrawer($('#drawer').hidden));
$('#presetBtn').addEventListener('click', () => { const d = $('#drawer'), onDog = $('#tabs button[data-tab="dog"]').getAttribute('aria-selected') === 'true'; setDrawer(d.hidden || !onDog, 'dog'); });
$('#drawerClose').addEventListener('click', () => setDrawer(false));
document.addEventListener('pointerdown', e => { if(!e.target.closest('.menu, #srcBtn, #viewBtn')) closeMenus(); });
document.addEventListener('keydown', e => { if(e.key === 'Escape'){ closeMenus(); setDrawer(false); } });
$('#srcMenu').addEventListener('click', e => { if(e.target.closest('#samples button, #camlive')) closeMenus(); });
['#file', '#cam'].forEach(s => $(s).addEventListener('change', () => closeMenus()));
$('#binoOn').addEventListener('change', e => setBinoc(e.target.checked));
$$('#eyeSeg button').forEach(x => x.addEventListener('click', () => editEye(x.dataset.eye)));
$('#hudToggle').addEventListener('change', e => { state.view.hud = e.target.checked; scheduleUI(); });
$('#camlive').onclick = () => { if(!source.live) startCamera(); };
$('#camflip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); };
$('#camstop').onclick = () => { loadSample('yard'); };
$('#vidplay').onclick = () => { const v = source.video; if(!v) return; if(v.paused) v.play(); else v.pause(); updateMediaUI(); };
document.addEventListener('visibilitychange', () => { const v = source.video; if(!source.live || !v) return; if(document.hidden) v.pause(); else v.play().catch(() => {}); });
$('#condClear').onclick = () => { state.conditions = freshConditions(); state.preset = null; buildConditions(); markPreset(); invalidate(); };
$$('[data-copy]').forEach(b => b.addEventListener('click', () => {
  const pre = $('#' + b.dataset.copy), txt = pre.textContent;
  const sel = () => { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Press Ctrl+C or ⌘C to copy.'); };
  try{ navigator.clipboard.writeText(txt).then(() => toast('Copied'), sel); }catch(e){ sel(); }
}));

// import
$('#impExample').onclick = () => { $('#imp').value = JSON.stringify(EXAMPLE_DETECTOR, null, 2); $('#impMsg').textContent = 'Example loaded. Press Apply JSON to map it onto the simulation.'; $('#impMsg').className = 'msg'; };
$('#impApply').onclick = () => {
  const msg = $('#impMsg'); msg.className = 'msg';
  let j; try{ j = JSON.parse($('#imp').value); }catch(e){ msg.className = 'msg err'; msg.textContent = 'That is not valid JSON: ' + e.message; return; }
  let conds = null, urgent = [], notes = [], prof = null;
  if(j.findings){ const r = mapDetector(j); conds = r.conditions; urgent = r.urgent; notes = r.notes;
    if(r.metadata.breed && BREEDS[String(r.metadata.breed).toLowerCase()]) prof = {breed: String(r.metadata.breed).toLowerCase()};
    if(typeof r.metadata.age_years === 'number') prof = Object.assign(prof || {}, {age_years: r.metadata.age_years});
  } else if(j.profile){ prof = j.profile; conds = j.profile.conditions || j.conditions || null; }
  else if(j.conditions){ conds = j.conditions; }
  else { msg.className = 'msg err'; msg.textContent = 'Expected detector output with "findings", condition hypotheses with "conditions", or a "profile".'; return; }
  if(prof){
    if(prof.breed && BREEDS[prof.breed]){ const keepAge = prof.age_years ?? state.profile.age_years; state.profile = breedProfile(prof.breed, keepAge); }
    ['age_years', 'lifespan_years', 'refraction_D', 'tapetum', 'coat', 'eye'].forEach(k => { if(prof[k] !== undefined && prof[k] !== null) state.profile[k] = prof[k]; });
    if(typeof prof.cephalic_index === 'number') state.profile.ci = prof.cephalic_index;
    if(prof.iris){ const v = prof.iris[state.profile.eye] || Object.values(prof.iris)[0]; if(v) state.profile.iris = v === 'blue' ? 'blue' : 'brown'; }
  }
  const unknown = [];
  if(conds){
    state.conditions = freshConditions();
    Object.entries(conds).forEach(([id, v]) => {
      const c = state.conditions[id]; if(!c){ unknown.push(id); return; }
      c.on = true; c.s = clamp(+v.s || 0, 0, 1); c.source = v.source || 'import';
      ['type', 'origin', 'chronic', 'damage', 'dir_deg'].forEach(k => { if(v[k] !== undefined) c.x[k] = v[k]; });
      if(v.stage === 'hypermature') c.x.hypermature = true;
    });
  }
  state.preset = null; syncAll(); invalidate();
  const n = conds ? Object.keys(conds).length - unknown.length : 0;
  const ug = $('#urgent');
  if(urgent.length){ ug.hidden = false; ug.textContent = 'Seek veterinary care now. The photo shows signs that need urgent attention (' + urgent.join(', ').replace(/_/g, ' ') + '). The simulation below is only an illustration.'; }
  else ug.hidden = true;
  msg.textContent = `Applied ${n} condition${n === 1 ? '' : 's'}${prof ? ' and profile fields' : ''}.` + (unknown.length ? ` Ignored unknown: ${unknown.join(', ')}.` : '') + (notes.length ? ' ' + notes.join(' ') : '');
};

// save
(async () => {
  try{
    for(let i = 0; i < 30 && !window.claude?.use; i++) await new Promise(r => setTimeout(r, 100));
    let dl = window.claude?.use ? await window.claude.use('downloads') : null;
    if(!dl && !inArtifact()) dl = {save: async ({filename, data}) => { // standalone page: a plain download link works
      const u = URL.createObjectURL(data), l = document.createElement('a'); l.href = u; l.download = filename; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }};
    if(!dl) return;
    const btn = $('#save'); btn.hidden = false;
    btn.onclick = async () => {
      if(!engineOK) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, hist[histIdx], 0);
      const px = new Uint8Array(W*H*4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); const id = x.createImageData(W, H);
      for(let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y)*W*4, (H - y)*W*4), y*W*4);
      x.putImageData(id, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      try{ await dl.save({filename: 'dog-view-' + (state.preset || 'custom') + '.png', data: blob}); toast('Saved'); }
      catch(e){ if(e && e.code !== 'declined') toast('The image could not be saved here.'); }
    };
  }catch(e){}
})();

let toastT;
function toast(t){ const el = $('#toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2600); }

// ---------- Boot ----------
buildPanels();
readBg();
if(engineOK){
  try{ initGL(); }
  catch(e){ engineOK = false; console.error(e); const f = document.createElement('div'); f.className = 'glfail'; f.textContent = 'The shader failed to compile on this device: ' + e.message; $('#vp').appendChild(f); }
} else {
  const f = document.createElement('div'); f.className = 'glfail'; f.textContent = 'This browser does not offer WebGL 2, which the simulator needs. Try a current Chrome, Edge, Firefox or Safari.'; $('#vp').appendChild(f);
}
new ResizeObserver(() => { resize(); dirty = true; }).observe($('#vp'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readBg(); dirty = true; });
new MutationObserver(() => { readBg(); dirty = true; }).observe(document.documentElement, {attributes:true, attributeFilter:['data-theme']});
resize();
loadSample('yard');
applyPreset(PRESETS.find(p => p.id === 'kcs15both')); // default: Raúl's dog, both eyes
requestAnimationFrame(frame);
