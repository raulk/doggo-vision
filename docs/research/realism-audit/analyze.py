import numpy as np, json, sys
from PIL import Image
D=sys.argv[1] if len(sys.argv)>1 else 'probe'
def lin(a):
    a=a/255.0; return np.where(a<=0.04045,a/12.92,((a+0.055)/1.055)**2.4)
def load(n): return lin(np.asarray(Image.open(f'{D}/{n}.png').convert('RGB')).astype(float)).mean(2)
F=[1,2,3,4,6,8,12,16]
print('MTF (output modulation / input 0.5) per cpd, central 8 deg, 60 px/deg')
src=load('grat-src'); 
def mod(img):
    res=[]
    for k,f in enumerate(F):
        r0=int(k*900/len(F)+25); r1=int((k+1)*900/len(F)-25)
        row=img[r0:r1, 600-240:600+240].mean(0)
        x=np.arange(-240,240); s=np.sin(2*np.pi*f*x/60); c=np.cos(2*np.pi*f*x/60)
        m=row.mean(); a=2*np.hypot((row*s).mean(),(row*c).mean())
        res.append(a/m/0.5 if m>0 else 0)
    return np.array(res)
ms=mod(src); print('src  ', np.round(ms,2))
out={}
for p in ['lab','kcs15b','kcs15','kcs15both']:
    for t in ['fresh','dry']:
        m=mod(load(f'grat-{p}-{t}'))/ms
        # cutoff: freq where MTF falls to 0.1 (log interp)
        cut=None
        for i in range(len(F)-1):
            if m[i]>=0.1>m[i+1]:
                cut=np.exp(np.interp(0.1,[m[i+1],m[i]],[np.log(F[i+1]),np.log(F[i])])); break
        print(f'{p:10s}{t:6s}', np.round(m,2), 'cutoff@0.1 ~', None if cut is None else round(float(cut),1),'cpd')
print()
print('PSF/veil: luminance relative to source peak region, at radii (deg); 24 px/deg')
def prof(img):
    yy,xx=np.mgrid[0:900,0:1200]; r=np.hypot(xx-600,yy-450)/24.0
    core=img[r<0.2].mean(); vals=[]
    for R in [0.5,1,2,4,8,16]:
        sel=(r>R*0.9)&(r<R*1.1); vals.append(img[sel].mean())
    return core, np.array(vals), img[(r>20)].mean()
for p in ['src','lab','kcs15b','kcs15','kcs15both']:
    for t in (['fresh'] if p=='src' else ['fresh','dry']):
        n='psf-src' if p=='src' else f'psf-{p}-{t}'
        core,v,far=prof(load(n))
        print(f'{p:10s}{t:6s} core {core:.3f}  ring(0.5,1,2,4,8,16 deg) ', ' '.join(f'{x:.4f}' for x in v), f' far {far:.4f}')
