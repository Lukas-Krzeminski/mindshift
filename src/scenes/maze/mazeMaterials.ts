import * as THREE from 'three'
import { NOISE_GLSL } from '../../shaders/noise'

/**
 * The labyrinth's look (after the user's references): weathered dark stone under a blood-red
 * moon, red smoke in the sky, embers glowing through cracks in the floor, red corridor lamps.
 * Every animation is slow (well under 1 Hz) and nothing flashes.
 */
export interface MazeUniforms {
  uTime: { value: number }
  /** 0..1 overall agitation (1 in the maze, falls with each breath). */
  uAgitation: { value: number }
  uFog: { value: THREE.Color }
  uFogNear: { value: number }
  uFogFar: { value: number }
  /** 0..1 warm light that floods in after the last breath. */
  uDawn: { value: number }
}

export function makeMazeUniforms(): MazeUniforms {
  return {
    uTime: { value: 0 },
    uAgitation: { value: 1 },
    uFog: { value: new THREE.Color('#1d0807') },
    uFogNear: { value: 8 },
    uFogFar: { value: 60 },
    uDawn: { value: 0 },
  }
}

export const MAZE_COMMON = /* glsl */ `
  uniform float uTime, uAgitation, uFogNear, uFogFar, uDawn;
  uniform vec3 uFog;
  ${NOISE_GLSL}
  vec3 acidA() { return vec3(0.6, 1.0, 0.16); }
  vec3 acidB() { return vec3(1.0, 0.16, 0.6); }
  vec3 arterial() { return vec3(0.75, 0.0, 0.1); }
  vec3 sodium() { return vec3(1.0, 0.68, 0.2); }
  vec3 moonRed() { return vec3(1.0, 0.2, 0.1); }
  vec3 ember() { return vec3(1.0, 0.3, 0.07); }
  vec3 warmth() { return vec3(1.0, 0.8, 0.55); }
  /** Stone lighting: cold dark ambient, red moonlight from ahead, ember glow rising from the floor. */
  vec3 stoneLight(vec3 n, vec3 w) {
    vec3 moonDir = normalize(vec3(-0.25, 0.6, -0.75));
    float moon = max(dot(n, moonDir), 0.0);
    float underGlow = exp(-max(w.y, 0.0) * 0.45) * (0.75 + 0.25 * sin(uTime * 0.5 + w.x * 0.21 + w.z * 0.17));
    vec3 light = vec3(0.08, 0.085, 0.1)
               + moonRed() * moon * (0.5 + 0.3 * uAgitation)
               + ember() * underGlow * (0.12 + 0.3 * uAgitation);
    vec3 calm = warmth() * (0.25 + 0.55 * max(dot(n, normalize(vec3(0.2, 0.8, 0.3))), 0.0)) + vec3(0.1);
    return mix(light, calm, uDawn);
  }
`

/** Weathered stone blocks; walls breathe and drip, blood seeps down them while Alex is agitated. */
export function makeConcreteMaterial(u: MazeUniforms, breathe = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    defines: breathe ? { BREATHE: 1 } : {},
    vertexShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vW; varying vec3 vN; varying float vDist;
      void main() {
        vec4 w = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          w = instanceMatrix * w;
          n = mat3(instanceMatrix) * n;
        #endif
        w = modelMatrix * w;
        n = normalize(mat3(modelMatrix) * n);
        #ifdef BREATHE
          float b = sin(uTime * 0.5 + w.y * 0.12 + w.z * 0.06) * 0.5 + 0.5;
          w.xyz += n * b * 0.3 * uAgitation;
          float drip = smoothstep(0.55, 1.0, vnoise(vec3(w.x * 0.4, 0.0, w.z * 0.4)));
          w.y -= uAgitation * drip * max(0.0, w.y - 5.0) * 0.06 * (0.6 + 0.4 * sin(uTime * 0.25 + w.z * 0.2));
        #endif
        vW = w.xyz;
        vN = n;
        vec4 mv = viewMatrix * w;
        vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vW; varying vec3 vN; varying float vDist;
      void main() {
        vec3 n = normalize(vN);
        bool floorFace = n.y > 0.5;
        vec2 uv = abs(n.x) > 0.5 ? vW.zy : (abs(n.z) > 0.5 ? vW.xy : vW.xz);
        float grit = fbm(vW * 1.1) * 0.6 + vnoise(vW * 6.0) * 0.4;
        float stain = fbm(vec3(uv * 0.18, 3.0));
        vec3 base = mix(vec3(0.17, 0.17, 0.17), vec3(0.08, 0.085, 0.09), stain) * (0.65 + 0.5 * grit);
        // stacked stone blocks with dark mortar
        vec2 blockSize = floorFace ? vec2(1.8, 1.8) : vec2(1.6, 0.8);
        vec2 cell = uv / blockSize;
        cell.x += floor(cell.y) * 0.5;
        vec2 g = abs(fract(cell) - 0.5);
        float mortar = smoothstep(0.44, 0.5, max(g.x, g.y));
        base *= 1.0 - mortar * 0.6;
        vec3 col = base * stoneLight(n, vW) * 1.7;

        // blood seeping down the walls
        if (!floorFace) {
          float seep = smoothstep(0.66, 0.95, fbm(vec3(vW.x * 0.22 + vW.z * 0.07, vW.y * 0.04 + uTime * 0.03, vW.z * 0.22)));
          col = mix(col, vec3(0.32, 0.0, 0.02), seep * 0.8 * uAgitation);
        }
        // embers glowing through cracks in the floor
        if (floorFace) {
          float f = fbm(vec3(vW.xz * 0.22, 1.7));
          float crack = 1.0 - smoothstep(0.0, 0.035, abs(f - 0.5));
          float pulse = 0.7 + 0.3 * sin(uTime * 0.45 + vW.x * 0.3);
          col += ember() * crack * pulse * (0.4 + 1.0 * uAgitation) * (1.0 - uDawn);
        }
        col = mix(max(col, vec3(0.0)), uFog, smoothstep(uFogNear, uFogFar, vDist));
        gl_FragColor = vec4(min(col, vec3(6.0)), 1.0);
      }
    `,
  })
}

/** Dim red corridor lamps that breathe slowly (no flashing). */
export function makeStripMaterial(u: MazeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vW; varying float vDist;
      void main(){ vec4 w = vec4(position,1.0);
        #ifdef USE_INSTANCING
          w = instanceMatrix * w;
        #endif
        w = modelMatrix * w; vW = w.xyz; vec4 mv = viewMatrix * w; vDist = -mv.z; gl_Position = projectionMatrix * mv; }
    `,
    fragmentShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vW; varying float vDist;
      void main(){
        vec3 c = mix(vec3(1.0, 0.08, 0.04), ember(), 0.3 + 0.3 * sin(vW.z * 0.4));
        vec3 col = mix(c * (1.8 + 0.5 * sin(uTime * 0.5 + vW.z * 0.25 + vW.x * 0.3)), warmth() * 2.0, uDawn);
        col = mix(col, uFog, smoothstep(uFogNear, uFogFar * 1.2, vDist));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}

/** Blood sky: black smoke drifting over red cloud, a huge red moon ahead; warms once she has breathed. */
export function makeOvercastMaterial(u: MazeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(vec3(0.62, 0.1, 0.05), vec3(0.16, 0.02, 0.03), smoothstep(0.0, 0.55, h));
        col = mix(col, vec3(0.03, 0.0, 0.01), smoothstep(0.5, 0.95, h));
        // red cloud banks and black smoke
        vec2 sp = d.xz / (abs(h) + 0.22);
        float cl = fbm(vec3(sp * 0.7, uTime * 0.02));
        col = mix(col, vec3(0.9, 0.18, 0.08), smoothstep(0.55, 0.8, cl) * 0.45 * (1.0 - smoothstep(0.1, 0.6, h)));
        float smoke = smoothstep(0.5, 0.75, fbm(vec3(sp * 1.4 + vec2(uTime * 0.015, 0.0), 4.0)));
        col = mix(col, vec3(0.02, 0.01, 0.01), smoke * 0.7);
        // the moon: huge, low, ahead
        vec3 moonDir = normalize(vec3(-0.12, 0.2, -1.0));
        float md = acos(clamp(dot(d, moonDir), -1.0, 1.0));
        float disc = 1.0 - smoothstep(0.17, 0.175, md);
        float maria = fbm(d * 24.0);
        vec3 moon = mix(vec3(1.0, 0.42, 0.25), vec3(0.65, 0.12, 0.08), smoothstep(0.45, 0.7, maria));
        col = mix(col, moon * 1.25, disc * (1.0 - smoke * 0.6));
        col += vec3(1.0, 0.25, 0.1) * exp(-md * 7.0) * 0.45;
        // after the last breath, warm light floods the sky
        vec3 dawn = mix(vec3(1.0, 0.78, 0.5), vec3(0.85, 0.55, 0.6), smoothstep(0.0, 0.4, h));
        col = mix(col, dawn, uDawn * 0.85);
        col = mix(col, uFog, 0.3 * (1.0 - smoothstep(0.0, 0.2, h)));
        gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
      }
    `,
  })
}

/** Slowly turning red-black kaleidoscope on dead-end walls: disorienting, no flashing. */
export function makeKaleidoMaterial(u: MazeUniforms): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: u as unknown as Record<string, THREE.IUniform>,
    vertexShader: /* glsl */ `varying vec2 vUv; varying float vDist; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDist = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      ${MAZE_COMMON}
      varying vec2 vUv; varying float vDist;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0;
        float a = atan(p.y, p.x) + uTime * 0.05;
        float r = length(p);
        float seg = 6.2831 / 8.0;
        a = abs(mod(a, seg) - seg * 0.5);
        vec2 q = vec2(cos(a), sin(a)) * r;
        float f = fbm(vec3(q * 3.0, uTime * 0.04));
        vec3 col = mix(vec3(0.05, 0.0, 0.0), vec3(0.85, 0.05, 0.04), smoothstep(0.35, 0.65, f));
        col = mix(col, ember(), smoothstep(0.62, 0.8, fbm(vec3(q * 5.0 + 3.0, uTime * 0.03))));
        col *= 0.5 + 0.5 * sin(r * 14.0 - uTime * 0.4);
        col *= uAgitation;
        col = mix(max(col, vec3(0.0)), uFog, smoothstep(uFogNear, uFogFar * 1.3, vDist));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })
}
