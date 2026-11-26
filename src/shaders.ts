export const P3_TO_SRGB = [
	[1.2249401, -0.2249401, 0],
	[-0.0420569, 1.0420569, 0],
	[-0.0196376, -0.0786361, 1.0982737],
] as const;

const GLSL_COMMON = `
const vec3 Y709 = vec3(0.2126, 0.7152, 0.0722);
vec3 p3ToSrgb(vec3 p3){
  return vec3(${P3_TO_SRGB.map((row) => `dot(p3, vec3(${row.join(", ")}))`).join(", ")});
}
float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  float a=hash(i), b=hash(i+vec2(1.0,0.0)), c=hash(i+vec2(0.0,1.0)), d=hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }
vec3 srgb2lin(vec3 c){ return mix(c/12.92, pow((c+0.055)/1.055, vec3(2.4)), step(0.04045, c)); }
vec3 lin2srgb(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c*12.92, 1.055*pow(c, vec3(1.0/2.4))-0.055, step(0.0031308, c)); }
vec3 encodeDog(vec3 c){
  c = max(c, 0.0);
  c = mix(c, 0.8 + 0.2*(1.0 - exp(-(c - 0.8)/0.2)), step(0.8, c));
  return lin2srgb(c);
}
`;

export const VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

export const FS_PANO = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc;
uniform vec2 uField; uniform vec2 uLook; uniform vec2 uSpan; uniform vec2 uOffset;
uniform float uCylindrical;
void main(){
  vec2 dog = radians((vUv - 0.5)*uField);
  vec3 ray = vec3(sin(dog.x)*cos(dog.y), sin(dog.y), cos(dog.x)*cos(dog.y));
  float pitch = radians(uLook.y);
  vec2 yz = mat2(cos(pitch), -sin(pitch), sin(pitch), cos(pitch))*ray.yz;
  float lon = degrees(atan(ray.x, yz.y)) + uLook.x - uOffset.x;
  lon = mod(lon + 180.0, 360.0) - 180.0;
  float lat = degrees(asin(clamp(yz.x, -1.0, 1.0))) - uOffset.y;
  vec2 uv = vec2(lon/uSpan.x, lat/uSpan.y) + 0.5;
  if(uCylindrical > 0.5){
    if(abs(lat) > 0.5*uSpan.y){ o = vec4(0.0); return; }
    uv.y = 0.5 + 0.5*tan(radians(lat))/tan(radians(0.5*uSpan.y));
  }
  if(uSpan.x >= 360.0) uv.x = fract(uv.x);
  if(any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))){
    o = vec4(0.0); return;
  }
  float edge = 1.0 - smoothstep(0.965, 1.0, abs(vUv.x*2.0 - 1.0));
  o = vec4(texture(uSrc, uv).rgb, edge);
}`;

// Stage 0: decode the source transfer curve. Alpha carries measured excess light or the SDR highlight estimate.
export const FS_LINEARIZE = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uSrc; uniform float uHdr; uniform float uAS; uniform float uLinear; uniform float uInputP3;
uniform sampler2D uGainMap; uniform float uPanorama; uniform float uHasGainMap; uniform float uApple; uniform float uBaseHdr;
uniform vec3 uGmMin; uniform vec3 uGmMax; uniform vec3 uGmGamma; uniform vec3 uGmBaseOffset; uniform vec3 uGmAltOffset;
${GLSL_COMMON}
void main(){
  vec4 src = texture(uSrc, vUv);
  if(uPanorama > 0.5 && src.a == 0.0){ o = vec4(0.0); return; }
  vec3 l = srgb2lin(src.rgb);
  float mx = max(l.r, max(l.g, l.b));
  float e = uHdr*pow(smoothstep(0.72, 1.0, mx), 2.0);
  vec3 hdr = l;
  if(uHasGainMap > 0.5){
    vec3 gm = texture(uGainMap, vUv).rgb;
    vec3 logGain = mix(uGmMin, uGmMax, pow(gm, 1.0/max(uGmGamma, vec3(0.001))));
    // Bound inverse gain where the forward gain would be below 1e-4.
    vec3 boost = exp2(clamp(logGain, -16.0, uBaseHdr > 0.5 ? log2(1e4) : 16.0));
    if(uApple > 0.5){
      vec3 map709 = mix(gm/4.5, pow((gm + 0.099)/1.099, vec3(1.0/0.45)), step(0.081, gm));
      boost = 1.0 + (exp2(uGmMax) - 1.0)*map709;
    }
    vec3 alternate = (l + uGmBaseOffset)*boost - uGmAltOffset;
    if(uBaseHdr > 0.5) l = clamp(alternate, 0.0, 1.0);
    else hdr = alternate;
  }
  if(uInputP3 > 0.5){
    l = p3ToSrgb(l);
    hdr = p3ToSrgb(hdr);
  }
  if(uHasGainMap > 0.5) e = max(0.0, dot(hdr - l, Y709));
  // Limit only to the finite range of the half-float target.
  o = clamp(vec4(uLinear > 0.5 ? hdr : l, e/uAS), -65504.0, 65504.0);
}`;

// Gaussian pyramid: [1 3 3 1] binomial downsample done with four bilinear taps.
export const FS_DOWN = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel;
void main(){
  vec2 d = 0.75*uTexel;
  o = 0.25*(texture(uTex, vUv+vec2(-d.x,-d.y)) + texture(uTex, vUv+vec2(d.x,-d.y)) +
            texture(uTex, vUv+vec2(-d.x, d.y)) + texture(uTex, vUv+vec2(d.x, d.y)));
}`;

// Stages 1 to 10 in one composite pass, following the catalog's canonical order (S3).
export const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uDepthTex; uniform sampler2D uPanoMask;
uniform float uHasDepth; uniform float uFocusInvDist; uniform float uRefr; uniform float uAmax;
uniform float uPupilMm; uniform float uDepthInvNear; uniform float uDepthInvFar;
uniform float uPanorama; uniform float uDepthOverlay;
uniform sampler2D uPyr; uniform float uLevels; uniform float uAS;
uniform vec2 uSize; uniform float uPPD; uniform vec2 uHalf; uniform float uTime; uniform float uTS;
uniform float uAcu; uniform float uPeri; uniform vec2 uTopo; uniform float uBlurG; uniform float uDev;
uniform float uRectilinear; uniform float uLinear; uniform float uMeasuredHDR;
uniform vec3 uAntTrans; uniform float uMucus;
uniform vec4 uHaze; uniform vec2 uCat; uniform vec3 uCatTint; uniform float uSparkle;
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
// Pair adjacent Gaussian taps so each bilinear lookup evaluates up to four weights.
vec4 gaussian(vec2 uv, float sigma){
  float exponent = -0.5/(sigma*sigma);
  int radius = int(ceil(3.5*sigma));
  vec2 taps[15];
  taps[0] = vec2(0.0, 1.0);
  float sum = 1.0;
  int count = 1;
  for(int i=1; i<=radius; i+=2){
    float w1 = exp(exponent*float(i*i));
    float w2 = i < radius ? exp(exponent*float((i+1)*(i+1))) : 0.0;
    float weight = w1 + w2;
    float distance = float(i) + w2/weight;
    taps[count++] = vec2(distance, weight);
    taps[count++] = vec2(-distance, weight);
    sum += 2.0*weight;
  }
  vec4 color = vec4(0.0);
  for(int y=0; y<count; y++) for(int x=0; x<count; x++){
    vec2 offset = vec2(taps[x].x, taps[y].x)/uSize;
    color += taps[x].y*taps[y].y*textureLod(uPyr, uv + offset, 0.0);
  }
  return color/(sum*sum);
}
vec4 blurS(vec2 uv, float s){
  if(s < 0.4 || uLevels < 3.0) return textureLod(uPyr, uv, 0.0);
  if(s < 1.44) return gaussian(uv, s);
  float k0 = clamp(floor(log2(s/0.764)), 1.0, uLevels-2.0);
  float a = sk(k0), b = sk(k0+1.0);
  float t = clamp((s*s - a*a)/(b*b - a*a), 0.0, 1.0);
  return mix(bsp(uv, k0), bsp(uv, k0+1.0), t);
}
// Preserve the high-frequency MTF of the image-forming PSF for small kernels.
vec4 blurCore(vec2 uv, float s){
  if(s < 1.44 || s >= 4.0 || uLevels < 3.0) return blurS(uv, s);
  vec4 exact = gaussian(uv, s);
  if(s <= 3.25) return exact;
  return mix(exact, blurS(uv, s), smoothstep(3.25, 4.0, s));
}
float dogLight(vec3 color){
  return mix(dot(uRowL, color), max(0.0, dot(uRod, color)), uM);
}
void main(){
  float mask = uPanorama > 0.5 ? texture(uPanoMask, vUv).a : 1.0;
  if(mask == 0.0){ o = vec4(0.0, 0.0, 0.0, 1.0); return; }
  if(uDepthOverlay > 0.5){
    o = vec4(vec3(texture(uDepthTex, vUv).r*mask), 1.0);
    return;
  }
  vec2 p = (vUv - 0.5)*2.0*uHalf;          // field position in degrees, +y up
  vec2 deg2uv = 1.0/(2.0*uHalf);
  float ppdLocal = uPPD;
  if(uRectilinear > 0.5){
    float tanHX = tan(radians(uHalf.x));
    float tanHY = tanHX*uSize.y/uSize.x;
    vec2 tangent = (vUv*2.0 - 1.0)*vec2(tanHX, tanHY);
    p = degrees(atan(tangent));
    vec2 slope = 1.0 + tangent*tangent;
    deg2uv = radians(slope)/(2.0*vec2(tanHX, tanHY));
    ppdLocal = radians(uSize.x/(2.0*tanHX))*(slope.x + slope.y)*0.5;
  }
  float r = length(p);

  // ---- Stage 8 topography: visual streak vs area centralis sets how blur grows with eccentricity
  float g = exp(-0.5*(p.x*p.x/(uTopo.x*uTopo.x) + p.y*p.y/(uTopo.y*uTopo.y)));
  float sA = uAcu*(1.0 + uPeri*(1.0 - g));

  // ---- Stages 3, 5, 6: all optical blur combined in quadrature
  float variance = sA*sA + uBlurG*uBlurG;
  if(uHasDepth > 0.5){
    float invDistPx = mix(uDepthInvFar, uDepthInvNear, texture(uDepthTex, vUv).r);
    float demand = invDistPx + uRefr;
    float acc = clamp(uFocusInvDist + uRefr, 0.0, uAmax);
    float errD = abs(demand - acc);
    float defocusDeg = 0.25 * (uPupilMm / 1000.0) * errD * 57.2958;
    variance += defocusDeg*defocusDeg;
  }
  float sig = sqrt(variance)*uDev;
  float spx = sig*ppdLocal;
  vec3 c = blurCore(vUv, spx).rgb;

  // ---- Stage 4/5: ghost image (lens subluxation, iris holes)
  if(uGhost.x > 0.0){
    vec2 off = vec2(uGhost.y*uTS, uGhost.z)*deg2uv;
    c = mix(c, blurS(vUv + off, max(spx, uGhost.w*ppdLocal)).rgb, uGhost.x);
  }
  vec3 mean = textureLod(uPyr, vec2(0.5), uLevels - 1.0).rgb;
  vec3 lm = blurS(vUv, max(uLocalDeg*ppdLocal, spx*2.0)).rgb;

  c *= uAntTrans;
  float hazeLight = 0.5*dot(mean + lm, Y709);
  lm *= uAntTrans;

  // Peli local contrast uses each band's lower-frequency luminance as its reference.
  if(uCsf > 0.0){
    const float thresholds[5] = float[5](2.1, 1.2, 1.0, 1.25, 2.0);
    vec3 high = c;
    vec3 detail = vec3(0.0);
    for(int k=0; k<5; k++){
      float bandSigma = (0.389/8.0)*exp2(float(k))*ppdLocal;
      vec3 low = blurS(vUv, length(vec2(spx, bandSigma))).rgb*uAntTrans;
      float lowLight = dogLight(low);
      float contrast = (dogLight(high) - lowLight)/(max(0.0, lowLight) + 0.02);
      float t = uCsf*thresholds[k];
      float d2 = contrast*contrast;
      detail += (high - low)*d2/(d2 + t*t);
      high = low;
    }
    // Apply the retinal response to the arriving light without spreading it into dark pixels.
    float light = dogLight(c);
    if(light > 0.0) c *= clamp(dogLight(high + detail)/light, 0.0, 2.0);
  }

  // Mucus on the cornea is in the pupil plane: it smears the whole image (detail toward local mean), not patches of it
  if(uMucus > 0.0) c = mix(c, lm*1.02, uMucus*0.6);

  // ---- Lens and anterior haze spread light across the pupil.
  float hc = uCat.x, hg = uHaze.a;
  float ht = min(0.95, hg + hc - hg*hc);
  vec3 hcol = hazeLight*mix(uHaze.rgb, uCatTint, hc/(hc + hg + 1e-4))*uAntTrans;
  c = lm + (c - lm)*uContrast*(1.0 - uCat.y);
  c = mix(c, hcol, ht);

  // ---- Stage 10 glare: veiling glare (1/theta^2-like tail from coarse levels), bloom and halos
  if(uVeil > 0.0){
    vec3 v = vec3(0.0); float ws = 0.0;
    float last = uLevels - 1.0;
    float first = min(2.0, last);
    // Fractional weight on the inner octave keeps glare continuous while FOV changes.
    float start = clamp(log2(max(0.25*ppdLocal, 1.0)/0.764), first, max(first, last - 1.0));
    int kStart = int(floor(start));
    for(int k=kStart; k<13; k++){ float fk = float(k); if(fk > uLevels - 1.0) break;
      float w = k == kStart ? 1.0 - fract(start) : 1.0;
      vec4 t = textureLod(uPyr, vUv, fk);
      vec3 radiance = uMeasuredHDR > 0.5 && uLinear > 0.5 ? t.rgb : t.rgb*(1.0 + t.a*uAS);
      v += w*radiance; ws += w; }
    // equal weight per octave reproduces the s/theta^2 glare spread; mixing conserves energy
    c = mix(c, uAntTrans*v/max(ws, 1e-4), uVeil);
  }
  if(uBloom > 0.0){
    float bp = uBloomDeg*ppdLocal;
    vec4 b1 = blurS(vUv, bp), b2 = blurS(vUv, bp*0.3);
    vec3 c1 = b1.rgb/(max(max(b1.r,b1.g),b1.b) + 1e-3), c2 = b2.rgb/(max(max(b2.r,b2.g),b2.b) + 1e-3);
    c += uAntTrans*uBloom*(0.55*b1.a*c1 + 0.45*b2.a*c2)*uAS*0.5;
  }
  if(uHalo.x > 0.0){
    vec2 R = uHalo.y*deg2uv;
    float lv = clamp(floor(log2(max(uHalo.z*ppdLocal, 1.0)/0.764)), 0.0, max(0.0, uLevels - 2.0));
    vec3 h = vec3(0.0);
    for(int i=0; i<20; i++){
      float a = 6.2831853*float(i)/20.0; vec2 d = vec2(cos(a), sin(a))*R;
      h.r += textureLod(uPyr, vUv + d*(1.0 + 0.07*uHalo.w), lv).a;
      h.g += textureLod(uPyr, vUv + d, lv).a;
      h.b += textureLod(uPyr, vUv + d*(1.0 - 0.07*uHalo.w), lv).a;
    }
    c += uAntTrans*uHalo.x*uAS*h/20.0*0.9;
  }
  if(uSparkle > 0.0){
    vec2 cell = floor(vUv*uSize/3.0); float hs = hash(cell);
    if(hs < uSparkle*0.006) c += vec3(0.9, 0.95, 1.0)*(0.5 + 0.5*sin(uTime*6.0 + hs*4000.0))*0.8*max(0.0, dot(c, Y709));
  }
  c *= uTint;

  // ---- Vitreous scatter and shadows precede retinal loss
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
        if(uPart.y < 0.5){ float rr = 0.05 + 0.04*h; c += vec3((1.0 - smoothstep(rr*0.3, rr, d))*0.4*max(0.0, dot(c, Y709))*(0.6 + 0.4*sin(uTime*3.0 + h*50.0))); }
        else { float rr = 0.16 + 0.15*h; c *= 1.0 - 0.35*(1.0 - smoothstep(rr*0.3, rr, d)); }
      }
    }
  }
  // ---- Stage 7: dichromat colour (photopic) mixed toward rod luminance (scotopic)
  float rod = max(0.0, dot(uRod, c));
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
  vec3 res = textureLod(uPyr, vUv, max(uLevels - 4.0, 0.0)).rgb*uAntTrans;
  float resL = mix(dot(uRowL, res), max(0.0, dot(uRod, res)), uM);
  c = mix(vec3(resL*uResid), c, vis);
  c = mix(c, vec3(dot(c, Y709)), uDesat);

  // ---- Stage 2: lids, third eyelid; Stage 1: muzzle silhouette. All far out of focus, so very soft.
  if(uLid.x > 0.0 || uLid.y > 0.0 || uLid.w > 0.0){
    float top = uLid.x + uLid.w*0.6, bot = uLid.y + uLid.w*0.55;
    float curve = 1.15 - 0.3*pow(min(1.0, abs(p.x)/60.0), 2.0);
    float yT = 48.0 - 96.0*top*curve, yB = -48.0 + 96.0*bot*curve;
    // The lid edge is close to the pupil, producing a soft shadow.
    float mT = top > 0.0 ? smoothstep(yT - 12.0, yT + 12.0, p.y) : 0.0;
    float mB = bot > 0.0 ? 1.0 - smoothstep(yB - 12.0, yB + 12.0, p.y) : 0.0;
    c = mix(c, c*vec3(0.1, 0.085, 0.08), max(mT, mB));
  }
  if(uThird > 0.0){
    vec2 q = vec2(p.x*uTS + uZone.x, p.y + 35.0);
    float cov = 1.0 - smoothstep(uThird - 10.0, uThird + 10.0, length(q));
    c = mix(c, c*uThirdTint*0.55, cov*0.9);
  }
  if(uNose.y > 0.0){
    vec2 q = (p - vec2(0.0, -42.0))/vec2(uNose.x, uNose.x*0.8);
    c = mix(c, c*0.08, (1.0 - smoothstep(0.7, 1.2, length(q)))*0.92);
  }

  // ---- Stage 10: tapetal lower-field boost, adaptation gain, luminance-dependent noise
  float lower = smoothstep(0.0, 1.0, -p.y/max(uHalf.y, 1.0));
  c *= 1.0 + uLower*lower;
  c *= uGain;
  if(uNoise > 0.0){
    float cellDeg = mix(0.12, 0.28, 1.0 - g);
    vec2 nc = floor(p/cellDeg);
    float n = hash(nc + fract(uTime*3.7)*vec2(131.0, 71.0)) + hash(nc*1.7 + fract(uTime*5.3)*vec2(17.0, 253.0)) - 1.0;
    c += vec3(n*uNoise*sqrt(max(0.0, dot(c, Y709)))*1.6);
  }
  // ---- Overlays
  if(uOverlay > 0.5 && uOverlay < 1.5){
    float lc = log2(0.389/max(sig, 1e-4));
    vec3 ramp = mix(vec3(0.02, 0.05, 0.85), vec3(1.0, 0.6, 0.0), clamp((lc - 1.0)/3.0, 0.0, 1.0));
    float ln = 1.0 - smoothstep(0.0, fwidth(lc)*1.5, abs(fract(lc + 0.5) - 0.5));
    c = mix(vec3(dot(c, Y709)), ramp, 0.72); c = mix(c, vec3(1.0), ln*0.8);
  } else if(uOverlay > 1.5 && uOverlay < 2.5){
    float bx = abs(p.x) - uZone.x;
    float line = 1.0 - smoothstep(0.0, fwidth(p.x)*1.5, abs(bx));
    c = mix(c, vec3(0.9, 0.62, 0.03), line*step(0.5, fract(p.y*0.3))*0.95);
    if(bx > 0.0) c *= 0.78;
    if(uTunnel.x < 179.0){ float lt = 1.0 - smoothstep(0.0, fwidth(r)*1.5, abs(r - uTunnel.x)); c = mix(c, vec3(0.2, 0.3, 1.0), lt); }
  }
  o = vec4(uLinear > 0.5 ? c*mask : encodeDog(c*mask), 1.0);
}`;

// The display accent never feeds back into either integration channel.
export const FS_TEMPORAL = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv;
layout(location=0) out vec4 outSustained;
layout(location=1) out vec4 outFast;
layout(location=2) out vec4 outDisplay;
uniform sampler2D uCur; uniform sampler2D uPrevSustained; uniform sampler2D uPrevFast;
uniform float uA; uniform float uAFast; uniform float uSal; uniform float uLinear;
${GLSL_COMMON}
vec3 readLinear(sampler2D image, vec2 uv){
  vec3 rgb = texture(image, uv).rgb;
  return uLinear > 0.5 ? rgb : srgb2lin(rgb);
}
vec4 storeColor(vec3 rgb){
  return vec4(uLinear > 0.5 ? rgb : lin2srgb(rgb), 1.0);
}
vec3 transientAt(vec2 uv, vec3 cur){
  return mix(readLinear(uPrevFast, uv), cur, uAFast)
       - mix(readLinear(uPrevSustained, uv), cur, uA);
}
void main(){
  vec3 cur = readLinear(uCur, vUv);
  if(uA >= 1.0 && uAFast >= 1.0){
    outSustained = outFast = outDisplay = storeColor(cur);
    return;
  }
  vec3 sustained = mix(readLinear(uPrevSustained, vUv), cur, uA);
  vec3 fast = mix(readLinear(uPrevFast, vUv), cur, uAFast);
  vec3 result = sustained;
  if(uSal > 0.0){
    vec2 stepUV = 3.0/vec2(textureSize(uCur, 0));
    vec2 dx = vec2(stepUV.x, 0.0), dy = vec2(0.0, stepUV.y);
    vec2 neighbors[4] = vec2[4](vUv + dx, vUv - dx, vUv + dy, vUv - dy);
    vec3 localTransMean = vec3(0.0);
    float localContrast = 0.0;
    for(int i = 0; i < 4; i++){
      vec3 neighbor = readLinear(uCur, neighbors[i]);
      localContrast = max(localContrast, length(cur - neighbor));
      localTransMean += transientAt(neighbors[i], neighbor)*0.25;
    }
    vec3 trans = fast - sustained;
    float motionSignal = length(trans - localTransMean);
    float per = 0.4 + 0.6*smoothstep(0.1, 0.5, length(vUv - 0.5));
    result += uSal*per*smoothstep(0.01, 0.08, motionSignal)
              *smoothstep(0.001, 0.02, localContrast)*trans;
  }
  outSustained = storeColor(sustained);
  outFast = storeColor(fast);
  outDisplay = storeColor(result);
}`;

// Two eyes -> one view. Image left is the dog's left. Each monocular crescent shows only its own eye;
// in the binocular zone the clearer eye dominates and the cloudier eye still adds some veil.
export const FS_BLEND = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uL; uniform sampler2D uR; uniform float uHalfX; uniform float uRectilinear; uniform float uBino; uniform float uWR; uniform float uLinear;
${GLSL_COMMON}
void main(){
  float az = uRectilinear > 0.5
    ? degrees(atan((vUv.x*2.0 - 1.0)*tan(radians(uHalfX))))
    : (vUv.x - 0.5)*2.0*uHalfX;
  float e = 3.0;                             // soft zone edge, degrees
  float inL = 1.0 - smoothstep(uBino - e, uBino + e, az);   // left eye covers up to +B/2
  float inR = smoothstep(-uBino - e, -uBino + e, az);       // right eye covers from -B/2
  float wR = inR*mix(1.0, uWR, inL);         // right only: 1, left only: 0, overlap: dominance
  vec3 l = texture(uL, vUv).rgb, r = texture(uR, vUv).rgb;
  if(uLinear < 0.5){ l = srgb2lin(l); r = srgb2lin(r); }
  vec3 result = mix(l, r, wR);
  o = vec4(uLinear > 0.5 ? result : lin2srgb(result), 1.0);
}`;

export const FS_DISPLAY = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uDogT; uniform sampler2D uSrcT;
uniform vec4 uRect; uniform float uZoom; uniform vec2 uCenter; uniform float uSplitX; uniform float uMode;
uniform vec3 uBg; uniform float uPanorama; uniform float uHG; uniform float uHD; uniform float uLinear; uniform float uInputP3;
${GLSL_COMMON}
void main(){
  vec2 fc = gl_FragCoord.xy;
  vec2 loc = (fc - uRect.xy)/uRect.zw;
  if(loc.x < 0.0 || loc.y < 0.0 || loc.x > 1.0 || loc.y > 1.0){ o = vec4(uBg, 1.0); return; }
  vec2 iuv = (loc - 0.5)/uZoom + uCenter;
  if(any(lessThan(iuv, vec2(0.0))) || any(greaterThan(iuv, vec2(1.0)))){ o = vec4(uBg, 1.0); return; }
  bool dog = uMode > 0.5 && uMode < 1.5 || (uMode < 0.5 && fc.x >= uSplitX);
  vec3 c;
  if(dog){ c = texture(uDogT, iuv).rgb; if(uLinear > 0.5) c = encodeDog(c); }
  else {
    vec4 src = texture(uSrcT, iuv);
    vec3 l = srgb2lin(src.rgb)*uHG*(uPanorama > 0.5 ? src.a : 1.0);
    if(uInputP3 > 0.5) l = p3ToSrgb(l);
    l = mix(l, vec3(dot(l, vec3(0.2126, 0.7152, 0.0722))), uHD);
    c = lin2srgb(l);
  }
  o = vec4(c, 1.0);
}`;

export const FS_SRGB = `#version 300 es
precision highp float; precision highp sampler2D; in vec2 vUv; out vec4 o;
uniform sampler2D uDogT;
${GLSL_COMMON}
void main(){ o = vec4(encodeDog(texture(uDogT, vUv).rgb), 1.0); }`;
