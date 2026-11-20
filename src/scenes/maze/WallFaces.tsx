import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { MAZE_COMMON, type MazeUniforms } from './mazeMaterials'
import type { FaceSpot } from './mazeLayout'

/**
 * Faces pushing out of the concrete, like the wall is a membrane: Alex's fears pressing in.
 * One shared relief mesh (brow, hollow eyes, nose, open mouth), instanced on wall sides;
 * `push` (0..1 per face) extrudes it. Same breathing + acid light as the walls, so it reads
 * as the wall itself bulging. No gore, nothing jumps at the camera; it surfaces over ~1 s.
 */

const gauss = (x: number, y: number, sx: number, sy: number) => Math.exp(-(x * x) / (2 * sx * sx) - (y * y) / (2 * sy * sy))

function faceGeometry(): THREE.BufferGeometry {
  const W = 1
  const H = 1.36
  const g = new THREE.PlaneGeometry(W, H, 56, 76)
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const cav = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i)
    const v = pos.getY(i)
    const e = (u / 0.4) ** 2 + ((v + 0.02) / 0.56) ** 2
    const t = Math.max(0, 1 - e)
    const dome = Math.pow(t * t * (3 - 2 * t), 0.55) * 0.3
    const skirt = Math.exp(-(u * u + v * v) / 0.2) * 0.08 * Math.min(1, (0.5 - Math.abs(u)) * 8) * Math.min(1, (0.68 - Math.abs(v)) * 8)
    const brow = 0.05 * gauss(u, v - 0.17, 0.2, 0.035)
    const nose = 0.11 * gauss(u, v + 0.02, 0.038, 0.1) + 0.05 * gauss(u, v + 0.1, 0.06, 0.035)
    const cheeks = 0.035 * (gauss(u - 0.2, v + 0.06, 0.07, 0.07) + gauss(u + 0.2, v + 0.06, 0.07, 0.07))
    const chin = 0.04 * gauss(u, v + 0.46, 0.12, 0.06)
    const eyes = 0.12 * (gauss(u - 0.14, v - 0.08, 0.058, 0.042) + gauss(u + 0.14, v - 0.08, 0.058, 0.042))
    const mouth = 0.17 * gauss(u, v + 0.3, 0.07, 0.085)
    const lips = 0.025 * Math.exp(-(((Math.hypot(u / 0.07, (v + 0.3) / 0.085) - 1.25) / 0.35) ** 2)) * (e < 1 ? 1 : 0)
    const h = Math.max(0, dome + skirt + brow + nose + cheeks + chin + lips - eyes - mouth)
    pos.setZ(i, h)
    cav[i] = Math.min(1, (eyes + mouth) / 0.12)
  }
  g.setAttribute('aCav', new THREE.BufferAttribute(cav, 1))
  g.computeVertexNormals()
  return g
}

function makeFaceMaterial(u: MazeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      ${MAZE_COMMON}
      attribute float aPush; attribute float aCav;
      varying vec3 vW; varying vec3 vN; varying float vDist; varying float vCav; varying float vPush;
      void main() {
        vec3 p = position;
        p.z *= aPush;
        vec3 n = normalize(mix(vec3(0.0, 0.0, 1.0), normal, aPush));
        vec4 w = instanceMatrix * vec4(p, 1.0);
        vec3 wallN = normalize(mat3(instanceMatrix) * vec3(0.0, 0.0, 1.0));
        n = normalize(mat3(instanceMatrix) * n);
        w = modelMatrix * w;
        // breathe exactly like the wall it grows out of
        float b = sin(uTime * 0.5 + w.y * 0.12 + w.z * 0.06) * 0.5 + 0.5;
        w.xyz += wallN * b * 0.45 * uAgitation;
        vW = w.xyz; vN = n; vCav = aCav; vPush = aPush;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vW; varying vec3 vN; varying float vDist; varying float vCav; varying float vPush;
      void main() {
        vec3 n = normalize(vN);
        float grit = fbm(vW * 1.3) * 0.6 + vnoise(vW * 7.0) * 0.4;
        vec3 base = vec3(0.22, 0.22, 0.21) * (0.6 + 0.55 * grit);
        // the same stone and light as the wall it pushes out of, plus a cold rim so it reads
        vec3 v = normalize(cameraPosition - vW);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = base * stoneLight(n, vW) * 1.9 + vec3(0.55, 0.06, 0.04) * rim * 0.5 * vPush * uAgitation;
        // hollow eyes and mouth: black, with the faintest ember deep inside
        float hollow = smoothstep(0.15, 0.9, vCav) * vPush;
        col = mix(col, ember() * 0.18 * uAgitation, hollow * 0.92);
        col = mix(max(col, vec3(0.0)), uFog, smoothstep(uFogNear, uFogFar, vDist));
        gl_FragColor = vec4(min(col, vec3(6.0)), 1.0);
      }`,
  })
}

export function WallFaces({ uniforms, faces, push }: { uniforms: MazeUniforms; faces: FaceSpot[]; push: RefObject<Float32Array> }) {
  const geometry = useMemo(() => {
    const g = faceGeometry()
    g.setAttribute('aPush', new THREE.InstancedBufferAttribute(new Float32Array(faces.length), 1))
    return g
  }, [faces.length])
  const material = useMemo(() => makeFaceMaterial(uniforms), [uniforms])
  const ref = useRef<THREE.InstancedMesh>(null)
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    faces.forEach((f, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(f.nx, f.nz))
      m.compose(new THREE.Vector3(f.x, f.y, f.z), q, new THREE.Vector3(f.size, f.size, f.size))
      mesh.setMatrixAt(i, m)
    })
    mesh.instanceMatrix.needsUpdate = true
  }, [faces])
  useFrame(() => {
    const attr = geometry.getAttribute('aPush') as THREE.InstancedBufferAttribute
    const src = push.current
    if (!src) return
    ;(attr.array as Float32Array).set(src)
    attr.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geometry, material, faces.length]} frustumCulled={false} />
}
