import { describe, expect, it } from 'vitest'
import { resolveSettingsTab } from '../useSettingsTab'

const tabs = [
  { id: 'general', label: 'General' },
  { id: 'members', label: 'Members' },
  { id: 'billing', label: 'Plan and billing' },
]

// Settings keep their tab in ?tab=. A link from before the tabs (?section=)
// is read the same way by the composable, and a tab folded into another lands
// on its new home.
describe('resolveSettingsTab', () => {
  it('opens the tab the URL names', () => {
    expect(resolveSettingsTab('members', tabs)).toBe('members')
  })

  it('opens the first tab when none is named', () => {
    expect(resolveSettingsTab(undefined, tabs)).toBe('general')
  })

  it('opens the first tab for one the person cannot see', () => {
    expect(resolveSettingsTab('plan', tabs)).toBe('general')
  })

  it('sends a moved tab to where it went', () => {
    expect(resolveSettingsTab('danger', tabs, { danger: 'general' })).toBe('general')
    expect(resolveSettingsTab('old', tabs, { old: 'billing' })).toBe('billing')
  })

  it('ignores a repeated query value', () => {
    expect(resolveSettingsTab(['members', 'billing'], tabs)).toBe('general')
  })
})
