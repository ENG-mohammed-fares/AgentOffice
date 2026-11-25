"""Produce review-only Cycles previews and a diffuse-lightmap candidate."""
import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Vector

RESOLUTION = (1920, 1080)
EXPECTED_TRIANGLES = 117254


def glb_summary(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw)
    if (magic, version, length) != (b"glTF", 2, len(raw)):
        raise ValueError("Invalid GLB header")
    size, kind = struct.unpack_from("<I4s", raw, 12)
    if kind != b"JSON":
        raise ValueError("Missing GLB JSON chunk")
    doc = json.loads(raw[20:20 + size])
    triangles, secondary_uv = 0, []
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        primitives = doc["meshes"][node["mesh"]]["primitives"]
        for primitive in primitives:
            if primitive.get("mode", 4) != 4:
                raise ValueError("Unexpected non-triangle geometry")
            accessor = primitive.get("indices", primitive["attributes"]["POSITION"])
            triangles += doc["accessors"][accessor]["count"] // 3
        if all("TEXCOORD_1" in p["attributes"] for p in primitives):
            secondary_uv.append(node["name"])
    return {"triangles": triangles, "secondary_uv_nodes": sorted(secondary_uv),
            "sha256": hashlib.sha256(raw).hexdigest()}


def position(xyz):
    # Blender imports the Y-up GLB back into the authored Z-up coordinates.
    return Vector(xyz)


def area_light(scene, item, index):
    pos, u, w, normal, rgb = item
    peak = max(rgb)
    if peak <= 0:
        raise ValueError("Invalid area light")
    data = bpy.data.lights.new(f"Authored area {index}", "AREA")
    data.shape = "RECTANGLE"
    data.size = max(.03, 2 * Vector(u).length)
    data.size_y = max(.03, 2 * Vector(w).length)
    # Approximate conversion from runtime luminance to Cycles radiant power.
    # This is a candidate, not a photometrically calibrated reproduction.
    data.energy = min(peak * .35, 13) * data.size * data.size_y * math.pi
    data.color = tuple(c / peak for c in rgb)
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    obj.location = position(pos)
    obj.rotation_euler = Vector(normal).to_track_quat("-Z", "Y").to_euler()


def setup_scene(source, layout, samples):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.world = bpy.data.worlds.new("Candidate environment")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (.30, .30, .30, 1)
    background.inputs["Strength"].default_value = .30
    bpy.ops.import_scene.gltf(filepath=str(source))
    if len(layout["lights"]) != 29 or len(layout["cameras"]) != 3:
        raise ValueError("Unexpected office layout")
    for index, item in enumerate(layout["lights"]):
        area_light(scene, item, index)
    for x in (-2.6, 5.6):
        data = bpy.data.lights.new(f"Overhead {x}", "SPOT")
        data.energy = 32
        data.color = (1, .73, .47)
        data.spot_size = 2 * math.pi / 3
        data.spot_blend = .8
        obj = bpy.data.objects.new(data.name, data)
        scene.collection.objects.link(obj)
        obj.location = (x, 0, 3.05)
        obj.rotation_euler = Vector((0, 0, -1)).to_track_quat("-Z", "Y").to_euler()
    return scene


def render_previews(scene, layout, output):
    data = bpy.data.cameras.new("Authored camera")
    data.sensor_fit = "HORIZONTAL"
    data.type = "PERSP"
    camera = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    for i, view in enumerate(layout["cameras"]):
        camera.location = position(view["pos"])
        direction = position(view["target"]) - camera.location
        camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        data.angle = math.radians(view["fov"])
        scene.render.filepath = str(output / f"view-{i}.png")
        bpy.ops.render.render(write_still=True)
        if not Path(scene.render.filepath).is_file():
            raise RuntimeError("Missing native preview")


def diffuse_target(obj):
    if obj.type != "MESH" or not obj.data.polygons or not obj.data.uv_layers:
        return False
    if "glass" in obj.name.lower() or "sky" in obj.name.lower():
        return False
    for mat in obj.data.materials:
        if mat is None or not mat.use_nodes:
            return False
        shader = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if shader is None:
            return False
        if shader.inputs["Alpha"].default_value < .999:
            return False
        if shader.inputs["Metallic"].default_value >= .95:
            return False
    return bool(obj.data.materials)


def unwrap_targets(targets):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in targets:
        if len(obj.data.uv_layers) != 1:
            raise ValueError(f"Expected original UV0 only: {obj.name}")
        layer = obj.data.uv_layers.new(name="Lightmap", do_init=False)
        obj.data.uv_layers.active = layer
        obj.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    bpy.ops.object.mode_set(mode="EDIT")
    try:
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.004)
        bpy.ops.uv.pack_islands(margin=.004)
    finally:
        bpy.ops.object.mode_set(mode="OBJECT")


def bake_lightmap(scene, targets, output, atlas_size):
    image = bpy.data.images.new("Office diffuse illumination", width=atlas_size,
                                height=atlas_size, alpha=False, float_buffer=True)
    nodes = []
    materials = {m for obj in targets for m in obj.data.materials}
    try:
        for material in materials:
            tree = material.node_tree
            node = tree.nodes.new("ShaderNodeTexImage")
            node.image = image
            for other in tree.nodes:
                other.select = False
            node.select = True
            tree.nodes.active = node
            nodes.append((tree, node))
        scene.cycles.use_denoising = False
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"},
                            uv_layer="Lightmap", margin=4, use_clear=True)
        image.filepath_raw = str(output / "office-diffuse-lightmap.exr")
        image.file_format = "OPEN_EXR"
        image.save()
        if not Path(image.filepath_raw).is_file():
            raise RuntimeError("Missing baked EXR")
    finally:
        for tree, node in nodes:
            tree.nodes.remove(node)
        for obj in targets:
            obj.data.uv_layers.active_index = 0
            obj.data.uv_layers[0].active_render = True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--layout", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--samples", type=int, choices=(16, 32, 64), default=16)
    parser.add_argument("--atlas", type=int, choices=(1024, 2048, 4096), default=1024)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    source, output = args.source.resolve(), args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    original = glb_summary(source)
    if original["triangles"] != EXPECTED_TRIANGLES:
        raise ValueError("Original office triangle count changed")
    layout = json.loads(args.layout.read_text(encoding="utf-8"))
    scene = setup_scene(source, layout, args.samples)
    render_previews(scene, layout, output)
    targets = [obj for obj in scene.objects if diffuse_target(obj)]
    if not targets:
        raise RuntimeError("No diffuse lightmap targets")
    unwrap_targets(targets)
    bake_lightmap(scene, targets, output, args.atlas)
    candidate = output / "office-bake-uv.glb"
    bpy.ops.export_scene.gltf(filepath=str(candidate), export_format="GLB",
                              export_cameras=False, export_lights=False,
                              export_texcoords=True, export_normals=True)
    summary = glb_summary(candidate)
    if summary["triangles"] != original["triangles"]:
        raise ValueError("Candidate changed the number of triangles")
    missing = sorted({obj.name for obj in targets} - set(summary["secondary_uv_nodes"]))
    if missing:
        raise ValueError(f"Missing secondary UVs: {missing}")
    report = {"status": "review_only", "blender": bpy.app.version_string,
              "original": original, "candidate": summary,
              "baked_nodes": sorted(obj.name for obj in targets),
              "atlas": args.atlas, "samples": args.samples,
              "preview_resolution": RESOLUTION,
              "notes": "Approximate light power; visual, UV overlap and GPU validation required"}
    (output / "bake-report.json").write_text(json.dumps(report, indent=2) + "\n",
                                             encoding="utf-8")


if __name__ == "__main__":
    main()
