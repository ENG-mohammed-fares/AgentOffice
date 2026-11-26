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
    # Ubuntu's packaged Cycles lacks OpenImageDenoiser. Use raw samples.
    scene.cycles.use_denoising = False
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
    if len(layout["lights"]) != 29 or len(layout["cameras"]) != 4:
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


def material_exclusion(material, combined):
    """Use the canonical glTF material data, not importer socket defaults."""
    pbr = material.get("pbrMetallicRoughness", {})
    if material.get("alphaMode", "OPAQUE") != "OPAQUE":
        return "transparent"
    if pbr.get("baseColorFactor", [1, 1, 1, 1])[3] < .999:
        return "transparent"
    extensions = material.get("extensions", {})
    if "KHR_materials_unlit" in extensions or "KHR_materials_transmission" in extensions:
        return "special material"
    metallic = pbr.get("metallicFactor", 1)
    if metallic >= .95:
        return "metallic"
    if combined:
        if metallic > .10 or pbr.get("roughnessFactor", 1) < .45:
            return "reflective"
        if "metallicRoughnessTexture" in pbr:
            return "variable reflectivity"
        if "emissiveTexture" in material or max(material.get("emissiveFactor", [0, 0, 0])) > .01:
            return "emissive"
    return None


def classify_nodes(doc, combined):
    eligible, rejected = set(), {}
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        name = node["name"]
        blocked = ("glass", "sky", "screen", "display", "mirror") if combined else ("glass", "sky")
        reason = "movable chair" if name.lower().startswith("chair_") else next((word for word in blocked if word in name.lower()), None)
        if reason is None:
            for primitive in doc["meshes"][node["mesh"]]["primitives"]:
                if "TEXCOORD_0" not in primitive["attributes"] or "material" not in primitive:
                    reason = "missing UV0 or material"
                else:
                    reason = material_exclusion(doc["materials"][primitive["material"]], combined)
                if reason:
                    break
        if reason:
            rejected[name] = reason
        else:
            eligible.add(name)
    return eligible, rejected


def select_targets(scene, source, output, combined):
    raw = source.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    doc = json.loads(raw[20:20 + size])
    eligible, rejected = classify_nodes(doc, combined)
    meshes = {obj.name: obj for obj in scene.objects if obj.type == "MESH"}
    missing = sorted(eligible - meshes.keys())
    report = {"eligible": sorted(eligible), "rejected": rejected,
              "missing_after_import": missing, "imported_meshes": sorted(meshes)}
    (output / "material-selection.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Canonical material classification: {len(eligible)} eligible; {len(rejected)} excluded", flush=True)
    if not eligible or missing:
        raise RuntimeError("No valid bake targets or glTF node names changed; see material-selection.json")
    targets = [meshes[name] for name in sorted(eligible)]
    for obj in targets:
        if not obj.data.polygons or not obj.data.uv_layers or not obj.data.materials:
            raise ValueError(f"Invalid imported bake mesh: {obj.name}")
        if any(m is None or not m.use_nodes for m in obj.data.materials):
            raise ValueError(f"Missing imported shader nodes: {obj.name}")
    return targets


def test_material_classification():
    matte = {"pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": .8}}
    assert material_exclusion(matte, True) is None
    assert material_exclusion({**matte, "alphaMode": "BLEND"}, True) == "transparent"
    assert material_exclusion({**matte, "emissiveFactor": [1, 0, 0]}, True) == "emissive"
    assert material_exclusion({"pbrMetallicRoughness": {"metallicFactor": 0, "roughnessFactor": .2}}, True) == "reflective"
    doc = {"nodes": [{"name": "Wall", "mesh": 0}, {"name": "Glass", "mesh": 0}],
           "meshes": [{"primitives": [{"material": 0, "attributes": {"TEXCOORD_0": 1}}]}],
           "materials": [matte]}
    eligible, rejected = classify_nodes(doc, True)
    assert eligible == {"Wall"} and rejected == {"Glass": "glass"}


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


def bake_lightmap(scene, targets, output, atlas_size, combined=False):
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
        if combined:
            bpy.ops.object.bake(type="COMBINED", uv_layer="Lightmap",
                                margin=8, use_clear=True)
            image.filepath_raw = str(output / "office-combined-linear.exr")
        else:
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"},
                                uv_layer="Lightmap", margin=4, use_clear=True)
            image.filepath_raw = str(output / "office-diffuse-lightmap.exr")
        image.file_format = "OPEN_EXR"
        image.save()
        if combined:
            # Apply the display transform exactly once. The candidate runtime
            # disables tone mapping only for its display-referred unlit atlas.
            scene.render.image_settings.file_format = "PNG"
            scene.render.image_settings.color_mode = "RGB"
            image.save_render(str(output / "office-combined.png"), scene=scene)
        if not Path(image.filepath_raw).is_file():
            raise RuntimeError("Missing baked EXR")
    finally:
        for tree, node in nodes:
            tree.nodes.remove(node)
        for obj in targets:
            obj.data.uv_layers.active_index = 0
            obj.data.uv_layers[0].active_render = True


def embed_unlit_atlas(source, output, names):
    """Attach a baked color atlas to UV1 using glTF's standard unlit extension."""
    raw = source.read_bytes()
    size, kind = struct.unpack_from("<I4s", raw, 12)
    if kind != b"JSON":
        raise ValueError("Expected GLB JSON")
    doc = json.loads(raw[20:20 + size])
    offset = 20 + size
    binary_size, binary_kind = struct.unpack_from("<I4s", raw, offset)
    if binary_kind != b"BIN\x00" or offset + 8 + binary_size != len(raw):
        raise ValueError("Expected exactly one GLB binary chunk")
    binary = bytearray(raw[offset + 8:])
    atlas = (output / "office-combined.png").read_bytes()
    if not atlas.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Missing PNG atlas")
    view = len(doc["bufferViews"])
    doc["bufferViews"].append({"buffer": 0, "byteOffset": len(binary), "byteLength": len(atlas)})
    binary.extend(atlas)
    binary.extend(b"\x00" * ((-len(binary)) % 4))
    doc["buffers"][0]["byteLength"] = len(binary)
    image = len(doc.setdefault("images", []))
    doc["images"].append({"name": "Office combined atlas", "bufferView": view, "mimeType": "image/png"})
    texture = len(doc.setdefault("textures", []))
    doc["textures"].append({"source": image})
    material = len(doc["materials"])
    doc["materials"].append({
        "name": "Office baked static atlas",
        "pbrMetallicRoughness": {"baseColorTexture": {"index": texture, "texCoord": 1},
                                 "metallicFactor": 0, "roughnessFactor": 1},
        "extensions": {"KHR_materials_unlit": {}}
    })
    for key in ("extensionsUsed", "extensionsRequired"):
        if "KHR_materials_unlit" not in doc.setdefault(key, []):
            doc[key].append("KHR_materials_unlit")
    # A mesh shared by eligible and ineligible nodes must not be mutated.
    patched = set()
    for node in doc["nodes"]:
        if node.get("name") not in names:
            continue
        mesh = doc["meshes"][node["mesh"]]
        clone = {**mesh, "primitives": []}
        for primitive in mesh["primitives"]:
            if "TEXCOORD_1" not in primitive["attributes"]:
                raise ValueError("Baked primitive lacks UV1")
            clone["primitives"].append({**primitive, "material": material})
        node["mesh"] = len(doc["meshes"])
        doc["meshes"].append(clone)
        patched.add(node["name"])
    if patched != names:
        raise ValueError("Unlit assignment does not match bake targets")
    header = json.dumps(doc, separators=(",", ":")).encode()
    header += b" " * ((-len(header)) % 4)
    chunks = struct.pack("<I4s", len(header), b"JSON") + header
    chunks += struct.pack("<I4s", len(binary), b"BIN\x00") + binary
    candidate = output / "office-baked.glb"
    candidate.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + len(chunks)) + chunks)
    return candidate


def main():
    """Bake only the canonical office assets into the fixed review directory."""
    parser = argparse.ArgumentParser()
    # Accept only the established invocation; never use CLI paths for filesystem access.
    parser.add_argument("--source", choices=("assets/agile-office/office.glb",), required=True)
    parser.add_argument("--layout", choices=("assets/agile-office/scene.json",), required=True)
    parser.add_argument("--output", choices=("office-candidates",), required=True)
    parser.add_argument("--samples", type=int, choices=(16, 32, 64), default=16)
    parser.add_argument("--combined", action="store_true")
    parser.add_argument("--atlas", type=int, choices=(1024, 2048, 4096), default=1024)
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:])
    asset_dir = Path(__file__).resolve().parent
    source = asset_dir / "office.glb"
    layout_path = asset_dir / "scene.json"
    output = asset_dir.parents[1] / "office-candidates"
    for file in (source, layout_path):
        if not file.is_file() or file.resolve(strict=True) != file:
            raise ValueError("Expected a regular canonical office input")
    if output.resolve() != output:
        raise ValueError("Unexpected candidate output location")
    output.mkdir(parents=True, exist_ok=True)
    if any(entry.is_symlink() for entry in output.iterdir()):
        raise ValueError("Candidate output contains symbolic links")
    original = glb_summary(source)
    if original["triangles"] != EXPECTED_TRIANGLES:
        raise ValueError("Original office triangle count changed")
    layout = json.loads(layout_path.read_text(encoding="utf-8"))
    scene = setup_scene(source, layout, args.samples)
    if not args.combined:
        render_previews(scene, layout, output)
    test_material_classification()
    targets = select_targets(scene, source, output, args.combined)
    unwrap_targets(targets)
    bake_lightmap(scene, targets, output, args.atlas, args.combined)
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
    if args.combined:
        candidate = embed_unlit_atlas(candidate, output, {obj.name for obj in targets})
        summary = glb_summary(candidate)
        if summary["triangles"] != original["triangles"]:
            raise ValueError("Unlit candidate changed triangles")
    report = {"status": "review_only", "mode": "combined" if args.combined else "diffuse", "blender": bpy.app.version_string,
              "original": original, "candidate": summary,
              "baked_nodes": sorted(obj.name for obj in targets),
              "atlas": args.atlas, "samples": args.samples,
              "preview_resolution": RESOLUTION,
              "notes": "Approximate light power; visual, UV overlap and GPU validation required"}
    (output / "bake-report.json").write_text(json.dumps(report, indent=2) + "\n",
                                             encoding="utf-8")


if __name__ == "__main__":
    main()
