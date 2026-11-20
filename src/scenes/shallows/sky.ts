import * as THREE from 'three'

/** Sun direction for the dawn: low on the horizon, ahead and to the left of the Tree. */
export const SUN_DIR = new THREE.Vector3(-0.35, 0.12, -1).normalize()
export const FOG_COLOR = new THREE.Color('#d98fae')

/** GLSL dawn sky shared by the dome and the water reflection (needs NOISE_GLSL first). */
export const DAWN_SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
vec3 dawnSkyUpper(vec3 d, float t);
/** Below the horizon the dome shows a darkened mirror of the sky (the sea reflects it). */
vec3 dawnSky(vec3 d, float t) {
  if (d.y >= 0.0) return dawnSkyUpper(d, t);
  vec3 m = dawnSkyUpper(vec3(d.x, -d.y, d.z), t);
  return m * mix(vec3(0.42, 0.3, 0.52), vec3(0.16, 0.1, 0.26), smoothstep(0.0, 0.35, -d.y));
}
vec3 dawnSkyUpper(vec3 d, float t) {
  float h = d.y;
  vec3 horizon = vec3(1.0, 0.66, 0.40);
  vec3 rose = vec3(0.86, 0.38, 0.56);
  vec3 violet = vec3(0.42, 0.26, 0.58);
  vec3 zenith = vec3(0.10, 0.20, 0.42);
  vec3 col = mix(horizon, rose, smoothstep(0.0, 0.12, h));
  col = mix(col, violet, smoothstep(0.1, 0.38, h));
  col = mix(col, zenith, smoothstep(0.32, 0.9, h));

  // soft clouds near the horizon
  vec2 cp = d.xz / (abs(d.y) + 0.18);
  float cl = fbm(vec3(cp * 0.55, t * 0.01));
  float cloudMask = smoothstep(0.45, 0.8, cl) * (1.0 - smoothstep(0.04, 0.42, abs(h - 0.12)));
  col = mix(col, vec3(1.0, 0.86, 0.86), cloudMask * 0.55);

  // aurora ribbons high in the sky
  float band = sin(d.x * 3.2 + fbm(d * 2.2 + vec3(t * 0.03)) * 5.0 + t * 0.06);
  float ribbon = smoothstep(0.82, 1.0, band) * smoothstep(0.22, 0.5, h) * (1.0 - smoothstep(0.85, 1.0, h));
  vec3 auroraCol = mix(vec3(0.35, 1.0, 0.85), vec3(0.75, 0.45, 1.0), 0.5 + 0.5 * sin(d.z * 4.0 + t * 0.1));
  col += auroraCol * ribbon * 0.9;

  // the sun: bright core, warm halo
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += vec3(1.0, 0.86, 0.62) * pow(sd, 900.0) * 9.0;
  col += vec3(1.0, 0.70, 0.50) * pow(sd, 14.0) * 0.55;
  col += vec3(1.0, 0.6, 0.55) * pow(sd, 3.0) * 0.15;
  return col;
}
`
