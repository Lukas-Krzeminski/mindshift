import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { CylinderCollider, RigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { mulberry32 } from '../../lib/random'
import { FOG_COLOR } from './sky'

// ---------------------------------------------------------------------------
// Colossal iridescent arches
// ---------------------------------------------------------------------------

export interface ArchDef {
  pos: [number, number]
  radius: number
  tube: number
  rotY: number
  tilt?: number
}

const thinFilmVert = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vV = -mv.xyz; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }
`

export function makeThinFilmMaterial(strength = 1): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uStrength: { value: strength }, uFog: { value: FOG_COLOR.clone() } },
    vertexShader: thinFilmVert,
    fragmentShader: /* glsl */ `
      uniform float uTime, uStrength; uniform vec3 uFog;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        vec3 iri = 0.5 + 0.5 * cos(6.2831 * (fres * 1.5 + vW.y * 0.018 + uTime * 0.025 + vec3(0.0, 0.33, 0.67)));
        vec3 col = iri * (0.5 + fres * 2.6) * uStrength + vec3(1.0, 0.95, 0.9) * pow(fres, 7.0) * 2.4;
        float dist = length(vV);
        float f = smoothstep(120.0, 480.0, dist);
        col = mix(col, uFog, f);
        float alpha = (0.32 + fres * 0.68) * (1.0 - f * 0.4);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  })
}

export function Arches({ arches, colliders = true }: { arches: ArchDef[]; colliders?: boolean }) {
  const film = useMemo(() => makeThinFilmMaterial(1), [])
  const core = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe3b0').multiplyScalar(2.2), toneMapped: false, fog: true }), [])
  useFrame((s) => (film.uniforms.uTime.value = s.clock.elapsedTime))
  return (
    <>
      {arches.map((a, i) => (
        <group key={i} position={[a.pos[0], 0, a.pos[1]]} rotation={[0, a.rotY, a.tilt ?? 0]}>
          <mesh material={film}>
            <torusGeometry args={[a.radius, a.tube, 28, 120, Math.PI]} />
          </mesh>
          <mesh material={core}>
            <torusGeometry args={[a.radius, a.tube * 0.08, 6, 120, Math.PI]} />
          </mesh>
          {colliders && (
            <RigidBody type="fixed" colliders={false}>
              <CylinderCollider args={[4, a.tube * 1.05]} position={[a.radius, 4, 0]} />
              <CylinderCollider args={[4, a.tube * 1.05]} position={[-a.radius, 4, 0]} />
            </RigidBody>
          )}
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Bioluminescent reed-flora (instanced, swaying, glowing tips)
// ---------------------------------------------------------------------------

export function Reeds({ clusters, perCluster, seed = 5 }: { clusters: [number, number, number][]; perCluster: number; seed?: number }) {
  const count = clusters.length * perCluster
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.004, 0.05, 1, 5, 6, false)
    g.translate(0, 0.5, 0)
    return g
  }, [])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uFog: { value: FOG_COLOR.clone() } },
        vertexShader: /* glsl */ `
          uniform float uTime; varying float vH; varying vec3 vTint; varying float vDist;
          void main(){
            vH = position.y;
            vec3 p = position;
            vec4 base = vec4(0.0);
            #ifdef USE_INSTANCING
              base = instanceMatrix[3];
            #endif
            float ph = base.x * 0.37 + base.z * 0.21;
            p.x += sin(uTime * 0.9 + ph) * p.y * p.y * 0.22;
            p.z += cos(uTime * 0.7 + ph * 1.3) * p.y * p.y * 0.16;
            vec4 w = vec4(p, 1.0);
            #ifdef USE_INSTANCING
              w = instanceMatrix * w;
            #endif
            vTint = vec3(1.0);
            #ifdef USE_INSTANCING_COLOR
              vTint = instanceColor;
            #endif
            vec4 mv = modelViewMatrix * w;
            vDist = -mv.z;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec3 uFog; varying float vH; varying vec3 vTint; varying float vDist;
          void main(){
            vec3 stem = mix(vec3(0.08, 0.2, 0.26), vTint * 0.9, smoothstep(0.0, 0.9, vH));
            float tip = smoothstep(0.6, 1.0, vH);
            vec3 col = stem + vTint * tip * tip * (3.6 + 0.8 * sin(uTime * 1.3 + vH * 4.0));
            col = mix(col, uFog, smoothstep(50.0, 220.0, vDist) * 0.9);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    [],
  )
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const rand = mulberry32(seed)
    const palette = ['#ffb3c7', '#ffd27a', '#5fe0d0', '#c9a4ff'].map((c) => new THREE.Color(c))
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    let i = 0
    for (const [cx, cz, r] of clusters) {
      const tint = palette[Math.floor(rand() * palette.length)]
      for (let k = 0; k < perCluster; k++) {
        const a = rand() * Math.PI * 2
        const d = Math.sqrt(rand()) * r
        const h = 0.6 + rand() * 1.9
        q.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3))
        m.compose(new THREE.Vector3(cx + Math.cos(a) * d, 0, cz + Math.sin(a) * d), q, new THREE.Vector3(1, h, 1))
        mesh.setMatrixAt(i, m)
        mesh.setColorAt(i, tint)
        i++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    material.needsUpdate = true
  }, [clusters, perCluster, seed, material])
  useFrame((s) => (material.uniforms.uTime.value = s.clock.elapsedTime))
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />
}

// ---------------------------------------------------------------------------
// Jellyfish-like neural lights drifting overhead
// ---------------------------------------------------------------------------

export function Jellies({ count = 16, seed = 9, area = [120, 140] as [number, number], centerZ = -25 }: { count?: number; seed?: number; area?: [number, number]; centerZ?: number }) {
  const data = useMemo(() => {
    const rand = mulberry32(seed)
    return Array.from({ length: count }, () => ({
      x: (rand() - 0.5) * area[0],
      z: centerZ + (rand() - 0.5) * area[1],
      y: 7 + rand() * 18,
      s: 1.2 + rand() * 2.4,
      ph: rand() * 6.28,
      color: new THREE.Color(['#ffb3c7', '#9fe8ff', '#d7b8ff', '#ffe0a8'][Math.floor(rand() * 4)]),
    }))
  }, [count, seed, area, centerZ])
  const domeGeo = useMemo(() => new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), [])
  const tentGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.025, 0.006, 1, 4, 8, true)
    g.translate(0, -0.5, 0)
    return g
  }, [])
  const domeMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vY;
          void main(){ vY = position.y; vTint = vec3(1.0);
            #ifdef USE_INSTANCING_COLOR
              vTint = instanceColor;
            #endif
            vec4 w = vec4(position,1.0);
            vec3 n = normal;
            #ifdef USE_INSTANCING
              w = instanceMatrix * w; n = mat3(instanceMatrix) * n;
            #endif
            vec4 mv = modelViewMatrix * w; vV = -mv.xyz; vN = normalize(normalMatrix * n); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vTint; varying float vY;
          void main(){ float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
            vec3 col = vTint * (fres * 1.6 + 0.12) + vTint * smoothstep(0.6, 1.0, vY) * 0.5;
            gl_FragColor = vec4(col, 1.0); }`,
      }),
    [],
  )
  const tentMat = useMemo(() => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), [])
  const domes = useRef<THREE.InstancedMesh>(null)
  const tents = useRef<THREE.InstancedMesh>(null)
  const TENT = 6
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), v: new THREE.Vector3(), sc: new THREE.Vector3() }), [])

  useEffect(() => {
    data.forEach((d, i) => {
      domes.current?.setColorAt(i, d.color.clone().multiplyScalar(1.4))
      for (let k = 0; k < TENT; k++) tents.current?.setColorAt(i * TENT + k, d.color.clone().multiplyScalar(1.8))
    })
    if (domes.current?.instanceColor) domes.current.instanceColor.needsUpdate = true
    if (tents.current?.instanceColor) tents.current.instanceColor.needsUpdate = true
    domeMat.needsUpdate = true
    tentMat.needsUpdate = true
  }, [data, domeMat, tentMat])

  useFrame((s) => {
    const t = s.clock.elapsedTime
    data.forEach((d, i) => {
      const pulse = 1 + Math.sin(t * 1.6 + d.ph) * 0.08 // ~0.25 Hz breathing
      const y = d.y + Math.sin(t * 0.35 + d.ph) * 1.2
      const x = d.x + Math.sin(t * 0.05 + d.ph) * 3
      tmp.sc.set(d.s * pulse, d.s * 0.7 / pulse, d.s * pulse)
      tmp.m.compose(tmp.v.set(x, y, d.z), tmp.q.identity(), tmp.sc)
      domes.current?.setMatrixAt(i, tmp.m)
      for (let k = 0; k < TENT; k++) {
        const a = (k / TENT) * Math.PI * 2
        const r = d.s * 0.55
        tmp.e.set(Math.sin(t * 0.8 + d.ph + k) * 0.18, 0, Math.cos(t * 0.7 + d.ph + k) * 0.18)
        tmp.q.setFromEuler(tmp.e)
        tmp.m.compose(tmp.v.set(x + Math.cos(a) * r, y, d.z + Math.sin(a) * r), tmp.q, tmp.sc.set(1, d.s * (2.2 + (k % 3) * 0.6), 1))
        tents.current?.setMatrixAt(i * TENT + k, tmp.m)
      }
    })
    if (domes.current) domes.current.instanceMatrix.needsUpdate = true
    if (tents.current) tents.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={domes} args={[domeGeo, domeMat, count]} frustumCulled={false} />
      <instancedMesh ref={tents} args={[tentGeo, tentMat, count * TENT]} frustumCulled={false} />
    </>
  )
}
