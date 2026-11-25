"""Compress the real office's base-color textures without changing geometry."""
import json, struct, subprocess, sys, tempfile, io
from pathlib import Path
from PIL import Image
src,dst=map(Path,sys.argv[1:3])
raw=src.read_bytes()
assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
n,tag=struct.unpack_from('<I4s',raw,12);assert tag==b'JSON'
doc=json.loads(raw[20:20+n])
bl,tag=struct.unpack_from('<I4s',raw,20+n);assert tag==b'BIN\x00'
binary=raw[28+n:28+n+bl]
assert len(doc['buffers'])==1
# Current source contains only base color maps; refuse to silently treat linear maps as sRGB.
color={m['pbrMetallicRoughness']['baseColorTexture']['index'] for m in doc['materials'] if 'baseColorTexture' in m.get('pbrMetallicRoughness',{})}
assert color==set(range(len(doc['textures'])))
assert all(not any(k in m for k in ('normalTexture','occlusionTexture','emissiveTexture')) and 'metallicRoughnessTexture' not in m.get('pbrMetallicRoughness',{}) for m in doc['materials'])
assert all('source' in t and not t.get('extensions') for t in doc['textures'])
assert {t['source'] for t in doc['textures']}==set(range(len(doc['images'])))
replacement={};records=[]
with tempfile.TemporaryDirectory() as td:
    folder=Path(td)
    for i,img in enumerate(doc['images']):
        vi=img['bufferView'];bv=doc['bufferViews'][vi]
        assert vi not in replacement
        start=bv.get('byteOffset',0);data=binary[start:start+bv['byteLength']]
        source=folder/f'{i}.png';target=folder/f'{i}.ktx2'
        im=Image.open(io.BytesIO(data)).convert('RGBA')
        assert im.width%4==0 and im.height%4==0
        im.save(source)
        subprocess.run(['toktx','--t2','--uastc','2','--zcmp','18','--genmipmap','--assign_oetf','srgb','--assign_primaries','bt709',str(target),str(source)],check=True,timeout=180)
        subprocess.run(['ktx','validate','--gltf-basisu',str(target)],check=True,timeout=60)
        data2=target.read_bytes()
        assert data2.startswith(b'\xabKTX 20\xbb\r\n\x1a\n')
        replacement[vi]=data2
        records.append({'image':i,'size':[im.width,im.height],'original_bytes':len(data),'ktx2_bytes':len(data2)})
        img['mimeType']='image/ktx2'
for texture in doc['textures']:
    texture['extensions']={'KHR_texture_basisu':{'source':texture.pop('source')}}
for k in ('extensionsUsed','extensionsRequired'):
    if 'KHR_texture_basisu' not in doc.setdefault(k,[]):doc[k].append('KHR_texture_basisu')
new=bytearray()
for i,bv in enumerate(doc['bufferViews']):
    assert bv['buffer']==0
    start=bv.get('byteOffset',0);old=binary[start:start+bv['byteLength']]
    payload=replacement.get(i,old)
    new.extend(b'\0'*((-len(new))%4));bv['byteOffset']=len(new);bv['byteLength']=len(payload);new.extend(payload)
new.extend(b'\0'*((-len(new))%4))
doc['buffers'][0]['byteLength']=len(new)
meta=json.dumps(doc,separators=(',',':'),ensure_ascii=True).encode()
meta+=b' '*((-len(meta))%4)
dst.write_bytes(struct.pack('<4sII',b'glTF',2,12+8+len(meta)+8+len(new))+struct.pack('<I4s',len(meta),b'JSON')+meta+struct.pack('<I4s',len(new),b'BIN\x00')+new)
report={'input_bytes':len(raw),'output_bytes':dst.stat().st_size,'images':records,'texture_format':'UASTC KTX2','geometry_unchanged':True}
dst.with_suffix('.report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report))
