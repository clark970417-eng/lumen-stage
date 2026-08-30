import test from 'node:test'
import assert from 'node:assert/strict'
import { translate, type Locale, type MessageKey } from '../src/i18n.ts'

const ONBOARDING_COPY: MessageKey[] = [
  'tour.desktop.1.title', 'tour.desktop.1.body',
  'tour.desktop.2.title', 'tour.desktop.2.body',
  'tour.desktop.3.title', 'tour.desktop.3.body',
  'tour.desktop.4.title', 'tour.desktop.4.body',
  'tour.desktop.5.title', 'tour.desktop.5.body',
  'tour.mobile.1.title', 'tour.mobile.1.body',
  'tour.mobile.2.title', 'tour.mobile.2.body',
  'tour.mobile.3.title', 'tour.mobile.3.body',
  'tour.mobile.4.title', 'tour.mobile.4.body',
  'tour.mobile.5.title', 'tour.mobile.5.body',
  'tour.taskTry', 'tour.taskDone',
]

test('onboarding copy is complete in every supported language', () => {
  for (const locale of ['en', 'zh', 'ja'] as Locale[]) {
    for (const key of ONBOARDING_COPY) {
      const copy = translate(locale, key)
      assert.notEqual(copy, key, `${locale} copy missing for ${key}`)
      assert.ok(copy.trim().length > 3, `${locale} copy is too short for ${key}`)
    }
  }
})
