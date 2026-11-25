// ---------- GLSL ----------
const GLSL_COMMON = `
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
`;

const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

// Stage 0: decode sRGB to linear. Alpha carries a pseudo-HDR "highlight energy" so LDR photos can still bloom.
const FS_LINEARIZE = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform float uHdr; uniform float uAS;
${GLSL_COMMON}
void main(){
  vec3 l = srgb2lin(texture(uSrc, vUv).rgb);
  float mx = max(l.r, max(l.g, l.b));
  float e = uHdr*pow(smoothstep(0.72, 1.0, mx), 2.0);
  o = vec4(l, e/uAS);
}`;

// Gaussian pyramid: [1 3 3 1] binomial downsample done with four bilinear taps.
const FS_DOWN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 d = 0.75*uTexel;
  o = 0.25*(texture(uTex, vUv+vec2(-d.x,-d.y)) + texture(uTex, vUv+vec2(d.x,-d.y)) +
            texture(uTex, vUv+vec2(-d.x, d.y)) + texture(uTex, vUv+vec2(d.x, d.y)));
}`;

// Stages 1 to 10 in one composite pass, following the catalog's canonical order (S3).
const FS_MAIN = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uPyr; uniform float uLevels; uniform float uAS;
uniform vec2 uSize; uniform float uPPD; uniform vec2 uHalf; uniform float uTime; uniform float uTS;
uniform float uAcu; uniform float uPeri; uniform vec2 uTopo; uniform float uBlurG; uniform float uDev;
uniform vec3 uWarp; uniform vec4 uUlcer;
uniform vec4 uOccA[4]; uniform vec4 uOccB[4]; uniform float uMucus;
uniform vec4 uHaze; uniform vec4 uCat; uniform vec3 uCatTint; uniform float uSparkle;
uniform float uContrast; uniform float uLocalDeg;
uniform float uVeil; uniform float uBloom; uniform float uBloomDeg; uniform vec4 uHalo; uniform vec4 uGhost;
uniform vec3 uTint;
uniform mat3 uDog; uniform vec3 uRowL; uniform vec3 uRod; uniform float uM; uniform float uDesat; uniform float uCsf;
uniform vec2 uTunnel; uniform vec4 uScot[6]; uniform float uArc; uniform float uStreak; uniform vec4 uCurtain; uniform float uResid;
uniform vec4 uLid; uniform float uThird; uniform vec3 uThirdTint; uniform vec2 uNose;
uniform float uGain; uniform float uLower; uniform float uNoise; uniform vec3 uPart;
uniform float uOverlay; uniform vec2 uZone;
${GLSL_COMMON}
float sk(float k){ float p = pow(4.0, k); return sqrt(0.25*(p-1.0) + p/3.0); }
vec4 bsp(vec2 uv, float lod){
  vec2 sz = vec2(textureSize(uPyr, int(lod)));
  vec2 st = uv*sz - 0.5; vec2 i = floor(st); vec2 f = st - i;
  vec2 f2 = f*f, f3 = f2*f;
  vec2 w0 = (1.0 - 3.0*f + 3.0*f2 - f3)/6.0;
  vec2 w1 = (4.0 - 6.0*f2 + 3.0*f3)/6.0;
  vec2 w2 = (1.0 + 3.0*f + 3.0*f2 - 3.0*f3)/6.0;
  vec2 w3 = f3/6.0;
  vec2 g0 = w0+w1, g1 = w2+w3;
  vec2 h0 = (i - 0.5 + w1/g0)/sz, h1 = (i + 1.5 + w3/g1)/sz;
  return g0.x*(g0.y*textureLod(uPyr, vec2(h0.x,h0.y), lod) + g1.y*textureLod(uPyr, vec2(h0.x,h1.y), lod)) +
         g1.x*(g0.y*textureLod(uPyr, vec2(h1.x,h0.y), lod) + g1.y*textureLod(uPyr, vec2(h1.x,h1.y), lod));
}
// Gaussian blur of arbitrary sigma (in px): exact taps when small, B-spline pyramid lookup otherwise.
vec4 blurS(vec2 uv, float s){
  if(s < 0.4) return textureLod(uPyr, uv, 0.0);
  if(s < 1.44){
    vec2 px = 1.0/uSize; vec4 acc = vec4(0.0); float ws = 0.0;
    for(int y=-2; y<=2; y++) for(int x=-2; x<=2; x++){
      float w = exp(-float(x*x+y*y)/(2.0*s*s));
      acc += w*textureLod(uPyr, uv + vec2(float(x),float(y))*px, 0.0); ws += w; }
    return acc/ws;
  }
  float k0 = clamp(floor(log2(s/0.764)), 1.0, uLevels-2.0);
  float a = sk(k0), b = sk(k0+1.0);
  float t = clamp((s*s - a*a)/(b*b - a*a), 0.0, 1.0);
  return mix(bsp(uv, k0), bsp(uv, k0+1.0), t);
}
const vec3 Y709 = vec3(0.2126, 0.7152, 0.0722);
void main(){
  vec2 p = (vUv - 0.5)*2.0*uHalf;          // field position in degrees, +y up
  vec2 pe = vec2(p.x*uTS, p.y);            // eye frame: +x is the temporal field
  vec2 deg2uv = 1.0/(2.0*uHalf);
  float r = length(p);

  // ---- Stage 8 topography: visual streak vs area centralis sets how blur grows with eccentricity
  float g = exp(-0.5*(p.x*p.x/(uTopo.x*uTopo.x) + p.y*p.y/(uTopo.y*uTopo.y)));
  float sA = uAcu*(1.0 + uPeri*(1.0 - g));

  // ---- Stage 3 tear film and cornea: distortion
  vec2 uv = vUv;
  if(uWarp.x > 0.0){
    vec2 q = vUv*uWarp.y + vec2(uWarp.z*0.13, -uWarp.z*0.07);
    vec2 w = vec2(vnoise(q), vnoise(q + vec2(17.3, 5.1))) - 0.5;
    uv += w*2.0*uWarp.x*deg2uv;
  }
  float ul = 0.0;
  if(uUlcer.w > 0.0){
    vec2 uc = vec2(uUlcer.x*uTS, uUlcer.y);
    float d = length(p - uc)/uUlcer.z;
    ul = (1.0 - smoothstep(0.5, 1.3, d))*uUlcer.w;
    vec2 w = vec2(vnoise(p*0.25 + 3.1), vnoise(p*0.25 + 9.7)) - 0.5;
    uv += w*ul*1.5*deg2uv;
  }

  // ---- Stages 3, 5, 6: all optical blur combined in quadrature
  float sig = sqrt(sA*sA + uBlurG*uBlurG + (2.4*ul)*(2.4*ul))*uDev;
  float spx = sig*uPPD;
  vec3 c = blurS(uv, spx).rgb;

  // ---- Stage 4/5: ghost image (lens subluxation, iris holes)
  if(uGhost.x > 0.0){
    vec2 off = vec2(uGhost.y*uTS, uGhost.z)*deg2uv;
    c = mix(c, blurS(uv + off, max(spx, uGhost.w*uPPD)).rgb, uGhost.x);
  }
  vec3 mean = textureLod(uPyr, vec2(0.5), uLevels - 1.0).rgb;
  vec3 lm = blurS(uv, max(uLocalDeg*uPPD, spx*2.0)).rgb;

  // ---- Stage 3: corneal occluders (pigment, pannus) and stage 4 chamber occluders (hyphema, hypopyon).
  // They sit far from the focal plane, so they are soft field-wedges, not shapes.
  vec3 trans = vec3(1.0);
  for(int i=0; i<4; i++){
    if(uOccB[i].a > 0.0){
      float pr = dot(pe, uOccA[i].xy) + 6.0*(vnoise(pe*0.05 + float(i)*7.0) - 0.5);
      float cov = smoothstep(uOccA[i].z - uOccA[i].w, uOccA[i].z + uOccA[i].w, pr);
      trans *= mix(vec3(1.0), uOccB[i].rgb, min(1.0, cov*1.2))*(1.0 - cov*uOccB[i].a);
    }
  }
  c *= trans; lm *= trans;

  // ---- Stage 8: contrast sensitivity, a soft threshold on dog-luminance detail
  if(uCsf > 0.0){
    vec3 sr = blurS(uv, max(spx*2.5, 2.5)).rgb*trans;
    float L = mix(dot(uRowL, c), dot(uRod, c), uM);
    float Ls = mix(dot(uRowL, sr), dot(uRod, sr), uM);
    float d = L - Ls; float t = uCsf*(Ls + 0.02);
    float k = d*d/(d*d + t*t + 1e-8);
    c *= (Ls + d*k)/max(L, 1e-4);
  }

  if(uMucus > 0.0){
    float st = vnoise(vec2(vUv.x*3.0 + uTime*0.03, vUv.y*22.0 + sin(vUv.x*4.0)*0.8));
    c = mix(c, lm*1.08 + 0.015, uMucus*smoothstep(0.55, 0.85, st));
  }

  // ---- Stage 5: lens haze with spatial mask by cataract type, then contrast loss
  float r65 = r/65.0; float cm = 1.0;
  if(uCat.z > 0.5 && uCat.z < 1.5){
    float ang = atan(p.y, p.x);
    float sp = smoothstep(0.25, 0.85, 0.5 + 0.5*sin(ang*11.0 + 3.0*vnoise(vec2(ang*2.0, 1.3))));
    cm = mix(0.15, 1.0, sp)*smoothstep(uCat.w - 0.18, uCat.w + 0.18, r65);
  } else if(uCat.z > 1.5){
    cm = mix(0.25, 1.0, exp(-r65*r65/(2.0*0.45*0.45)));
  }
  float hc = uCat.x*cm, hg = uHaze.a;
  float ht = min(0.95, hg + hc - hg*hc);
  float mL = dot(mean, Y709), lL = dot(lm, Y709);
  vec3 hcol = mix(mL, lL, 0.5)*mix(uHaze.rgb, uCatTint, hc/(hc + hg + 1e-4))*1.05;
  c = lm + (c - lm)*uContrast*(1.0 - uCat.y*cm);
  c = mix(c, hcol, ht);

  // ---- Stage 10 glare: veiling glare (1/theta^2-like tail from coarse levels), bloom and halos
  if(uVeil > 0.0){
    vec3 v = vec3(0.0); float ws = 0.0;
    for(int k=3; k<13; k++){ float fk = float(k); if(fk > uLevels - 1.0) break;
      float w = 1.0/(fk - 1.5); vec4 t = textureLod(uPyr, uv, fk); v += w*t.rgb*(1.0 + t.a*uAS); ws += w; }
    c += uVeil*v/max(ws, 1e-4);
  }
  if(uBloom > 0.0){
    float bp = uBloomDeg*uPPD;
    vec4 b1 = blurS(uv, bp), b2 = blurS(uv, bp*0.3);
    vec3 c1 = b1.rgb/(max(max(b1.r,b1.g),b1.b) + 1e-3), c2 = b2.rgb/(max(max(b2.r,b2.g),b2.b) + 1e-3);
    c += uBloom*(0.55*b1.a*c1 + 0.45*b2.a*c2)*uAS*0.5;
  }
  if(uHalo.x > 0.0){
    vec2 R = uHalo.y*deg2uv;
    float lv = clamp(floor(log2(max(uHalo.z*uPPD, 1.0)/0.764)), 1.0, uLevels - 2.0);
    vec3 h = vec3(0.0);
    for(int i=0; i<20; i++){
      float a = 6.2831853*float(i)/20.0; vec2 d = vec2(cos(a), sin(a))*R;
      h.r += textureLod(uPyr, uv + d*(1.0 + 0.07*uHalo.w), lv).a;
      h.g += textureLod(uPyr, uv + d, lv).a;
      h.b += textureLod(uPyr, uv + d*(1.0 - 0.07*uHalo.w), lv).a;
    }
    c += uHalo.x*uAS*h/20.0*0.9;
  }
  if(uSparkle > 0.0){
    vec2 cell = floor(vUv*uSize/3.0); float hs = hash(cell);
    if(hs < uSparkle*0.006) c += vec3(0.9, 0.95, 1.0)*(0.5 + 0.5*sin(uTime*6.0 + hs*4000.0))*0.8;
  }
  c *= uTint;

  // ---- Stage 7: dichromat colour (photopic) mixed toward rod luminance (scotopic)
  float rod = dot(uRod, c);
  c = mix(uDog*c, vec3(rod)*vec3(0.95, 1.0, 1.06), uM);

  // ---- Stage 9: retinal and neural field masks, combined by minimum, applied after optical blur
  float vis = 1.0;
  if(uTunnel.x < 179.0) vis = min(vis, 1.0 - smoothstep(uTunnel.x - uTunnel.y, uTunnel.x + uTunnel.y, r + 3.0*(vnoise(p*0.12) - 0.5)));
  for(int i=0; i<6; i++){
    if(uScot[i].w > 0.0){
      vec2 sc = vec2(uScot[i].x*uTS, uScot[i].y);
      float d = length(p - sc)/uScot[i].z + 0.18*(vnoise(p*0.35 + float(i)*3.0) - 0.5);
      vis = min(vis, 1.0 - uScot[i].w*(1.0 - smoothstep(0.72, 1.05, d)));
    }
  }
  if(uArc > 0.0){
    float ang = atan(p.y, p.x);
    float band = smoothstep(5.0, 9.0, r)*(1.0 - smoothstep(18.0, 27.0, r));
    float ver = smoothstep(0.25, 0.85, abs(sin(ang)));
    float nz = vnoise(p*0.16 + 3.0);
    vis = min(vis, 1.0 - min(1.0, uArc*1.4)*band*ver*smoothstep(0.55 - 0.4*uArc, 0.8 - 0.3*uArc, nz));
  }
  if(uStreak > 0.0){
    float n1 = vnoise(vec2(p.x*0.07, p.y*0.55) + 7.0);
    float n2 = vnoise(p*0.11 + 11.0);
    vis = min(vis, 1.0 - uStreak*smoothstep(0.66, 0.74, n1));
    vis = min(vis, 1.0 - uStreak*smoothstep(0.78 - 0.25*uStreak, 0.86 - 0.2*uStreak, n2));
  }
  if(uCurtain.w > 0.0){
    float pr = dot(p, uCurtain.xy) + 4.0*(vnoise(p*0.09) - 0.5);
    vis = min(vis, 1.0 - smoothstep(uCurtain.z - uCurtain.w, uCurtain.z + uCurtain.w, pr));
  }
  vec3 res = textureLod(uPyr, vUv, max(uLevels - 4.0, 0.0)).rgb;
  float resL = mix(dot(uRowL, res), dot(uRod, res), uM);
  c = mix(vec3(resL*uResid), c, vis);
  c = mix(c, vec3(dot(c, Y709)), uDesat);

  // ---- Stage 2: lids, third eyelid; Stage 1: muzzle silhouette. All far out of focus, so very soft.
  float x = vUv.x*2.0 - 1.0;
  if(uLid.x > 0.0 || uLid.y > 0.0 || uLid.w > 0.0){
    float top = uLid.x + uLid.w*0.6, bot = uLid.y + uLid.w*0.55;
    float yT = 1.0 - top*(1.15 - 0.3*x*x), yB = bot*(1.15 - 0.3*x*x);
    float mT = top > 0.0 ? smoothstep(yT - 0.07, yT + 0.07, vUv.y) : 0.0;
    float mB = bot > 0.0 ? 1.0 - smoothstep(yB - 0.07, yB + 0.07, vUv.y) : 0.0;
    c = mix(c, c*vec3(0.12, 0.035, 0.03) + vec3(0.004, 0.001, 0.001), max(mT, mB));
  }
  if(uThird > 0.0){
    float asp = uSize.x/uSize.y;
    vec2 q = vec2((uTS > 0.0 ? vUv.x : 1.0 - vUv.x)*asp, vUv.y);
    float cov = 1.0 - smoothstep(uThird*0.9 - 0.22, uThird*0.9 + 0.22, length(q));
    c = mix(c, c*uThirdTint*0.55 + uThirdTint*0.01, cov*0.9);
  }
  if(uNose.y > 0.0){
    vec2 q = (p - vec2(0.0, -uHalf.y - uNose.x*0.3))/vec2(uNose.x, uNose.x*0.8);
    c = mix(c, c*0.08, (1.0 - smoothstep(0.7, 1.2, length(q)))*0.92);
  }

  // ---- Stage 10: tapetal lower-field boost, adaptation gain, luminance-dependent noise
  float lower = smoothstep(0.0, -1.0, p.y/max(uHalf.y, 1.0));
  c *= 1.0 + uLower*lower; c += uLower*0.25*lower*mL;
  c *= uGain;
  if(uNoise > 0.0){
    vec2 nc = floor(vUv*uSize/1.5);
    float n = hash(nc + fract(uTime*3.7)*vec2(131.0, 71.0)) + hash(nc*1.7 + fract(uTime*5.3)*vec2(17.0, 253.0)) - 1.0;
    c += vec3(n*uNoise*sqrt(dot(c, Y709) + 0.003)*1.6);
  }
  // ---- Stage 11 (drawn here): vitreous particles
  if(uPart.x > 0.0){
    float asp = uSize.x/uSize.y;
    for(int l=0; l<2; l++){
      float sc = l == 0 ? 14.0 : 7.0;
      vec2 q = vec2(vUv.x*asp, vUv.y)*sc + vec2(sin(uTime*0.25 + float(l))*0.6, -uTime*0.05*(uPart.y > 0.5 ? 0.3 : 1.0));
      vec2 id = floor(q), f = fract(q) - 0.5;
      float h = hash(id + float(l)*13.0);
      if(h < uPart.x){
        vec2 off = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5)*0.6 + 0.12*vec2(sin(uTime*0.9 + h*30.0), cos(uTime*0.7 + h*20.0));
        float d = length(f - off);
        if(uPart.y < 0.5){ float rr = 0.05 + 0.04*h; c += vec3((1.0 - smoothstep(rr*0.3, rr, d))*0.4*(0.6 + 0.4*sin(uTime*3.0 + h*50.0))); }
        else { float rr = 0.16 + 0.15*h; c *= 1.0 - 0.35*(1.0 - smoothstep(rr*0.3, rr, d)); }
      }
    }
  }
  // ---- Overlays
  if(uOverlay > 0.5 && uOverlay < 1.5){
    float lc = log2(0.389/max(sig, 1e-4));
    vec3 ramp = mix(vec3(0.02, 0.05, 0.85), vec3(1.0, 0.6, 0.0), clamp((lc - 1.0)/3.0, 0.0, 1.0));
    float ln = 1.0 - smoothstep(0.0, fwidth(lc)*1.5, abs(fract(lc + 0.5) - 0.5));
    c = mix(vec3(dot(c, Y709)), ramp, 0.72); c = mix(c, vec3(1.0), ln*0.8);
  } else if(uOverlay > 1.5){
    float bx = abs(p.x) - uZone.x;
    float line = 1.0 - smoothstep(0.0, fwidth(p.x)*1.5, abs(bx));
    c = mix(c, vec3(0.9, 0.62, 0.03), line*step(0.5, fract(p.y*0.3))*0.95);
    if(bx > 0.0) c *= 0.78;
    if(uTunnel.x < 179.0){ float lt = 1.0 - smoothstep(0.0, fwidth(r)*1.5, abs(r - uTunnel.x)); c = mix(c, vec3(0.2, 0.3, 1.0), lt); }
  }
  // ---- Stage 12: soft shoulder then encode to sRGB
  c = max(c, 0.0);
  c = mix(c, 0.8 + 0.2*(1.0 - exp(-(c - 0.8)/0.2)), step(0.8, c));
  o = vec4(lin2srgb(c), 1.0);
}`;

// Stage 11: rod temporal integration (EMA) and motion salience.
const FS_TEMPORAL = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uCur; uniform sampler2D uPrev; uniform float uA; uniform float uSal;
void main(){
  vec3 c = texture(uCur, vUv).rgb, p = texture(uPrev, vUv).rgb;
  float d = abs(dot(c - p, vec3(0.3333)));
  float per = 0.4 + 0.6*smoothstep(0.1, 0.5, length(vUv - 0.5));
  c *= 1.0 + uSal*per*smoothstep(0.015, 0.12, d);
  o = vec4(mix(p, c, uA), 1.0);
}`;

const FS_DISPLAY = `#version 300 es
precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uDogT; uniform sampler2D uSrcT;
uniform vec4 uRect; uniform float uZoom; uniform vec2 uCenter; uniform float uSplitX; uniform float uMode;
uniform vec3 uBg; uniform float uHG; uniform float uHD;
${GLSL_COMMON}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 loc = (fc - uRect.xy)/uRect.zw;
  if(loc.x < 0.0 || loc.y < 0.0 || loc.x > 1.0 || loc.y > 1.0){ o = vec4(uBg, 1.0); return; }
  vec2 iuv = (loc - 0.5)/uZoom + uCenter;
  bool dog = uMode > 0.5 && uMode < 1.5 || (uMode < 0.5 && fc.x >= uSplitX);
  vec3 c;
  if(dog) c = texture(uDogT, iuv).rgb;
  else {
    vec3 l = srgb2lin(texture(uSrcT, iuv).rgb)*uHG;
    l = mix(l, vec3(dot(l, vec3(0.2126, 0.7152, 0.0722))), uHD);
    c = lin2srgb(l);
  }
  o = vec4(c, 1.0);
}`;
