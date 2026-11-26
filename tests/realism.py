"""Realism regression tests for the senior presets (from the realism audit, section 4).

Run:  node tests/probe.js tests/out && python3 tests/realism.py tests/out
1. Grating MTF: 50%-contrast sine gratings at 60 px/deg; the frequency where modulation
   falls to 0.1 is the preset's effective acuity. Each preset must land in its range.
2. Glare spread: a 0.5 deg light on black. Between 1 and 4 deg the veil must fall roughly
   as 1/theta^2 (CIE glare spread function) and the core must keep a sensible share of its
   energy. The scattered fraction (eta) of each eye must sit in its range.
"""
import sys
import numpy as np
from PIL import Image

D = sys.argv[1] if len(sys.argv) > 1 else 'tests/out'
F = [1, 2, 3, 4, 6, 8, 12, 16]
ACUITY = {'lab': (5.5, 9.0), 'kcs15b': (4.5, 6.0), 'kcs15': (3.0, 4.5), 'kcs15both': (4.0, 6.0)}

def lin(a):
    a = a/255.0
    return np.where(a <= 0.04045, a/12.92, ((a + 0.055)/1.055)**2.4)

def load(n):
    return lin(np.asarray(Image.open(f'{D}/{n}.png').convert('RGB')).astype(float)).mean(2)

def modulation(img):
    out = []
    for k, f in enumerate(F):
        r0 = int(k*900/len(F) + 25); r1 = int((k + 1)*900/len(F) - 25)
        row = img[r0:r1, 360:840].mean(0)
        x = np.arange(-240, 240); s = np.sin(2*np.pi*f*x/60); c = np.cos(2*np.pi*f*x/60)
        m = row.mean(); amp = 2*np.hypot((row*s).mean(), (row*c).mean())
        out.append(amp/m/0.5 if m > 0 else 0)
    return np.array(out)

def cutoff(m):
    for i in range(len(F) - 1):
        if m[i] >= 0.1 > m[i + 1]:
            return float(np.exp(np.interp(0.1, [m[i + 1], m[i]], [np.log(F[i + 1]), np.log(F[i])])))
    return F[-1] if m[-1] >= 0.1 else F[0]*m[0]/0.1

def rings(img):
    yy, xx = np.mgrid[0:900, 0:1200]; r = np.hypot(xx - 600, yy - 450)/24.0
    core = img[r < 0.2].mean()
    return core, {R: img[(r > R*0.9) & (r < R*1.1)].mean() for R in (1, 2, 4)}

fails = []
src = modulation(load('grat-src'))
print('Acuity (cutoff at modulation 0.1)')
for p, (lo, hi) in ACUITY.items():
    c = cutoff(modulation(load(f'grat-{p}-fresh'))/src)
    ok = lo <= c <= hi
    print(f'  {p:10s} {c:4.1f} cpd  target {lo}-{hi}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'acuity {p}')

print('Glare spread (0.5 deg light)')
res = {}
for p in ['lab', 'kcs15b', 'kcs15', 'kcs15both']:
    core, rg = rings(load(f'psf-{p}-fresh')); res[p] = (core, rg)
    slope = np.log(rg[4]/rg[1])/np.log(4) if rg[1] > 0 and rg[4] > 0 else float('nan')
    print(f'  {p:10s} core {core:.2f}  ring 1/2/4 deg {rg[1]:.4f} {rg[2]:.4f} {rg[4]:.4f}  slope {slope:+.2f}')
    if p != 'lab':
        if not (-2.6 <= slope <= -1.3): fails.append(f'glare slope {p}')
        if core < 0.2: fails.append(f'glare core {p}')
# The far tail is below 8-bit precision in a screenshot, so check the scattered fraction from the model itself
import json
info = {d['id']: d for d in json.load(open(f'{D}/info.json'))}
ETA = {'lab': (0.03, 0.12), 'kcs15b': (0.18, 0.30), 'kcs15': (0.35, 0.50)}
for p, (lo, hi) in ETA.items():
    e = info[p]['U']['veil']; ok = lo <= e <= hi
    print(f'  {p:10s} straylight eta {e:.2f}  target {lo}-{hi}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'straylight {p}')
if not res['kcs15'][0] < res['kcs15b'][0] < res['lab'][0]: fails.append('core ordering')

print('FAILED: ' + ', '.join(fails) if fails else 'All realism checks passed.')
sys.exit(1 if fails else 0)
