import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'
import { DAWN_SKY_GLSL, FOG_COLOR, SUN_DIR } from './sky'
import { player } from '../../player/playerState'

export const WATER_Y = 0.1
const MAX_STEPS = 24

/**
 * The endless ankle-deep sea of liquid light: reflects the dawn sky, shimmers with
 * caustics, and every footstep blooms an expanding ring of color.
 * Slightly transparent so mirrored geometry underneath reads as reflections.
 */
export function LightWater() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: true,
        uniforms: {
          uTime: { value: 0 },
          uSunDir: { value: SUN_DIR.clone() },
          uSteps: { value: Array.from({ length: MAX_STEPS }, () => new THREE.Vector4(0, 0, -100, 0)) },
          uFog: { value: FOG_COLOR.clone() },
        },
        vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec4 uSteps[${MAX_STEPS}]; uniform vec3 uFog;
          varying vec3 vW;
          ${NOISE_GLSL}
          ${DAWN_SKY_GLSL}
          void main() {
            vec3 V = normalize(vW - cameraPosition);
            float dist = length(vW - cameraPosition);

            // gentle swell: a few crossing sine waves (smooth and cheap)
            vec2 p = vW.xz;
            float t = uTime;
            float dx = cos(p.x * 0.9 + t * 0.8) * 0.05 + cos(p.x * 2.1 - p.y * 1.3 + t * 1.1) * 0.025 + cos(p.x * 4.3 + p.y * 3.1 - t * 1.7) * 0.012;
            float dz = cos(p.y * 0.8 - t * 0.7) * 0.05 + cos(p.y * 2.3 + p.x * 1.1 + t * 0.9) * 0.025 + cos(p.y * 4.7 - p.x * 2.6 + t * 1.5) * 0.012;
            vec3 N = normalize(vec3(dx, 1.0, dz));

            // footstep rings
            vec3 ringCol = vec3(0.0);
            for (int i = 0; i < ${MAX_STEPS}; i++) {
              vec4 s = uSteps[i];
              float age = uTime - s.z;
              if (age < 0.0 || age > 3.2) continue;
              float r = age * 1.9 + 0.15;
              float d = length(vW.xz - s.xy);
              float ring = exp(-pow((d - r) * 6.0, 2.0)) * pow(1.0 - age / 3.2, 1.5);
              vec3 pal = 0.55 + 0.45 * cos(6.2831 * (float(i) * 0.137 + vec3(0.0, 0.33, 0.67)));
              ringCol += pal * ring;
              N.xz += normalize(vW.xz - s.xy + 0.0001) * ring * 0.35;
            }
            N = normalize(N);

            vec3 R = reflect(V, N);
            R.y = abs(R.y);
            vec3 refl = dawnSky(R, uTime);
            float fres = 0.08 + 0.92 * pow(1.0 - max(dot(-V, N), 0.0), 4.0);

            // classic iterative caustic web (smooth, no grid artifacts)
            vec2 cp = mod(vW.xz * 0.45, 6.2831853) - 250.0;
            vec2 ci = cp;
            float cc = 1.0;
            for (int n = 0; n < 4; n++) {
              float tt = uTime * 0.35 * (1.0 - (3.5 / float(n + 1)));
              ci = cp + vec2(cos(tt - ci.x) + sin(tt + ci.y), sin(tt - ci.y) + cos(tt + ci.x));
              cc += 1.0 / length(vec2(cp.x / (sin(ci.x + tt) / 0.005), cp.y / (cos(ci.y + tt) / 0.005)));
            }
            cc /= 4.0;
            float caustic = pow(abs(1.17 - pow(cc, 1.4)), 8.0);
            float glowBand = pow(fbm(vec3(vW.xz * 0.06, uTime * 0.05)), 2.0);
            vec3 body = vec3(0.07, 0.035, 0.12) + vec3(0.2, 0.7, 0.75) * glowBand * 0.3 + vec3(1.0, 0.68, 0.42) * caustic * 1.1;
            vec3 col = mix(body, refl * 0.7, fres) + ringCol * 2.6;

            float fogF = smoothstep(90.0, 420.0, dist);
            col = mix(col, uFog, fogF * 0.8);
            float alpha = mix(0.84, 0.98, max(fres, fogF));
            gl_FragColor = vec4(col, alpha);
          }
        `,
      }),
    [],
  )

  useFrame((s) => {
    const u = material.uniforms
    u.uTime.value = s.clock.elapsedTime
    const steps = u.uSteps.value as THREE.Vector4[]
    player.steps.slice(-MAX_STEPS).forEach((st, i) => steps[i].set(st.x, st.z, st.t, 0))
  })

  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position={[0, WATER_Y, -20]} renderOrder={1}>
      <planeGeometry args={[900, 900, 1, 1]} />
    </mesh>
  )
}
