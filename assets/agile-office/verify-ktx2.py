"""Verify the two generated office artifacts at a fixed repository-relative location."""
import json
import struct
import sys
from pathlib import Path

KTX2_MAGIC = b'\xabKTX 20\xbb\r\n\x1a\n'


def require(condition, message):
    """Reject an invalid artifact invariant with an explicit error."""
    if not condition:
        raise ValueError(message)


def read_glb(path):
    """Read and validate GLB 2.0 chunk boundaries; return JSON and binary data."""
    data = path.read_bytes()
    require(len(data) >= 28, 'Truncated GLB')
    require(struct.unpack_from('<4sII', data) == (b'glTF', 2, len(data)),
            'Invalid GLB header')
    size, kind = struct.unpack_from('<I4s', data, 12)
    require(kind == b'JSON' and size % 4 == 0 and 28 + size <= len(data),
            'Invalid GLB JSON chunk')
    bin_size, bin_kind = struct.unpack_from('<I4s', data, 20 + size)
    require(bin_kind == b'BIN\x00' and bin_size % 4 == 0 and
            28 + size + bin_size == len(data), 'Invalid GLB binary chunk')
    return json.loads(data[20:20 + size]), data[28 + size:]


def geometry(doc):
    """Return primitive topology signatures for comparison without decoding vertices."""
    return [[(p.get('mode', 4), p['material'],
              doc['accessors'][p['attributes']['POSITION']]['count'],
              doc['accessors'][p['indices']]['count'] if 'indices' in p else None,
              sorted(p['attributes'])) for p in mesh['primitives']]
            for mesh in doc['meshes']]


def verify(original, compressed):
    """Require matching topology and 14 valid embedded BasisU texture payloads."""
    a, _ = read_glb(original)
    b, binary = read_glb(compressed)
    require('KHR_texture_basisu' in b['extensionsRequired'], 'Missing required BasisU extension')
    require(len(a['images']) == len(b['images']) == 14, 'Unexpected texture count')
    require([n.get('name') for n in a['nodes']] == [n.get('name') for n in b['nodes']],
            'Changed node names')
    require(geometry(a) == geometry(b), 'Changed mesh topology')
    for image in b['images']:
        view = b['bufferViews'][image['bufferView']]
        start, length = view.get('byteOffset', 0), view['byteLength']
        require(view.get('buffer', 0) == 0 and start >= 0 and
                length >= len(KTX2_MAGIC) and start + length <= len(binary),
                'Invalid compressed texture buffer range')
        require(image['mimeType'] == 'image/ktx2' and
                binary[start:start + len(KTX2_MAGIC)] == KTX2_MAGIC,
                'Invalid KTX2 texture')
    for texture in b['textures']:
        require('KHR_texture_basisu' in texture['extensions'], 'Missing texture BasisU extension')


def fixed_artifact(root, name):
    """Require a regular file at the canonical prepared office path, without symlinks."""
    expected = root / 'app' / 'public' / 'office' / name
    require(expected.resolve(strict=True) == expected and expected.is_file(),
            'Expected a regular artifact at the fixed office location')
    return expected


def main(argv=None):
    """Verify the canonical artifacts; accept only the known legacy CLI argument."""
    # Maintain compatibility with the existing CI invocation. Never construct a
    # file path from command-line input; reject anything except the legacy literal.
    if argv is None:
        argv = sys.argv[1:]
    require(argv in ([], ['app/public/office']), 'Only the fixed office location is supported')
    root = Path(__file__).resolve().parents[2]
    verify(fixed_artifact(root, 'office.glb'), fixed_artifact(root, 'office-ktx2.glb'))
    print('Verified compressed office: all 14 KTX2 maps and identical mesh topology; original fallback bundled.')


if __name__ == '__main__':
    main()
