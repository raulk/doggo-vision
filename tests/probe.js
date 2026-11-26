const { chromium } = require('playwright');
const fs = require('fs');
// Renders synthetic targets through presets for tests/realism.py.
// Usage: node tests/probe.js <outdir> [page.html]
const OUT = process.argv[2] || 'tests/out';
const PAGE = process.argv[3] || require('path').resolve(__dirname, '../site/index.html');
(async () => {
  const b = await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const pg = await b.newPage({viewport:{width:1200,height:900}, deviceScaleFactor:1});
  pg.on('pageerror', e => console.log('ERR', e.message));
  await pg.goto('file://' + PAGE);
  await pg.waitForTimeout(1500);
  const living = null;
  await pg.evaluate(async (src) => {


    // PSF probe: black field with a bright 0.5 deg disc, 50 deg wide
    const p = document.createElement('canvas'); p.width = 1200; p.height = 900; const x = p.getContext('2d');
    x.fillStyle = '#000'; x.fillRect(0,0,1200,900); x.fillStyle = '#fff'; x.beginPath(); x.arc(600,450,6,0,7); x.fill(); window._psf = p;
    // gratings: 20 deg wide (60 px/deg); rows of sine gratings at 50% contrast around mid-grey
    const g = document.createElement('canvas'); g.width = 1200; g.height = 900; const y = g.getContext('2d');
    const id = y.createImageData(1200, 900); const F = [1,2,3,4,6,8,12,16];
    for(let r=0;r<900;r++){ const band = Math.floor(r/(900/F.length)); const f = F[band];
      for(let col=0; col<1200; col++){ const lin = 0.2*(1 + 0.5*Math.sin(2*Math.PI*f*(col-600)/60));
        const s = lin <= 0.0031308 ? lin*12.92 : 1.055*Math.pow(lin,1/2.4)-0.055; const i=(r*1200+col)*4; id.data[i]=id.data[i+1]=id.data[i+2]=Math.round(s*255); id.data[i+3]=255; } }
    y.putImageData(id,0,0); window._grat = g;
  }, living);
  const hideUI = () => pg.addStyleTag({content:'header,.top,.bar,#hud,.zoom,.split,button,.title,.lbl,.label{visibility:hidden !important}'});
  await hideUI();
  async function run(preset, srcName, meta, ph, mode, file){
    await pg.evaluate(([preset, srcName, meta, ph, mode]) => {
      if(srcName === 'yard' || srcName === 'street' || srcName === 'chart') loadSample(srcName);
      else setImageSource(window['_' + srcName], meta);
      applyPreset(PRESETS.find(p => p.id === preset));
      if(meta && meta.logL !== undefined) state.scene.logL = meta.logL;
      if(meta && meta.hfov) state.scene.hfov = meta.hfov;
      state.view.mode = mode; state.scene.live = false; freezeT = ph; comp = null; comp2 = null; dirty = true;
      if(typeof syncAll === 'function') syncAll();
    }, [preset, srcName, meta, ph, mode]);
    await pg.waitForTimeout(1500);
    await pg.screenshot({path: `${OUT}/${file}.png`});
  }
  fs.mkdirSync(OUT, {recursive:true});
  const presets = ['lab','kcs15b','kcs15','kcs15both'];
  // tear phase: 1.2 s after a blink (fresh) and 5.8 s (dry, just before the next blink)
  for(const p of presets){
    for(const [ph, tag] of [[1.2,'fresh'],[5.8,'dry']]){
      await run(p, 'psf', {name:'psf', hfov:50, dist:6, logL:2.0}, ph, 1, `psf-${p}-${tag}`);
      await run(p, 'grat', {name:'grat', hfov:20, dist:6, logL:2.5}, ph, 1, `grat-${p}-${tag}`);
    }
  }
  await run('lab', 'grat', {name:'grat', hfov:20, dist:6, logL:2.5}, 1.2, 2, `grat-src`);
  await run('lab', 'psf', {name:'psf', hfov:50, dist:6, logL:2.0}, 1.2, 2, `psf-src`);
  const info = await pg.evaluate(() => ['lab','kcs15b','kcs15'].map(id => { applyPreset(PRESETS.find(p => p.id === id)); const c = compile(state, source); return {id, derived:c.derived, U:{blurG:c.U.uBlurG, acu:c.U.uAcu, haze:c.U.uHaze, contrast:c.U.uContrast, bloom:c.U.uBloom, veil:c.U.uVeil, gain:c.U.uGain, lid:c.U.uLid, tint:c.U.uTint, csf:c.U.uCsf, peri:c.U.uPeri}, ks:c.kcsState}; }));
  fs.writeFileSync(`${OUT}/info.json`, JSON.stringify(info, null, 1));
  await b.close();
})();
