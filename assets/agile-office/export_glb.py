from pathlib import Path
import json,struct,base64
import numpy as np,trimesh
from PIL import Image
from scipy.ndimage import zoom,gaussian_filter
P=Path(__file__).parent;s=json.loads((P/'scene.json').read_text());rng=np.random.default_rng(29);N=1024
X,Y=np.meshgrid(np.arange(N)/N,np.arange(N)/N)
def fractal():
 a=np.zeros((N,N),np.float32)
 for scale,amp in [(4,.38),(12,.26),(32,.19),(96,.11),(256,.06)]:
  v=rng.random((scale+1,scale+1));v[-1]=v[0];v[:,-1]=v[:,0];a+=zoom(v,(N/(scale+1),N/(scale+1)),order=1)[:N,:N]*amp
 return a
f=fractal();f2=fractal();noise=rng.random((N,N));materials=[]
for name,c,rough,metal,mode,emit in s['materials']:
 base=np.array(c);rgb=np.tile(base,(N,N,1));k=np.ones((N,N))
 if mode==1:
  g=gaussian_filter(rng.random((N,N)),(1,22),mode='wrap');g=(g-g.min())/(g.max()-g.min());wave=np.sin(2*np.pi*(Y*67+2.3*f+.17*np.sin(X*2*np.pi)));k=.54+.48*g+.22*f+.13*wave+.05*noise
 if mode==2:k=.74+.35*f+.18*f2+.12*noise
 if mode==3:
  veins=np.exp(-abs(np.sin((X*3+Y*5+f*3)*np.pi))*19);thin=np.exp(-abs(np.sin((X*13-Y*9+f2*4)*np.pi))*36);rgb=rgb*(.32+1.22*f[:,:,None])+np.array([.60,.68,.60])*(veins[:,:,None]*.67+thin[:,:,None]*.18);k=.92+.17*noise
 if mode==4:k=.64+.39*f+.18*noise+.13*np.sin(X*2*np.pi*154)*np.sin(Y*2*np.pi*154)
 if mode==10:rgb=np.tile(np.array([.58,.24,.12]),(N,N,1))*(1-Y[:,:,None])+np.array([.105,.23,.46])*Y[:,:,None]
 image=Image.fromarray(np.uint8(np.clip(rgb*k[:,:,None],0,1)**(1/2.2)*255)) if mode in (1,2,3,4,10) else None
 col=[255,255,255,255] if image else [*np.uint8(np.clip(base,0,1)**(1/2.2)*255).tolist(),255]
 kw={}
 if mode==9:col=[230,242,255,28];kw=dict(alphaMode='BLEND',doubleSided=True)
 materials.append(trimesh.visual.material.PBRMaterial(name=name,baseColorFactor=col,baseColorTexture=image,metallicFactor=metal,roughnessFactor=rough,emissiveFactor=[min(1,float(x*max(1,emit))) for x in c] if emit else [0,0,0],**kw))
scene=trimesh.Scene();buffers=[];batches={}
# Batch minor parts by material and preserve individual main workstation nodes.
for i,(name,verts,faces,m) in enumerate(s['objects']):
 v=np.array(verts,float);f=np.array(faces,int);center=v.mean(axis=0);t=v[f];norm=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);flip=np.sum(norm*(t.mean(1)-center),axis=1)<0;f[flip]=f[flip][:,[0,2,1]];t=v[f];n=np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0]);valid=np.linalg.norm(n,axis=1)>1e-8;t=t[valid];n=n[valid];n=n/np.linalg.norm(n,axis=1,keepdims=True);n=np.repeat(n,3,axis=0);p=t.reshape(-1,3);axis=np.argmax(abs(n),axis=1);uv=np.zeros((len(p),2));mode=s['materials'][m][4]
 for a in range(3):
  inds=axis==a;u,w=[(2,1),(2,0),(0,1)][a] if mode==1 else [(1,2),(0,2),(0,1)][a];uv[inds,0]=p[inds,u]*.60;uv[inds,1]=p[inds,w]*.60
 if mode==10:uv[:,0]=(p[:,0]+75)/150;uv[:,1]=np.clip((p[:,2]+24)/70,0,1)
 group=name.split(' ',1)[0] if name.startswith('Chair_') else next((role for role in s['roles'] if name.startswith(role)),None)
 key=(m,group or ('Glass' if mode==9 else 'Environment'))
 # Y-up as required by glTF, (x,z,-y) keeps handedness.
 pos=p[:,[0,2,1]].copy();pos[:,2]*=-1;normal=n[:,[0,2,1]].copy();normal[:,2]*=-1
 batches.setdefault(key,[]).append((pos,normal,uv))
 if mode!=9:
  mat=s['materials'][m];buffers.append(np.concatenate([p,n,np.tile(mat[1],(len(p),1)),np.tile([mat[2],mat[3],mat[4],mat[5]],(len(p),1))],axis=1).astype('<f4'))
for (m,group),parts in batches.items():
 pos=np.concatenate([x[0] for x in parts]);normal=np.concatenate([x[1] for x in parts]);uv=np.concatenate([x[2] for x in parts]);obj=trimesh.Trimesh(vertices=pos,faces=np.arange(len(pos)).reshape(-1,3),vertex_normals=normal,process=False);obj.visual=trimesh.visual.TextureVisuals(uv=uv,material=materials[m]);key=f'{group} — {s["materials"][m][0]}';scene.add_geometry(obj,node_name=key,geom_name=key)
raw=scene.export(file_type='glb');(P/'office.glb').write_bytes(raw);check=trimesh.load(P/'office.glb',force='scene');assert len(check.geometry)==len(batches)
print('GLB reloaded:',len(check.geometry),'batches;',sum(len(x.faces) for x in check.geometry.values()),'triangles',flush=True)
