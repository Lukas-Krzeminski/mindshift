// Converts raw downloads in asset-src/ into small, web-ready files in public/assets/.
// Run: npm run assets
// Sources (CC0, Quaternius): Universal Base Characters [Standard], Universal Animation Library [Standard].
import { readFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { NodeIO, getBounds } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, meshopt, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'asset-src', 'quaternius')
const OUT = join(ROOT, 'public', 'assets', 'characters')
const BODY_DIR = join(SRC, 'base-characters', 'Universal Base Characters[Standard]', 'Base Characters', 'Godot - UE')
const HAIR_DIR = join(SRC, 'base-characters', 'Universal Base Characters[Standard]', 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')
const ANIM_FILE = join(SRC, 'animation-library', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb')

/** Animation clips the game uses (everything else is dropped). */
const KEEP_CLIPS = new Set([
  'Idle_Loop',
  'Walk_Loop',
  'Jog_Fwd_Loop',
  'Sprint_Loop',
  'Jump_Start',
  'Jump_Loop',
  'Jump_Land',
  'Sitting_Idle_Loop',
  'Sitting_Talking_Loop',
  'Idle_Talking_Loop',
])

await MeshoptEncoder.ready
await MeshoptDecoder.ready
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })

/** Reads a .gltf whose image names don't always match the files on disk (e.g. "*_png.png"). */
async function readLenient(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'))
  const dir = dirname(file)
  const resources = {}
  const find = (uri) => {
    const candidates = [uri, uri.replace(/_png\.png$/, '.png'), uri.replace(/\.png$/, '_png.png')]
    for (const c of candidates) if (existsSync(join(dir, c))) return readFileSync(join(dir, c))
    console.warn(`  ! missing ${uri}; using a 1x1 placeholder`)
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  }
  for (const b of json.buffers ?? []) if (b.uri && !b.uri.startsWith('data:')) resources[b.uri] = readFileSync(join(dir, b.uri))
  for (const img of json.images ?? []) if (img.uri && !img.uri.startsWith('data:')) resources[img.uri] = find(img.uri)
  return io.readJSON({ json, resources })
}

function dropRoughnessMaps(doc) {
  for (const m of doc.getRoot().listMaterials()) m.setMetallicRoughnessTexture(null)
}

async function bakeCharacter(name, file, { textureSize = 1024 } = {}) {
  console.log(`- ${name}`)
  const doc = await readLenient(file)
  dropRoughnessMaps(doc)
  await doc.transform(
    weld(),
    dedup(),
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureSize, textureSize], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  )
  await io.write(join(OUT, `${name}.glb`), doc)
}

async function bakeAnimations() {
  console.log('- anims')
  const doc = await io.read(ANIM_FILE)
  const root = doc.getRoot()
  const names = root.listAnimations().map((a) => a.getName())
  for (const a of root.listAnimations()) if (!KEEP_CLIPS.has(a.getName())) a.dispose()
  for (const missing of KEEP_CLIPS) if (!names.includes(missing)) throw new Error(`clip ${missing} not found`)
  // Skeleton only: the mannequin mesh, its skin and materials are not needed.
  for (const node of root.listNodes()) {
    node.setMesh(null)
    node.setSkin(null)
  }
  for (const mesh of root.listMeshes()) mesh.dispose()
  for (const skin of root.listSkins()) skin.dispose()
  for (const mat of root.listMaterials()) mat.dispose()
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await io.write(join(OUT, 'anims.glb'), doc)
}

// ---------------------------------------------------------------------------
// Poly Haven props (CC0) -> public/assets/props/*.glb, HDRI -> public/assets/env/
// ---------------------------------------------------------------------------
const PH = join(ROOT, 'asset-src', 'polyhaven')
const PROPS_OUT = join(ROOT, 'public', 'assets', 'props')
const ENV_OUT = join(ROOT, 'public', 'assets', 'env')
const PROPS = {
  mid_century_lounge_chair: {},
  modern_arm_chair_01: {},
  side_table_01: {},
  coffee_table_round_01: {},
  potted_plant_01: { simplify: 0.22 },
  potted_plant_02: { simplify: 0.4 },
  vintage_oil_lamp: {},
}

async function bakeProp(id, { simplify: ratio } = {}) {
  const doc = await readLenient(join(PH, id, `${id}.gltf`))
  await MeshoptSimplifier.ready
  const steps = [dedup(), prune(), weld()]
  if (ratio) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.004 }))
  steps.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
  await doc.transform(...steps)
  const b = getBounds(doc.getRoot().listScenes()[0])
  const size = b.max.map((v, i) => (v - b.min[i]).toFixed(2))
  console.log(`- ${id}: size x/y/z = ${size.join(' / ')} m, min y = ${b.min[1].toFixed(2)}`)
  await io.write(join(PROPS_OUT, `${id}.glb`), doc)
}

const onlyProps = process.argv.includes('--props')
if (!onlyProps) {
  mkdirSync(OUT, { recursive: true })
  await bakeCharacter('alex-body', join(BODY_DIR, 'Superhero_Female_FullBody.gltf'))
  await bakeCharacter('therapist-body', join(BODY_DIR, 'Superhero_Male_FullBody.gltf'))
  await bakeCharacter('hair-long', join(HAIR_DIR, 'Hair_Long.gltf'), { textureSize: 512 })
  await bakeCharacter('hair-parted', join(HAIR_DIR, 'Hair_SimpleParted.gltf'), { textureSize: 512 })
  await bakeAnimations()
}
if (existsSync(PH)) {
  mkdirSync(PROPS_OUT, { recursive: true })
  mkdirSync(ENV_OUT, { recursive: true })
  for (const [id, opts] of Object.entries(PROPS)) if (existsSync(join(PH, id))) await bakeProp(id, opts)
  const hdr = join(PH, 'hdri', 'anniversary_lounge_1k.hdr')
  if (existsSync(hdr)) copyFileSync(hdr, join(ENV_OUT, 'anniversary_lounge_1k.hdr'))
}
console.log('done')
