"""Real Blender/Cycles lightmap fixture; no office asset or credentials required."""
import bpy, json, struct
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'output'
out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene
s.render.engine='CYCLES'
s.cycles.device='CPU'
s.cycles.samples=32
s.cycles.use_denoising=True
s.world=bpy.data.worlds.new('Studio')
s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.2
bpy.ops.mesh.primitive_plane_add(size=6)
floor=bpy.context.object
floor.name='OfficeBakeFloor'
mat=bpy.data.materials.new('FloorPBR')
mat.use_nodes=True
mat.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(.5,.3,.14,1)
floor.data.materials.append(mat)
uv0=floor.data.uv_layers[0]
uv0.name='UV0'
uv1=floor.data.uv_layers.new(name='LightmapUV',do_init=True)
floor.data.uv_layers.active=uv1
uv0.active_render=True
bpy.ops.mesh.primitive_cube_add(size=1.6,location=(0,0,.8))
bpy.ops.object.light_add(type='AREA',location=(1,-1,4))
bpy.context.object.data.energy=700
bpy.context.object.data.size=2
bpy.ops.object.camera_add(location=(4,-6,3))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.6))-cam.location).to_track_quat('-Z','Y').to_euler()
s.camera=cam
s.render.resolution_x=640
s.render.resolution_y=360
s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG'
s.render.filepath=str(out/'foundation-render.png')
bpy.ops.render.render(write_still=True)
img=bpy.data.images.new('OfficeFloorLightmap',width=256,height=256,float_buffer=True,alpha=False)
img.colorspace_settings.name='Linear Rec.709'
node=mat.node_tree.nodes.new('ShaderNodeTexImage')
node.image=img
mat.node_tree.nodes.active=node
bpy.ops.object.select_all(action='DESELECT')
floor.select_set(True)
bpy.context.view_layer.objects.active=floor
s.render.bake.use_pass_color=False
s.render.bake.use_pass_direct=True
s.render.bake.use_pass_indirect=True
s.render.bake.margin=8
bpy.ops.object.bake(type='DIFFUSE',uv_layer='LightmapUV')
pixels=list(img.pixels)
assert max(pixels[0::4])>0.01,'empty lightmap'
assert max(pixels[0::4])-min(pixels[0::4])>.01,'flat lightmap'
img.filepath_raw=str(out/'floor-lightmap.exr')
img.file_format='OPEN_EXR'
img.save()
mat.node_tree.nodes.remove(node)
floor.data.uv_layers.active=uv0
uv0.active_render=True
bpy.ops.export_scene.gltf(filepath=str(out/'foundation.glb'),export_format='GLB',export_texcoords=True)
raw=(out/'foundation.glb').read_bytes()
n,tag=struct.unpack_from('<I4s',raw,12)
assert tag==b'JSON'
doc=json.loads(raw[20:20+n])
mesh=next(x['mesh'] for x in doc['nodes'] if x.get('name')=='OfficeBakeFloor')
assert all('TEXCOORD_0' in p['attributes'] and 'TEXCOORD_1' in p['attributes'] for p in doc['meshes'][mesh]['primitives'])
manifest={'version':1,'model':'foundation.glb','lightmaps':[{'node':'OfficeBakeFloor','file':'floor-lightmap.exr','uvChannel':1,'colorSpace':'linear-srgb','intensity':1}],'fixture':True}
(out/'lightmaps.json').write_text(json.dumps(manifest,indent=2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'foundation.blend'))
print('BAKE FOUNDATION PASS:',bpy.app.version_string)
