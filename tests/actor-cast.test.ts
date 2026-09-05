import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
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
