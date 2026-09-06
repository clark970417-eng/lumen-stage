import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { CAST, castMember, castMemberForUrl, defaultCastFor, MAX_SUBJECT_HEIGHT, MIN_SUBJECT_HEIGHT } from '../src/actorCast.ts'
import { appearanceIsBaked } from '../src/characterAssets.ts'
import { DEFAULT_PHYSIQUE } from '../src/physique.ts'

const local = (url: string) => 'public/' + url.replace(/^\/+/, '')

test('every actor in the cast is actually shipped', () => {
  // The catalogue and the files are edited apart, and a member pointing at a
  // model that is not there shows an empty studio with no error worth reading.
  for (const member of CAST) {
    assert.ok(existsSync(local(member.url)), `${member.id} has no model at ${member.url}`)
    assert.ok(existsSync(local(member.thumb)), `${member.id} has no thumbnail at ${member.thumb}`)
    const size = statSync(local(member.url)).size / 1048576
    assert.ok(size > 1 && size < 12, `${member.id} is ${size.toFixed(1)} MB, which is not a converted actor`)
  }
})

test('the cast is unambiguous', () => {
  assert.equal(new Set(CAST.map((m) => m.id)).size, CAST.length, 'two actors share an id')
  assert.equal(new Set(CAST.map((m) => m.url)).size, CAST.length, 'two actors share a model')
  assert.equal(new Set(CAST.map((m) => m.source)).size, CAST.length, 'two actors came from one avatar')
  for (const member of CAST) {
    assert.equal(castMember(member.id), member)
    assert.equal(castMemberForUrl(member.url), member)
  }
  assert.equal(castMember(null), undefined)
  assert.equal(castMember('nobody'), undefined)
})

test('the cast covers a real range of builds and heights', () => {
  // The point of casting more people is that the build controls cannot reshape
  // a photographed actor. A cast that is all one shape would not answer that.
  for (const sex of ['feminine', 'masculine'] as const) {
    // Robed actors are excluded: their waist figure measures an abaya or a
    // thobe, and a spread that leaned on those would be a claim about garments
    // dressed up as a claim about builds.
    const side = CAST.filter((m) => m.sex === sex && !m.child && !m.robed)
    assert.ok(side.length >= 4, `only ${side.length} adult ${sex} actors`)
    const waists = side.map((m) => m.waist)
    const spread = Math.max(...waists) / Math.min(...waists)
    assert.ok(spread > 1.1, `${sex} builds only span ${spread.toFixed(2)}×`)
  }
  const children = CAST.filter((m) => m.child)
  assert.equal(children.length, 2)
  const shortestAdult = Math.min(...CAST.filter((m) => !m.child).map((m) => m.height))
  for (const child of children) {
    assert.ok(child.height < shortestAdult - 0.15, `${child.id} is not child-sized`)
  }
})

test('a robed actor is marked as one', () => {
  // The flag is what keeps the build ordering honest, so it has to be on the
  // entries whose measurement is of cloth. An abaya measures nearly three
  // times the widest real waist in the cast; nothing unrobed comes close.
  const widestBody = Math.max(...CAST.filter((m) => !m.robed).map((m) => m.waist))
  for (const member of CAST) {
    if (member.waist > widestBody) {
      assert.equal(member.robed, true, `${member.id} is wider than any body and is not marked robed`)
    }
  }
  const robed = CAST.filter((m) => m.robed)
  assert.ok(robed.length >= 2, 'the cast has no robed silhouettes')
})

test('the whole cast is photographed, and an import is not', () => {
  for (const member of CAST) assert.equal(appearanceIsBaked(member.url), true, member.id)
  assert.equal(appearanceIsBaked('/models/someone-elses.glb'), false)
  assert.equal(appearanceIsBaked(null), false)
})

test('a project saved before casting still opens on the actor it had', () => {
  const feminine = { ...DEFAULT_PHYSIQUE, sex: 'feminine' as const }
  const masculine = { ...DEFAULT_PHYSIQUE, sex: 'masculine' as const }
  assert.equal(defaultCastFor(feminine, false).id, 'female')
  assert.equal(defaultCastFor(masculine, false).id, 'male')
  assert.equal(defaultCastFor(feminine, true).id, 'business-female')
  assert.equal(defaultCastFor(masculine, true).id, 'business-male')
})

test('every actor fits the height a project can store', () => {
  // Casting sets the subject height to the actor's own. The stored range used
  // to start at an adult's 1.45 m, so a project saved with a 1.43 m child came
  // back with the child standing at adult height and nothing said so.
  for (const member of CAST) {
    assert.ok(member.height >= MIN_SUBJECT_HEIGHT,
      `${member.id} is ${member.height} m, below the ${MIN_SUBJECT_HEIGHT} m a scene can hold`)
    assert.ok(member.height <= MAX_SUBJECT_HEIGHT, `${member.id} is taller than a scene can hold`)
  }
})

/** Bone lengths, read straight out of a GLB's node hierarchy. */
function skeletonOf(url: string): Record<string, number> {
  const buffer = readFileSync(local(url))
  let offset = 12
  let json: { nodes?: { name?: string; translation?: number[]; matrix?: number[] }[] } | null = null
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset)
    if (buffer.readUInt32LE(offset + 4) === 0x4E4F534A) {
      json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8'))
    }
    offset += 8 + length
  }
  const lengths: Record<string, number> = {}
  for (const node of json?.nodes ?? []) {
    if (!node.name?.startsWith('Bip01')) continue
    const t = node.translation ?? (node.matrix ? [node.matrix[12], node.matrix[13], node.matrix[14]] : null)
    if (t) lengths[node.name] = Math.round(Math.hypot(t[0], t[1], t[2]) * 100) / 100
  }
  return lengths
}

test('the cast stands on three skeletons, not sixteen', () => {
  // Rocketbox skins every adult avatar of a sex onto one skeleton, and the
  // children onto their own. That is what makes the solved pose library safe
  // to grow the cast against: a pose is joint angles landed by IK against a
  // set of bone lengths, so actors that share bone lengths cannot disagree
  // about where a hand goes. Measured across the whole cast, adults are
  // identical to their reference and children land within 3 cm of it.
  //
  // An actor arriving on a fourth skeleton breaks that guarantee silently —
  // every solved pose would have to be looked at again. This is the tripwire.
  // Re-run scripts/pose-audit.html across the cast if it ever fires.
  for (const sex of ['feminine', 'masculine'] as const) {
    const reference = skeletonOf(CAST.find((m) => m.sex === sex && !m.child)!.url)
    assert.ok(Object.keys(reference).length > 40, 'no skeleton read from the reference actor')
    for (const member of CAST.filter((m) => m.sex === sex && !m.child)) {
      assert.deepEqual(skeletonOf(member.url), reference,
        `${member.id} does not stand on the same skeleton as the rest of the ${sex} cast`)
    }
  }
  // The children have their own, and it is smaller everywhere it should be.
  for (const child of CAST.filter((m) => m.child)) {
    const bones = skeletonOf(child.url)
    const adult = skeletonOf(CAST.find((m) => m.sex === child.sex && !m.child)!.url)
    for (const limb of ['Bip01_L_Forearm', 'Bip01_L_Calf', 'Bip01_Neck']) {
      assert.ok(bones[limb] < adult[limb], `${child.id} has an adult ${limb}`)
    }
  }
})

test('every homepage cast member has a nonempty transparent preview', () => {
  for (const actor of CAST) {
    const preview = new URL(`../public/models/lumen-human/cast/transparent/${actor.id}.webp`, import.meta.url)
    assert.ok(existsSync(preview), `Missing transparent preview: ${actor.id}`)
    assert.ok(statSync(preview).size > 1000, `Empty preview: ${actor.id}`)
  }
})

test('no actor ships vertex colours', () => {
  // The Rocketbox exports carry a white vertex colour per vertex — three floats
  // that multiply to nothing. Stripping them is worth about 3 MB across the
  // cast, and worth guarding because it is invisible: nothing looks wrong when
  // the attribute comes back, it just costs the download and switches
  // `vertexColors` on for a material with no use for it.
  for (const member of CAST) {
    const buffer = readFileSync(local(member.url))
    let offset = 12
    let json: { meshes?: { primitives: { attributes: Record<string, number> }[] }[] } | null = null
    while (offset < buffer.length) {
      const length = buffer.readUInt32LE(offset)
      if (buffer.readUInt32LE(offset + 4) === 0x4E4F534A) {
        json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8'))
      }
      offset += 8 + length
    }
    for (const mesh of json?.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        assert.equal(primitive.attributes.COLOR_0, undefined,
          `${member.id} still carries vertex colours — run scripts/strip-vertex-colors.mjs`)
      }
    }
  }
})

test('no actor ships its skinning wider than it means', () => {
  // The converter writes every attribute as float32, which for these three is
  // the wrong container: joint indices never reach 80, weights live in [0, 1],
  // and the UVs are inside the map. Narrowing them is worth 7.3 MB across the
  // cast and costs the loader nothing — all three encodings are core glTF 2.0,
  // so there is no extension and no decoder involved.
  //
  // Worth guarding because it is silent. A newly converted actor arrives wide,
  // renders exactly the same, and just quietly costs half a megabyte more to
  // download. Run scripts/quantize-geometry.mjs on it.
  const UBYTE = 5121
  const USHORT = 5123
  for (const member of CAST) {
    const buffer = readFileSync(local(member.url))
    let offset = 12
    let json: {
      meshes?: { primitives: { attributes: Record<string, number> }[] }[]
      accessors?: { componentType: number; normalized?: boolean; max?: number[] }[]
    } | null = null
    while (offset < buffer.length) {
      const length = buffer.readUInt32LE(offset)
      if (buffer.readUInt32LE(offset + 4) === 0x4E4F534A) {
        json = JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString('utf8'))
      }
      offset += 8 + length
    }
    const accessors = json?.accessors ?? []
    for (const mesh of json?.meshes ?? []) {
      for (const primitive of mesh.primitives) {
        const joints = accessors[primitive.attributes.JOINTS_0]
        if (joints) {
          assert.equal(joints.componentType, UBYTE,
            `${member.id} stores joint indices wider than a byte — run scripts/quantize-geometry.mjs`)
        }
        const weights = accessors[primitive.attributes.WEIGHTS_0]
        if (weights) {
          assert.equal(weights.componentType, UBYTE,
            `${member.id} stores skin weights as floats — run scripts/quantize-geometry.mjs`)
          assert.equal(weights.normalized, true, `${member.id} has byte weights that are not normalized`)
        }
        const uv = accessors[primitive.attributes.TEXCOORD_0]
        // A UV set that runs past 1 tiles, and a normalized ushort cannot say
        // so. Those are left as floats on purpose, not overlooked.
        if (uv && !(uv.max ?? []).some((v) => v > 1)) {
          assert.equal(uv.componentType, USHORT,
            `${member.id} stores UVs inside the map as floats — run scripts/quantize-geometry.mjs`)
          assert.equal(uv.normalized, true, `${member.id} has ushort UVs that are not normalized`)
        }
      }
    }
  }
})
