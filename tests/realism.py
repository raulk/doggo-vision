"""Optical regression checks for the rendered presets and the linear float controls.

Run: node tests/probe.js tests/out && python3 tests/realism.py tests/out
"""
import json
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
    fresh = cutoff(modulation(load(f'grat-{p}-fresh'))/src)
    dry = cutoff(modulation(load(f'grat-{p}-dry'))/src)
    ok = lo <= fresh <= hi
    # The clearer eye's 6 s break-up time is beyond the 5.8 s probe.
    if p == 'lab':
        phase_ok = abs(dry - fresh) < 0.01
    elif p == 'kcs15b':
        phase_ok = abs(dry - fresh) < 0.05
    else:
        phase_ok = dry < fresh - 0.05
    print(f'  {p:10s} fresh {fresh:5.2f} / dry {dry:5.2f} cpd  fresh target {lo}-{hi}  {"ok" if ok and phase_ok else "FAIL"}')
    if not ok: fails.append(f'acuity {p}')
    if not phase_ok: fails.append(f'dry phase {p}')

print('Glare spread (0.5 deg light)')
res = {}
for p in ['lab', 'kcs15b', 'kcs15', 'kcs15both']:
    core, rg = rings(load(f'psf-{p}-fresh')); res[p] = (core, rg)
    slope = np.log(rg[4]/rg[1])/np.log(4) if rg[1] > 0 and rg[4] > 0 else float('nan')
    tail = f'{slope:+.2f}' if np.isfinite(slope) else 'below PNG precision'
    print(f'  {p:10s} core {core:.2f}  ring 1/2/4 deg {rg[1]:.4f} {rg[2]:.4f} {rg[4]:.4f}  slope {tail}')
    if p != 'lab':
        if not (-2.6 <= slope <= -1.3): fails.append(f'glare slope {p}')
        if core < 0.2: fails.append(f'glare core {p}')
# The far tail is below 8-bit precision in a screenshot, so check the scattered fraction from the model itself
info = {d['id']: d for d in json.load(open(f'{D}/info.json'))}
ETA = {'lab': (0.03, 0.12), 'kcs15b': (0.18, 0.30), 'kcs15': (0.35, 0.50)}
for p, (lo, hi) in ETA.items():
    e = info[p]['U']['veil']; ok = lo <= e <= hi
    print(f'  {p:10s} straylight eta {e:.2f}  target {lo}-{hi}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'straylight {p}')
if not res['kcs15'][0] < res['kcs15b'][0] < res['lab'][0]: fails.append('core ordering')

def float_data(name):
    with open(f'{D}/{name}-float.json') as stream:
        return json.load(stream)

def crossing(samples, target):
    for (f0, m0), (f1, m1) in zip(samples, samples[1:]):
        if m0 >= target > m1 > 0:
            return np.sqrt(np.interp(np.log(target), np.log([m1, m0]), [f1*f1, f0*f0]))
    return np.nan

print('Gaussian control (linear float MTF)')
crossings = []
for run in float_data('gaussian'):
    sigma = run['sigma']
    values = [crossing(run['mtf'], level) for level in (0.05, 0.1)]
    expected = [np.sqrt(-np.log(level)/(2*np.pi**2))/sigma for level in (0.05, 0.1)]
    crossings.append(values)
    ok = np.allclose(values, expected, rtol=0.02)
    print(f'  {run["hfov"]:2d}°  5% {values[0]:.3f} / {expected[0]:.3f} cpd  '
          f'10% {values[1]:.3f} / {expected[1]:.3f} cpd  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'Gaussian MTF at {run["hfov"]}°')
delta = np.abs(np.asarray(crossings[0]) - crossings[1])
print(f'  FOV differences: {delta[0]:.3f} cpd at 5%, {delta[1]:.3f} cpd at 10%')
if not np.all(delta <= 0.12): fails.append('Gaussian FOV invariance')

print('Float PSF (0.5° disc, 1°–8° tail)')
psfs = float_data('psf')
for p, result in psfs.items():
    radial = result['radial']
    enc = [next(row['enclosed'] for row in radial if row['radius'] > r - 0.1) for r in (1, 2, 4, 8)]
    rings = [np.mean([row['mean'] for row in radial if 0.9*r < row['radius'] < 1.1*r])
             for r in (1, 2, 4, 8)]
    slope = np.polyfit(np.log([1, 2, 4, 8]), np.log(rings), 1)[0]
    energy = result['total'] / result['input']
    core = result['coreFraction']
    ok = -2.6 <= slope <= -1.3 and 0.65 <= energy <= 1.15 and 0.2 <= core < enc[0]
    print(f'  {p:10s} total/input {energy:.3f}  core {core:.3f}  '
          f'encircled 1°/2°/4°/8° {" ".join(f"{x:.3f}" for x in enc)}  '
          f'slope {slope:+.2f}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'float PSF {p}')
if not psfs['kcs15']['coreFraction'] < psfs['kcs15b']['coreFraction'] < psfs['lab']['coreFraction']:
    fails.append('float core ordering')

data = float_data('radiance')
black = data['black']
print('Peak linear luminance (hypermature cataract and asteroid hyalosis)')
for key, value in black.items():
    print(f'  {key}: {value:.6g}')
    if (key == 'sightedWhite' and not value > 0.1) or (key != 'sightedWhite' and value != 0):
        fails.append(f'zero-light control {key}')

radiance = data['radiance']
base_hdr = float(lin(170))
base_sdr = float(lin(204))
expected = {
    'hdrBase': [base_hdr, base_hdr, base_hdr, base_hdr/2],
    'sdrBase': [2*base_sdr, 2*base_sdr, 2*base_sdr, base_sdr],
    'afterGlare': [2*base_sdr, 2*base_sdr, 2*base_sdr, 1],
    'attenuated': [2*base_sdr*(1 - 0.3*0.35)]*3 + [1],
    'p3Red': [1.2249401, -0.0420569, -0.0196376],
    'p3White': [1.0, 1.0, 1.0],
}
print('Source radiance and glare (linear float)')
for key, target in expected.items():
    result = radiance[key][:len(target)]
    ok = np.allclose(result, target, atol=0.002, rtol=0)
    print(f'  {key}: {" ".join(f"{x:.4f}" for x in result)}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'radiance {key}')

projection = data['projection']
print('Binocular projection (120° FOV, OS fully blind)')
for key, result in projection.items():
    ok = abs(result['center'] - 0.75) < 0.001 and abs(result['edge'] - (0.75 if key == 'equiangular' else 0)) < 0.001
    print(f'  {key:11s} centre {result["center"]:.3f}  left edge of overlap {result["edge"]:.3f}  {"ok" if ok else "FAIL"}')
    if not ok: fails.append(f'projection {key}')

batch3 = float_data('batch3')
depth = batch3['depth']
print('Per-pixel depth modulation (near / far)')
for name, values in depth.items():
    print(f'  {name}: {values["near"]:.4f} / {values["far"]:.4f}')
if not (depth['far']['far'] >= 0.95 * depth['disabled']['far']
        and depth['far']['near'] < 0.65 * depth['far']['far']
        and depth['near']['far'] < 0.65 * depth['near']['near']
        and depth['near']['near'] > 1.5 * depth['far']['near']):
    fails.append('per-pixel focus reverses grating sharpness')

pano = batch3['panorama']
print(f'Park field: {pano["pug"]} vs {pano["greyhound"]}')
print(f'  Senior 15 crescent contrast: {pano["leftContrast"]:.4f} left, {pano["rightContrast"]:.4f} right')
if not (pano['pug']['field'] == 200 and pano['greyhound']['field'] == 270
        and all(pano['pug'][side] == 0 < pano['greyhound'][side] for side in ('left', 'right'))):
    fails.append('panorama field coverage at ±115°')
if not 0 < pano['leftContrast'] < 0.85 * pano['rightContrast']:
    fails.append('panorama monocular contrast')

temporal = batch3['temporal']
print(f'Temporal and adaptation: {temporal}')
if not (temporal['uniform'] == temporal['outside'] == 0 and temporal['motion'] > 0.002):
    fails.append('spatially localized temporal accent')
if not (0 < temporal['darkStart'] < 0.25 * temporal['darkLater']
        and 0.75 * temporal['darkSteady'] <= temporal['darkLater'] <= 1.03 * temporal['darkSteady']):
    fails.append('dark adaptation brightens over time')

print('FAILED: ' + ', '.join(fails) if fails else 'All realism checks passed.')
sys.exit(1 if fails else 0)
