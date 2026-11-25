"""Replace only the authenticated workspace, preserving auth/intro/updater."""
from pathlib import Path
import base64, hashlib, json, shutil, struct, subprocess, sys, tempfile
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
    layout={k:scene[k] for k in ('lights','cameras','roles','stations')}
    character_source=assets/'characters'
    character_target=target/'characters'
    # Never accidentally ship stale assets left by a previous build.
    if character_target.exists():
        shutil.rmtree(character_target)
    if character_source.exists():
        expected=json.loads((assets/'character-roster.json').read_text(encoding='utf-8'))
        manifest=json.loads((character_source/'manifest.json').read_text(encoding='utf-8'))
        supplied={item['file']:item for item in manifest['characters']}
        assert len(supplied)==len(manifest['characters'])==len(expected)==7
        character_target.mkdir()
        layout['characters']=[]
        for item in expected:
            file=item['file']
            source=character_source/file
            data=source.read_bytes()
            assert hashlib.sha256(data).hexdigest()==item['sha256']==supplied[file]['sha256']
            assert struct.unpack_from('<4sII',data)==(b'glTF',2,len(data))
            size,tag=struct.unpack_from('<I4s',data,12)
            assert tag==b'JSON'
            model=json.loads(data[20:20+size])
            assert model.get('skins') and set(a['name'] for a in model['animations'])=={'Idle','Walk','Typing','Thinking','Review','Meeting','Talk','Error','Celebrate','Sitting'}
            (character_target/file).write_bytes(data)
            layout['characters'].append({k:item[k] for k in ('role','file','station')})
    (app/'src'/'agile-layout.json').write_text(json.dumps(layout),encoding='utf-8')
for src,dest in [('main.js','main.js'),('agile-renderer.js','agile-renderer.js'),('agile-office.css','agile-office.css'),('office-performance.mjs','office-performance.mjs'),('office-batching.mjs','office-batching.mjs'),('office-tasks.mjs','office-tasks.mjs'),('office-task-panel.mjs','office-task-panel.mjs'),('office-characters.mjs','office-characters.mjs'),('agent-animation.mjs','agent-animation.mjs')]:
    shutil.copyfile(assets/src,app/'src'/dest)
shutil.copyfile(assets/'office-performance.test.mjs',app/'scripts'/'office-performance.test.mjs')
shutil.copyfile(assets/'office-tasks.test.mjs',app/'scripts'/'office-tasks.test.mjs')
shutil.copyfile(assets/'office-task-panel.test.mjs',app/'scripts'/'office-task-panel.test.mjs')
# Keep original authentication fixture coverage; assert the new destination.
path=app/'scripts'/'auth-smoke.cjs'
text=path.read_text(encoding='utf-8')
old='    assert.equal(await read(\'Boolean(document.querySelector("#agentoffice-loading-intro"))\'),false,\'intro must be removed\');'
assert text.count(old)==1,'workspace smoke anchor mismatch'
new=old+'''
    assert.equal(await read('Boolean(document.querySelector("#agile-office"))'),true,'new office opens after intro');
    assert.equal(await read('Boolean(document.querySelector(".dashboard-grid, .rail, #content"))'),false,'legacy dashboard removed');
    await until('document.querySelector("#office-poster")?.complete && document.querySelector("#office-poster")?.naturalWidth > 0','packaged office render available');
    await read('document.querySelector("#office-diagnostics-toggle").click()');
    assert.equal(await read('document.querySelector("#office-diagnostics").hidden'),false);
    await read('document.querySelector("#office-metrics-refresh").click()');
    assert.ok(await read('document.querySelector("#office-metrics").textContent.length > 0'));
    await read('document.querySelector("#office-graphics").value="performance"; document.querySelector("#office-graphics").dispatchEvent(new Event("change"))');
    await read('document.querySelector("#office-graphics").value="balanced"; document.querySelector("#office-graphics").dispatchEvent(new Event("change")); document.querySelector("#office-diagnostics-toggle").click()');
    await read('document.querySelector("#office-meeting").click()');
    assert.equal(await read('document.querySelector("#office-title").textContent'),'Meeting Room');
    await read('document.querySelector("#office-workspace").click()');
    assert.equal(await read('document.querySelector("#office-title").textContent'),'Agile Workspace');
    await read('document.querySelector("#office-tasks-toggle").click()');
    assert.equal(await read('document.querySelector("#office-tasks").hidden'),false);
    await read('document.querySelector("#office-task-title").value="QA smoke task"; document.querySelector("#office-task-form").requestSubmit()');
    assert.equal(await read('document.querySelector("#office-task-list").textContent.includes("QA smoke task")'),true);
    await read('document.querySelector("#office-demo-toggle").click()');
    assert.equal(await read('document.querySelector("#office-demo-toggle").getAttribute("aria-pressed")'),'true');
    await read('document.querySelector("#office-demo-toggle").click();document.querySelector("#office-task-close").click()');
'''
text=text.replace(old,new,1)
assert text.count('.rail-person strong')==3
text=text.replace('.rail-person strong','#office-user')
path.write_text(text,encoding='utf-8')
print('Two-room agile office installed; old workspace data retained, auth and intro untouched.')
