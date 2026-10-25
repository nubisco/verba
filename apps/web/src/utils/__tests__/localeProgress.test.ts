import { describe, expect, it } from 'vitest'
import { localeProgressStatus } from '../localeProgress'

describe('localeProgressStatus', () => {
  it('is finished once every key is approved', () => {
    expect(localeProgressStatus({ approved: 9, total: 9 })).toBe('finished')
  })
  it('is active while keys are left, and for a locale with no keys', () => {
    expect(localeProgressStatus({ approved: 2, total: 9 })).toBe('active')
    expect(localeProgressStatus({ approved: 0, total: 0 })).toBe('active')
  })
})
