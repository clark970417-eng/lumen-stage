import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPhotoAnalysisPrompt } from '../src/photoAnalysisPrompt.ts'

test('builds a social-image prompt with the evidence framework', () => {
  const prompt = buildPhotoAnalysisPrompt({
    notes: '著重柔光與膚質',
    sourceKind: 'social',
    dimensions: '2820 × 3760'
  })
  assert.match(prompt, /社群貼文匯入/)
  assert.match(prompt, /可見證據/)
  assert.match(prompt, /2820 × 3760/)
  assert.match(prompt, /著重柔光與膚質/)
})

test('limits user focus notes to 800 characters', () => {
  const prompt = buildPhotoAnalysisPrompt({ notes: `${'A'.repeat(800)}SHOULD_NOT_APPEAR` })
  assert.equal(prompt.includes('A'.repeat(800)), true)
  assert.equal(prompt.includes('SHOULD_NOT_APPEAR'), false)
})

test('does not place arbitrary dimensions or image data in the prompt', () => {
  const prompt = buildPhotoAnalysisPrompt({
    notes: '分析色彩',
    dimensions: 'data:image/jpeg;base64,PRIVATE_IMAGE_DATA'
  })
  assert.equal(prompt.includes('PRIVATE_IMAGE_DATA'), false)
})
