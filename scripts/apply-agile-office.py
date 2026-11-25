"""Replace only the authenticated workspace, preserving auth/intro/updater."""
from pathlib import Path
import base64, json, shutil, struct, subprocess, sys, tempfile
root=Path(__file__).resolve().parents[1]
app=root/'app'
assets=root/'assets'/'agile-office'
with tempfile.TemporaryDirectory(prefix='agentoffice-model-') as tmp:
    work=Path(tmp)
    for name in ('build_scene.py','export_glb.py'):
        shutil.copyfile(assets/name,work/name)
        subprocess.run([sys.executable,str(work/name)],check=True,cwd=work,timeout=180)
    scene=json.loads((work/'scene.json').read_text(encoding='utf-8'))
    assert len(scene['roles'])==7 and len(scene['stations'])==7
    assert len(scene['lights'])==29 and len(scene['cameras'])==3
    raw=(work/'office.glb').read_bytes()
    assert struct.unpack_from('<4sII',raw)==(b'glTF',2,len(raw))
    n,tag=struct.unpack_from('<I4s',raw,12)
    assert tag==b'JSON'
    doc=json.loads(raw[20:20+n])
    names=[node.get('name','') for node in doc['nodes']]
    assert all(any(name.startswith(role+' ') for name in names) for role in scene['roles'])
    assert len(doc.get('images',[]))>=14
    target=app/'public'/'office'
    target.mkdir(parents=True,exist_ok=True)
    (target/'office.glb').write_bytes(raw)
    for i in range(3):
        image=base64.b64decode((assets/f'view-{i}.webp.b64').read_text().strip(),validate=True)
        assert image.startswith(b'RIFF') and image[8:12]==b'WEBP'
        (target/f'view-{i}.webp').write_bytes(image)
    (app/'src'/'agile-layout.json').write_text(json.dumps({k:scene[k] for k in ('lights','cameras','roles','stations')}),encoding='utf-8')
for src,dest in [('main.js','main.js'),('agile-renderer.js','agile-renderer.js'),('agile-office.css','agile-office.css'),('office-performance.mjs','office-performance.mjs'),('office-batching.mjs','office-batching.mjs')]:
    shutil.copyfile(assets/src,app/'src'/dest)
shutil.copyfile(assets/'office-performance.test.mjs',app/'scripts'/'office-performance.test.mjs')
# Keep original authentication fixture coverage; assert the new destination.
path=app/'scripts'/'auth-smoke.cjs'
text=path.read_text(encoding='utf-8')
old='    assert.equal(await read(\'Boolean(document.querySelector("#agentoffice-loading-intro"))\'),false,\'intro must be removed\');'
assert text.count(old)==1,'workspace smoke anchor mismatch'
new=old+'''
    assert.equal(await read('Boolean(document.querySelector("#agile-office"))'),true,'new office opens after intro');
    assert.equal(await read('Boolean(document.querySelector(".dashboard-grid, .rail, #content"))'),false,'legacy dashboard removed');
    await until('document.querySelector("#office-poster")?.complete && document.querySelector("#office-poster")?.naturalWidth > 0','packaged office render available');
    await read('document.querySelector("#office-meeting").click()');
    assert.equal(await read('document.querySelector("#office-title").textContent'),'Meeting Room');
    await read('document.querySelector("#office-workspace").click()');
    assert.equal(await read('document.querySelector("#office-title").textContent'),'Agile Workspace');
'''
text=text.replace(old,new,1)
assert text.count('.rail-person strong')==3
text=text.replace('.rail-person strong','#office-user')
path.write_text(text,encoding='utf-8')
print('Two-room agile office installed; old workspace data retained, auth and intro untouched.')
