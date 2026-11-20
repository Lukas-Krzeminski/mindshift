import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'

/** Deep indigo nebula dome: the "inner space" of the brain. */
export function NebulaSky({ tintA = '#140a3a', tintB = '#04030f', glowA = '#5a2aa8', glowB = '#1b6f9a' }: { tintA?: string; tintB?: string; glowA?: string; glowB?: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uTop: { value: new THREE.Color(tintA) },
          uBottom: { value: new THREE.Color(tintB) },
          uGlowA: { value: new THREE.Color(glowA) },
          uGlowB: { value: new THREE.Color(glowB) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uTop, uBottom, uGlowA, uGlowB;
          varying vec3 vDir;
          ${NOISE_GLSL}
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y * 0.5 + 0.5;
            vec3 col = mix(uBottom, uTop, smoothstep(0.1, 0.9, h));
            float n1 = fbm(d * 2.6 + vec3(0.0, uTime * 0.006, 0.0));
            float n2 = fbm(d * 4.3 + vec3(7.1, 2.0, -uTime * 0.008));
            col += uGlowA * pow(n1, 3.2) * 1.4;
            col += uGlowB * pow(n2, 4.0) * 1.2;
            // distant neuron sparks
            float stars = pow(hash31(floor(d * 380.0)), 60.0) * 2.5;
            col += vec3(0.7, 0.85, 1.0) * stars * (0.6 + 0.4 * sin(uTime * 1.3 + d.x * 40.0));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [tintA, tintB, glowA, glowB],
  )
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[600, 48, 32]} />
    </mesh>
  )
}

/** A luminous "synaptic sea" far below, giving the space depth and a horizon. */
export function MistFloor({ y = -16, colorA = '#3b1d8f', colorB = '#0f6f8f' }: { y?: number; colorA?: string; colorB?: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) } },
        vertexShader: /* glsl */ `
          varying vec3 vW;
          void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uA, uB; varying vec3 vW;
          ${NOISE_GLSL}
          void main() {
            vec2 p = vW.xz * 0.035;
            float n = fbm(vec3(p, uTime * 0.03));
            float m = fbm(vec3(p * 2.2 + 4.0, -uTime * 0.05));
            float fade = 1.0 - smoothstep(60.0, 260.0, length(vW.xz));
            vec3 col = mix(uA, uB, m) * pow(n, 2.2) * 1.6 * fade;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    [colorA, colorB],
  )
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <mesh material={material} rotation-x={-Math.PI / 2} position={[0, y, -30]} frustumCulled={false}>
      <planeGeometry args={[600, 600]} />
    </mesh>
  )
}
