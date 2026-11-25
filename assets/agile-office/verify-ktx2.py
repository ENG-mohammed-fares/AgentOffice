"""Check the actual artifact, not merely the filename or encoder exit status."""
import json,struct,sys
from pathlib import Path
p=Path(__file__).resolve().parents[2]/'app'/'public'/'office'
if len(sys.argv)!=2 or Path(sys.argv[1]).resolve()!=p.resolve():
    raise ValueError('Expected the prepared application office asset directory')
def read(path):
    data=path.read_bytes()
    assert struct.unpack_from('<4sII',data)==(b'glTF',2,len(data))
    size,kind=struct.unpack_from('<I4s',data,12);assert kind==b'JSON'
    return json.loads(data[20:20+size]),data[28+size:]
a,_=read(p/'office.glb');b,bin_data=read(p/'office-ktx2.glb')
assert 'KHR_texture_basisu' in b['extensionsRequired']
assert len(a['images'])==len(b['images'])==14
assert [x.get('name') for x in a['nodes']]==[x.get('name') for x in b['nodes']]
def geometry(d):
    return [[(q.get('mode',4),q['material'],d['accessors'][q['attributes']['POSITION']]['count'],d['accessors'][q['indices']]['count'] if 'indices' in q else None,sorted(q['attributes'])) for q in m['primitives']] for m in d['meshes']]
assert geometry(a)==geometry(b)
for im in b['images']:
    v=b['bufferViews'][im['bufferView']]
    assert im['mimeType']=='image/ktx2' and bin_data[v.get('byteOffset',0):][:12]==b'\xabKTX 20\xbb\r\n\x1a\n'
for t in b['textures']:assert 'KHR_texture_basisu' in t['extensions']
print('Verified compressed office: all 14 KTX2 maps and identical mesh topology; original fallback bundled.')

