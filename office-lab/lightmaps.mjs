import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { LinearSRGBColorSpace } from 'three';
// Use on static meshes only. Baked diffuse light does not replace live specular/reflections.
export async function applyOfficeLightmaps(root, manifest, baseURL) {
  if (manifest.version !== 1) throw new Error('Unsupported lightmap manifest');
  const loader = new EXRLoader();
  for (const entry of manifest.lightmaps) {
    const mesh = root.getObjectByName(entry.node);
    if (!mesh?.isMesh || !mesh.geometry.getAttribute('uv1') || entry.uvChannel !== 1) throw new Error('Missing lightmap mesh or UV1: '+entry.node);
    const map = await loader.loadAsync(new URL(entry.file, baseURL).href);
    map.colorSpace = LinearSRGBColorSpace;
    map.channel = 1;
    map.flipY = false;
    const apply = material => { const clone=material.clone(); clone.lightMap=map; clone.lightMapIntensity=entry.intensity; clone.needsUpdate=true; return clone; };
    mesh.material=Array.isArray(mesh.material)?mesh.material.map(apply):apply(mesh.material);
  }
}
