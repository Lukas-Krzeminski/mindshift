import * as THREE from 'three'
import { NOISE_GLSL } from '../shaders/noise'
import { skinOnlyChunks } from './garment'

export interface LuminousUniforms {
  uTime: { value: number }
  /** 0 = positive (iridescent dawn light), 1 = challenging (amber/acid, fragmented). */
  uMode: { value: number }
  /** Challenging world only: 0 = agitated, 1 = steadied (after the breath). */
  uCalm: { value: number }
  uIntensity: { value: number }
}

/**
 * "Inner Alex": a dark glassy body lit from within. Built on MeshStandardMaterial so
 * skinning, normal maps and lights keep working; the glow is injected as emissive.
 */
export function makeLuminousMaterial(
  normalMap: THREE.Texture | null,
  intensity = 1,
  /** When given, only these joints' vertices are drawn (the garment covers the rest). */
  skinJoints?: number[],
): { material: THREE.MeshStandardMaterial; uniforms: LuminousUniforms } {
  const hide = skinJoints ? skinOnlyChunks(skinJoints) : null
  const uniforms: LuminousUniforms = {
    uTime: { value: 0 },
    uMode: { value: 0 },
    uCalm: { value: 0 },
    uIntensity: { value: intensity },
  }
  const material = new THREE.MeshStandardMaterial({
    color: '#0a0618',
    roughness: 0.22,
    metalness: 0.35,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
  })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLumPos;\n${hide?.vertexDecl ?? ''}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${hide?.vertex ?? ''}`)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvLumPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLumPos;\nuniform float uTime, uMode, uCalm, uIntensity;\n${NOISE_GLSL}\n${hide?.fragmentDecl ?? ''}`)
      .replace('void main() {', `void main() {\n${hide?.fragment ?? ''}`)
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        {
          vec3 vdir = normalize(vViewPosition);
          float fres = pow(1.0 - abs(dot(normal, vdir)), 2.0);
          float flow = fbm(vLumPos * 2.4 + vec3(0.0, -uTime * 0.55, uTime * 0.12));
          float veins = pow(1.0 - abs(fbm(vLumPos * 5.0 + vec3(uTime * 0.2)) * 2.0 - 1.0), 6.0);

          // positive: thin-film iridescence on the rim, warm light flowing inside
          vec3 iri = 0.5 + 0.5 * cos(6.2831 * (fres * 1.1 + vLumPos.y * 0.22 + uTime * 0.04 + vec3(0.0, 0.33, 0.67)));
          vec3 warm = mix(vec3(1.0, 0.45, 0.7), vec3(1.0, 0.8, 0.42), flow);
          vec3 pos = iri * fres * 2.1 + warm * pow(flow, 2.6) * 1.1 + vec3(0.55, 0.9, 1.0) * veins * 0.7 + vec3(1.0, 0.9, 0.95) * pow(fres, 3.0) * 1.2;

          // challenging: harsh amber / acid green, fragmented, slow flicker (well under 3 Hz)
          float flick = 0.72 + 0.28 * sin(uTime * 2.2 + vLumPos.y * 3.0);
          float bands = step(0.5, fract(vLumPos.y * 1.4 + uTime * 0.18));
          vec3 harsh = mix(vec3(1.0, 0.58, 0.12), vec3(0.6, 1.0, 0.18), bands);
          float frag = smoothstep(0.48, 0.56, flow);
          vec3 cha = harsh * fres * 2.6 * mix(flick, 1.0, uCalm) + harsh * frag * 1.1 * mix(flick, 0.6, uCalm)
                   + vec3(1.0, 0.85, 0.6) * fres * uCalm * 1.2;

          totalEmissiveRadiance += mix(pos, cha, uMode) * uIntensity;
        }`,
      )
  }
  material.customProgramCacheKey = () => `luminous-alex-v2-${skinJoints ? 'skin' : 'full'}`
  return { material, uniforms }
}
