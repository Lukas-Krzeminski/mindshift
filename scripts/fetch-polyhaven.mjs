// Downloads the approved CC0 Poly Haven assets into asset-src/polyhaven/<id>/ (git-ignored).
// Run: node scripts/fetch-polyhaven.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = join(ROOT, 'asset-src', 'polyhaven')
const HEADERS = { 'User-Agent': 'mindshift-classroom-game-asset-fetch' }

const MODELS = [
  'mid_century_lounge_chair',
  'modern_arm_chair_01',
  'side_table_01',
  'coffee_table_round_01',
  'potted_plant_01',
  'potted_plant_02',
  'vintage_oil_lamp',
]
const HDRIS = ['anniversary_lounge']

async function download(url, file) {
  if (existsSync(file)) return 0
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, buf)
  return buf.length
}

let total = 0
for (const id of MODELS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: HEADERS })).json()
  const gltf = files.gltf['1k'].gltf
  const dir = join(OUT, id)
  total += await download(gltf.url, join(dir, `${id}.gltf`))
  for (const [rel, inc] of Object.entries(gltf.include ?? {})) total += await download(inc.url, join(dir, rel))
  console.log(`- ${id}`)
}
for (const id of HDRIS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: HEADERS })).json()
  total += await download(files.hdri['1k'].hdr.url, join(OUT, 'hdri', `${id}_1k.hdr`))
  console.log(`- ${id} (hdri)`)
}
console.log(`downloaded ${(total / 1e6).toFixed(1)} MB -> ${OUT}`)
