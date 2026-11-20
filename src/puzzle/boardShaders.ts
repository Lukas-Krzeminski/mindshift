import * as THREE from 'three'

/** Holographic backplate: faint cell grid, soft panel glow, and the timer "fuse" running around the frame. */
export function makePanelMaterial(size: number, margin: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: size },
      uMargin: { value: margin },
      uProgress: { value: 1 },
      uFrame: { value: new THREE.Color('#4fe3ff') },
      uWarn: { value: 0 },
      uOpacity: { value: 1 },
      uFire: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime, uSize, uMargin, uProgress, uWarn, uOpacity, uFire;
      uniform vec3 uFrame;
      varying vec2 vUv;
      float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        float total = uSize + 2.0 * uMargin;
        vec2 p = vUv * total - uMargin;               // board cell space: 0..uSize
        vec2 c = p - uSize * 0.5;                     // centered
        float inside = step(0.0, p.x) * step(p.x, uSize) * step(0.0, p.y) * step(p.y, uSize);

        // grid lines at cell boundaries
        vec2 d = abs(p - floor(p + 0.5));
        float grid = (1.0 - smoothstep(0.0, 0.03, min(d.x, d.y))) * inside;

        // soft panel glow, brighter toward the middle
        float panel = (1.0 - smoothstep(0.0, uSize * 0.75, length(c))) * 0.18;

        // travelling scan band
        float scan = smoothstep(0.0, 0.25, 0.25 - abs(fract(p.y / uSize * 0.5 - uTime * 0.08) - 0.5)) * inside * 0.25;

        // frame + timer fuse (clockwise from top-centre)
        float sd = sdRoundBox(c, vec2(uSize * 0.5 + 0.32), 0.45);
        float frame = 1.0 - smoothstep(0.0, 0.06, abs(sd));
        float halo = (1.0 - smoothstep(0.0, 0.5, abs(sd))) * 0.25;
        float ang = atan(c.x, c.y);                   // 0 at top, increases clockwise
        float frac = fract(ang / 6.2831853 + 1.0);
        float lit = step(frac, uProgress);
        vec3 frameCol = mix(uFrame, vec3(1.0, 0.7, 0.22), uWarn);

        vec3 col = vec3(0.12, 0.16, 0.42) * panel
                 + vec3(0.35, 0.55, 1.0) * grid * 0.6
                 + vec3(0.4, 0.6, 1.0) * scan
                 + frameCol * (frame * mix(0.12, 2.4, lit) + halo * lit)
                 + vec3(0.8, 0.9, 1.0) * uFire * (panel * 2.0 + grid);
        gl_FragColor = vec4(col * uOpacity, 1.0);
      }
    `,
  })
}

/**
 * Dark glass backing behind the lattice (normal blending): blocks out the busy nebula so
 * nodes, gates and paths read with strong contrast, even on a washed-out projector.
 */
export function makePlateMaterial(size: number, margin: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uSize: { value: size }, uMargin: { value: margin }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSize, uMargin, uOpacity;
      varying vec2 vUv;
      float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        float total = uSize + 2.0 * uMargin;
        vec2 p = vUv * total - uMargin;
        vec2 c = p - uSize * 0.5;
        float sd = sdRoundBox(c, vec2(uSize * 0.5 + 0.32), 0.45);
        float plate = 1.0 - smoothstep(-0.1, 0.55, sd);
        // per-cell tiles: slightly lighter rounded squares so the grid reads as distinct sockets
        vec2 f = fract(p) - 0.5;
        float inside = step(0.0, p.x) * step(p.x, uSize) * step(0.0, p.y) * step(p.y, uSize);
        float tile = (1.0 - smoothstep(0.34, 0.42, max(abs(f.x), abs(f.y)))) * inside;
        vec3 col = mix(vec3(0.010, 0.012, 0.035), vec3(0.035, 0.045, 0.11), tile);
        gl_FragColor = vec4(col, plate * 0.9 * uOpacity);
      }
    `,
  })
}

/** Neural signal path: glowing core, fresnel rim and pulses travelling along the route. */
export function makePathMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uComplete: { value: 0 },
      uLen: { value: 1 },
      uFire: { value: 0 },
      uDim: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        vN = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uComplete, uLen, uFire, uDim;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main() {
        float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float s = vUv.x * uLen;
        float speed = mix(1.1, 3.2, uComplete);
        float pulse = pow(max(0.0, sin((s * 0.9 - uTime * speed) * 3.14159)), 18.0);
        float core = 0.85 + 0.9 * fres;
        vec3 col = uColor * (core * mix(1.25, 2.1, uComplete) + pulse * mix(1.2, 3.4, uComplete))
                 + vec3(1.0) * pulse * 0.6 * uComplete
                 + uColor * uFire * 3.0;
        gl_FragColor = vec4(col * uDim, 1.0);
      }
    `,
  })
}

/** Soft radial glow sprite (hover highlight, gate cores). */
export function makeGlowMaterial(color: string, intensity = 1.5): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uIntensity; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2); gl_FragColor = vec4(uColor * a * uIntensity, 1.0); }
    `,
  })
}
