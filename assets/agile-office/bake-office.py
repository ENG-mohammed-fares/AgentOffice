"""Bake the actual static office, using a separate UV map for each mesh.
Initial quality profile: 16 samples and 256-512px per mesh. Not a final visual grade."""
import bpy, json, math, struct, os, sys
from pathlib import Path
from mathutils import Vector
args=sys.argv[sys.argv.index('--')+1:]
source=Path(args[0]).resolve();out=Path(args[1]).resolve();out.mkdir(parents=True,exist_ok=True)
layout=json.loads((source/'scene.json').read_text())
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene;s.render.engine='CYCLES';s.cycles.device='CPU';s.cycles.samples=16;s.cycles.use_denoising=True
s.render.threads_mode='FIXED';s.render.threads=2
s.cycles.max_bounces=6;s.cycles.diffuse_bounces=3;s.cycles.glossy_bounces=2
s.world=bpy.data.worlds.new('Office ambient');s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs[0].default_value=(.035,.035,.035,1)
s.world.node_tree.nodes['Background'].inputs[1].default_value=.25
bpy.ops.import_scene.gltf(filepath=str(source/'office.glb'))
for i,(pos,u,w,n,c) in enumerate(layout['lights']):
    data=bpy.data.lights.new(f'Area {i:02d}',type='AREA');obj=bpy.data.objects.new(data.name,data);s.collection.objects.link(obj);obj.location=pos
    obj.rotation_euler=Vector(n).to_track_quat('-Z','Y').to_euler()
    data.shape='RECTANGLE';data.size=max(.01,2*Vector(u).length);data.size_y=max(.01,2*Vector(w).length)
    p=max(c);data.color=[x/max(.001,p) for x in c];data.energy=p*data.size*data.size_y*math.pi*12
targets=[];entries=[];temporary=[]
specs={m[0]:m for m in layout['materials']}
for o in list(s.objects):
    if o.type!='MESH':continue
    # Retain original glass, city, emissive surfaces and metallic reflection surfaces.
    # Only diffuse opaque interiors receive the first bake pass.
    mats=list(o.data.materials)
    if len(mats)!=1 or not mats[0]:continue
    mat=mats[0];spec=specs.get(mat.name)
    if not spec:continue
    name,base,rough,metal,mode,emit=spec
    if mode in (9,10) or emit or metal>.5 or 'city' in name.lower() or 'sky' in name.lower():continue
    if not o.data.uv_layers:continue
    if len(o.data.uv_layers)!=1:raise RuntimeError('Unexpected UV layout '+o.name)
    uv0_name=o.data.uv_layers[0].name;o.data.uv_layers[uv0_name].active_render=True
    # Weld coincident UV seams only for the temporary chart generation? No:
    # preserve all original faces and normals, and use Smart UV on the real mesh.
    o.data.uv_layers.new(name='LightmapUV',do_init=False)
    o.data.uv_layers.active=o.data.uv_layers['LightmapUV']
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.012)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Keep the base-color texture bound to UV0 even during UV1 baking.
    o.data.uv_layers[uv0_name].active_render=True
    o.data.uv_layers.active=o.data.uv_layers['LightmapUV']
    size=512 if any(x in name.lower() for x in ('floor','plaster','walnut','marble')) else 256
    duplicate=mat.copy();o.data.materials[0]=duplicate
    nodes=duplicate.node_tree.nodes
    for node in list(nodes):
        if node.type=='TEX_IMAGE' and not node.inputs['Vector'].is_linked:
            coord=nodes.new('ShaderNodeUVMap');coord.uv_map=uv0_name
            duplicate.node_tree.links.new(coord.outputs['UV'],node.inputs['Vector'])
    img=bpy.data.images.new(f'OfficeBake_{len(targets):03d}',width=size,height=size,float_buffer=True,alpha=False)
    img.colorspace_settings.name='Linear Rec.709'
    node=nodes.new('ShaderNodeTexImage');node.image=img;nodes.active=node
    targets.append(o);temporary.append((o,mat,duplicate,node,img,uv0_name))
    entries.append({'node':o.name,'file':f'lightmap-{len(entries):03d}.exr','uvChannel':1,'intensity':1,'size':size,'colorSpace':'linear-srgb'})
assert len(targets)>=10, f'Only {len(targets)} bake targets'
s.render.bake.use_pass_color=False;s.render.bake.use_pass_direct=True;s.render.bake.use_pass_indirect=True;s.render.bake.margin=4
print('Baking',len(targets),'actual office batches sequentially',flush=True)
# UV-layer RNA references can become invalid on allocation or edit-mode
# changes. Reacquire by name, update the depsgraph, then bake one target.
bpy.context.view_layer.update()
for entry,(o,mat,dup,node,img,uv0) in zip(entries,temporary):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True);bpy.context.view_layer.objects.active=o
    o.data.uv_layers.active=o.data.uv_layers['LightmapUV']
    o.data.uv_layers[uv0].active_render=True
    dup.node_tree.nodes.active=node
    bpy.context.view_layer.update()
    print('BAKE TARGET:',o.name,flush=True)
    bpy.ops.object.bake(type='DIFFUSE',uv_layer='LightmapUV')
    values=list(img.pixels)[0::4]
    assert max(values)>0.00001,'Empty lightmap '+o.name
    img.filepath_raw=str(out/entry['file']);img.file_format='OPEN_EXR';img.save()
    dup.node_tree.nodes.remove(node);o.data.materials[0]=mat
    o.data.uv_layers.active=o.data.uv_layers[uv0];o.data.uv_layers[uv0].active_render=True
    entry['maxRed']=max(values)
# Keep the cameras, lights and UVs in the editable Blender asset.
for c in layout['cameras']:
    data=bpy.data.cameras.new(c['name']);cam=bpy.data.objects.new(c['name'],data);s.collection.objects.link(cam)
    cam.location=c['pos'];cam.rotation_euler=(Vector(c['target'])-cam.location).to_track_quat('-Z','Y').to_euler()
    data.sensor_fit='HORIZONTAL';data.angle=math.radians(c['fov'])
    if s.camera is None:s.camera=cam
s.render.resolution_x=960;s.render.resolution_y=540;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.filepath=str(out/'cycles-reference.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'office-baked.blend'))
bpy.ops.export_scene.gltf(filepath=str(out/'office-baked.glb'),export_format='GLB',export_texcoords=True)
raw=(out/'office-baked.glb').read_bytes();n,tag=struct.unpack_from('<I4s',raw,12);assert tag==b'JSON'
doc=json.loads(raw[20:20+n]);nodes={x.get('name'):x for x in doc['nodes']}
for entry in entries:
    node=nodes[entry['node']]
    assert all('TEXCOORD_1' in p['attributes'] for p in doc['meshes'][node['mesh']]['primitives']),entry['node']
(out/'lightmaps.json').write_text(json.dumps({'version':1,'model':'office-baked.glb','lightmaps':entries,'samples':16,'quality':'initial CPU bake; visual approval required'},indent=2))
print('Full office diffuse bake completed:',len(entries),flush=True)
bpy.ops.render.render(write_still=True)
