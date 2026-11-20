import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'
import { DAWN_SKY_GLSL, SUN_DIR } from './sky'

/** Iridescent dawn dome with clouds, aurora ribbons and a low sun. */
export function DawnSky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uSunDir: { value: SUN_DIR.clone() } },
        vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec3 vDir;
          ${NOISE_GLSL}
          ${DAWN_SKY_GLSL}
          void main(){ gl_FragColor = vec4(dawnSky(normalize(vDir), uTime), 1.0); }
        `,
      }),
    [],
  )
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime
  })
  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[700, 64, 32]} />
    </mesh>
  )
}

/** Soft volumetric-looking light shafts falling from the sky. */
export function LightShafts({ positions }: { positions: [number, number, number][] }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix * normal; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
          void main(){
            float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
            float along = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
            float shimmer = 0.75 + 0.25 * sin(uTime * 0.4 + vUv.x * 12.0);
            gl_FragColor = vec4(vec3(1.0, 0.86, 0.66) * edge * along * shimmer * 0.16, 1.0);
          }`,
      }),
    [],
  )
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  const tilt = useMemo(() => new THREE.Euler(0.18, 0, 0.32), [])
  return (
    <>
      {positions.map((p, i) => (
        <mesh key={i} position={p} rotation={tilt} material={material}>
          <cylinderGeometry args={[3 + i * 0.6, 9 + i, 140, 24, 1, true]} />
        </mesh>
      ))}
    </>
  )
}
