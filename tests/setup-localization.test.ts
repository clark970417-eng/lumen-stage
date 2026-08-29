import test from 'node:test'
import assert from 'node:assert/strict'
import { translateCatalog } from '../src/i18n.ts'
import { SETUP_LIBRARY } from '../src/setups.ts'

test('every lighting setup description is localized in Chinese and Japanese', () => {
  for (const locale of ['zh', 'ja'] as const) {
    for (const setup of SETUP_LIBRARY) {
      const summary = translateCatalog(locale, `setup.${setup.id}.summary`, setup.summary)
      const note = translateCatalog(locale, `setup.${setup.id}.note`, setup.note)

      assert.notEqual(summary, setup.summary, `${locale} summary missing for ${setup.id}`)
      assert.notEqual(note, setup.note, `${locale} note missing for ${setup.id}`)
    }
  }
})
