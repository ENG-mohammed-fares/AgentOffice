"""Inspect embedded GLB rigs and measured track variation; not a visual acceptance test."""
import hashlib
import json
import math
import struct
from pathlib import Path

from character_assets import validate_model

FORMATS = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
SIZES = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_accessor(model: dict, binary: bytes, index: int) -> list:
    """Read dense embedded accessor rows, respecting stride and rejecting out-of-bounds data.

    Returns raw numeric tuples; normalized integer weights are sufficient for nonzero
    influence inventory. Sparse/external data is explicitly unsupported, never ignored.
    """
    accessor = model['accessors'][index]
    view = model['bufferViews'][accessor['bufferView']]
    if 'sparse' in accessor or view.get('buffer', 0) != 0:
        raise ValueError('Sparse/external accessor unsupported by rig audit')
    fmt = '<' + FORMATS[accessor['componentType']] * SIZES[accessor['type']]
    size = struct.calcsize(fmt)
    stride = view.get('byteStride', size)
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    count = accessor['count']
    end = start + max(0, count - 1) * stride + (size if count else 0)
    if count < 0 or stride < size or start < view.get('byteOffset', 0) or end > len(binary) or end > view.get('byteOffset', 0) + view['byteLength']:
        raise ValueError('Accessor exceeds embedded buffer bounds')
    rows = [struct.unpack_from(fmt, binary, start + i * stride) for i in range(count)]
    if any(not math.isfinite(value) for row in rows for value in row):
        raise ValueError('Nonfinite rig data')
    return rows


def varying(rows: list, quaternion: bool) -> bool:
    """Detect real sampled changes; quaternion sign flips alone do not count as rotation."""
    if not rows:
        return False
    first = rows[0]
    for row in rows[1:]:
        difference = max(abs(a - b) for a, b in zip(first, row))
        if quaternion:
            difference = min(difference, max(abs(a + b) for a, b in zip(first, row)))
        if difference > 1e-6:
            return True
    return False


def clip_report(model: dict, binary: bytes, animation: dict) -> dict:
    """Inventory keyed and changing transform targets, preserving unsupported-interpolation limits."""
    keyed, moving = set(), set()
    for channel in animation['channels']:
        sampler = animation['samplers'][channel['sampler']]
        if sampler.get('interpolation', 'LINEAR') not in ('LINEAR', 'STEP'):
            raise ValueError('Unsupported interpolation; inspect cubic tangents separately')
        target = channel['target']
        if target['path'] not in ('rotation', 'translation', 'scale'):
            continue
        node = target['node']
        keyed.add(node)
        rows = read_accessor(model, binary, sampler['output'])
        times = read_accessor(model, binary, sampler['input'])
        if len(rows) != len(times) or any(b[0] <= a[0] for a, b in zip(times, times[1:])):
            raise ValueError('Invalid animation sample times/count')
        if varying(rows, target['path'] == 'rotation'):
            moving.add(node)
    return {'name': animation['name'], 'keyed_nodes': sorted(keyed), 'varying_nodes': sorted(moving)}


def weighted_joints(model: dict, binary: bytes) -> tuple:
    """Resolve nonzero vertex influences through each mesh's own skin joint-index table."""
    influenced, primitive_count = set(), 0
    for node in model['nodes']:
        if 'skin' not in node or 'mesh' not in node:
            continue
        joints = model['skins'][node['skin']]['joints']
        for primitive in model['meshes'][node['mesh']]['primitives']:
            primitive_count += 1
            attributes = primitive['attributes']
            for slot in (0, 1):
                key, weights = f'JOINTS_{slot}', f'WEIGHTS_{slot}'
                if key not in attributes:
                    continue
                indices = read_accessor(model, binary, attributes[key])
                values = read_accessor(model, binary, attributes[weights])
                if len(indices) != len(values):
                    raise ValueError('Mismatched skin attributes')
                for row, weight in zip(indices, values):
                    for index, amount in zip(row, weight):
                        if index >= len(joints) or amount < 0:
                            raise ValueError('Invalid joint influence')
                        if amount > 0:
                            influenced.add(joints[index])
    return influenced, primitive_count


def audit(data: bytes) -> dict:
    """Audit one validated local asset; return identities, hierarchy, skin/clip evidence and gaps.

    This cannot establish anatomical limits, contact quality, foot sliding, correct
    deformation, or meaningful motion after runtime IK. No asset bytes are modified.
    """
    validate_model(data)
    size = struct.unpack_from('<I', data, 12)[0]
    model = json.loads(data[20:20 + size])
    offset = 20 + size
    length, tag = struct.unpack_from('<I4s', data, offset)
    if tag != b'BIN\x00' or offset + 8 + length > len(data):
        raise ValueError('Missing or truncated embedded binary chunk')
    binary = data[offset + 8:offset + 8 + length]
    joints = {index for skin in model['skins'] for index in skin['joints']}
    clips = [clip_report(model, binary, animation) for animation in model['animations']]
    moving = {index for clip in clips for index in clip['varying_nodes']}
    influenced, count = weighted_joints(model, binary)
    names = {index: model['nodes'][index].get('name', str(index)) for index in joints}
    return {'sha256': hashlib.sha256(data).hexdigest(), 'joints': names,
            'hierarchy': {index: model['nodes'][index].get('children', []) for index in joints},
            'finger_joints': [name for name in names.values() if any(finger in name for finger in ('Thumb', 'Index', 'Middle', 'Ring', 'Pinky'))],
            'clips': clips, 'skinned_primitives': count,
            'unweighted_joint_indices': sorted(joints - influenced),
            'never_varying_joints': [names[index] for index in sorted(joints - moving)]}


def main() -> None:
    """Write a role-keyed reproducible report to stdout; caller chooses artifact location."""
    root = Path(__file__).resolve().parents[1] / 'assets/agile-office'
    roster = json.loads((root / 'character-roster.json').read_text(encoding='utf-8'))
    report = {entry['role']: audit((root / 'characters' / entry['file']).read_bytes()) for entry in roster}
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
