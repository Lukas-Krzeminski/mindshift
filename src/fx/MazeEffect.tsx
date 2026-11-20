import { useMemo } from 'react'
import { Effect } from 'postprocessing'
import * as THREE from 'three'

/** Live value set by the maze scene each frame (0 = off). */
export const mazeFxState = { amount: 0 }

const FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uAmount;
  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 c = uv - 0.5;
    // red/cyan fringing grows toward the edges
    vec2 off = c * 0.014 * uAmount;
    vec3 col;
    col.r = texture2D(inputBuffer, uv + off).r;
    col.g = inputColor.g;
    col.b = texture2D(inputBuffer, uv - off).b;
    // blood grade: everything leans toward red, shadows crushed toward black
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 blood = vec3(l * 1.3, l * 0.34, l * 0.3);
    col = mix(col, blood, 0.5 * uAmount);
    col = mix(col, col * col * 1.8, 0.3 * uAmount);
    // darkness breathing in from the edges, slowly (about 0.4 Hz, low amplitude)
    float r = length(c * vec2(1.0, 0.8));
    float pulse = 0.5 + 0.5 * sin(uTime * 2.4);
    col *= 1.0 - smoothstep(0.28, 0.78, r) * (0.38 + 0.14 * pulse) * uAmount;
    outputColor = vec4(max(col, vec3(0.0)), inputColor.a);
  }
`

class MazeEffectImpl extends Effect {
  constructor() {
    super('MazeEffect', FRAG, {
      uniforms: new Map<string, THREE.Uniform>([
        ['uTime', new THREE.Uniform(0)],
        ['uAmount', new THREE.Uniform(0)],
      ]),
    })
  }
  update(_r: THREE.WebGLRenderer, _i: THREE.WebGLRenderTarget, dt?: number): void {
    const t = this.uniforms.get('uTime')!
    t.value = (t.value as number) + (dt ?? 0.016)
    this.uniforms.get('uAmount')!.value = mazeFxState.amount
  }
}

/**
 * Final safety clamp. Contrast grading can push near-black pixels below zero, and the
 * sRGB output conversion turns negative values into white blotches. This keeps colors >= 0.
 */
class ClampEffectImpl extends Effect {
  constructor() {
    super(
      'ClampEffect',
      /* glsl */ `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        c = vec3(c.r == c.r ? c.r : 0.0, c.g == c.g ? c.g : 0.0, c.b == c.b ? c.b : 0.0);
        outputColor = vec4(clamp(c, 0.0, 64.0), inputColor.a);
      }`,
    )
  }
}

export function ClampFX() {
  const effect = useMemo(() => new ClampEffectImpl(), [])
  return <primitive object={effect} dispose={null} />
}

export function MazeFX() {
  const effect = useMemo(() => new MazeEffectImpl(), [])
  return <primitive object={effect} dispose={null} />
}
