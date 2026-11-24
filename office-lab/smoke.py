# Technical test fixture, not the architectural office.
import bpy, json, struct
from pathlib import Path
from mathutils import Vector
out=Path.cwd()/'output'
out.mkdir(exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
s=bpy.context.scene
s.render.engine='CYCLES'
s.cycles.device='CPU'
s.cycles.samples=16
s.render.resolution_x=400
s.render.resolution_y=300
s.render.resolution_percentage=100
s.world=bpy.data.worlds.new('Smoke world')
s.world.use_nodes=True
s.world.node_tree.nodes['Background'].inputs['Strength'].default_value=.3
bpy.ops.mesh.primitive_plane_add(size=6)
bpy.ops.mesh.primitive_uv_sphere_add(segments=48,ring_count=24,location=(0,0,1))
mat=bpy.data.materials.new('PBR fixture')
mat.use_nodes=True
bsdf=mat.node_tree.nodes.get('Principled BSDF')
bsdf.inputs['Base Color'].default_value=(.25,.09,.035,1)
bsdf.inputs['Metallic'].default_value=.5
bsdf.inputs['Roughness'].default_value=.28
bpy.context.object.data.materials.append(mat)
bpy.ops.object.light_add(type='AREA',location=(1,-2,5))
bpy.context.object.data.energy=450
bpy.context.object.data.size=3
bpy.ops.object.camera_add(location=(4,-6,3))
cam=bpy.context.object
cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler()
s.camera=cam
s.render.image_settings.file_format='PNG'
s.render.filepath=str(out/'smoke.png')
bpy.ops.wm.save_as_mainfile(filepath=str(out/'smoke.blend'))
bpy.ops.render.render(write_still=True)
p=out/'smoke.glb'
bpy.ops.export_scene.gltf(filepath=str(p),export_format='GLB')
data=p.read_bytes()
assert struct.unpack_from('<4sII',data)==(b'glTF',2,len(data))
size,kind=struct.unpack_from('<I4s',data,12)
assert kind==b'JSON'
doc=json.loads(data[20:20+size])
assert doc.get('meshes') and doc.get('materials')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(p))
assert any(o.type=='MESH' for o in bpy.context.scene.objects)
report={'blender':bpy.app.version_string,'cycles_cpu_render':(out/'smoke.png').stat().st_size>0,'glb_export_and_reimport':True,'glb_bytes':len(data),'fixture_only':True}
(out/'smoke-report.json').write_text(json.dumps(report,indent=2))
print(report)
