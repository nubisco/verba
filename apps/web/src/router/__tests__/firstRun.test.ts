import { describe, expect, it } from 'vitest'
import { firstRunRedirect } from '../firstRun'

// The API's /setup/status answers false on an instance that signs in through
// its identity provider only (VERBA_AUTH_MODE=platform), even with an empty
// database. These pin what the router does with each answer.
describe('firstRunRedirect', () => {
  it('sends nobody to the wizard when the instance needs no setup', () => {
    expect(firstRunRedirect('projects', false)).toBe('continue')
    expect(firstRunRedirect('dashboard', false)).toBe('continue')
  })

  it('sends a link to the wizard on to sign-in when there is nothing to set up', () => {
    expect(firstRunRedirect('setup', false)).toEqual({ path: '/login' })
  })

  it('always lets the sign-in page open', () => {
    expect(firstRunRedirect('login', true)).toBe('allow')
    expect(firstRunRedirect('login', false)).toBe('allow')
  })

  it('still sends an empty self-hosted instance to the wizard', () => {
    expect(firstRunRedirect('projects', true)).toEqual({ path: '/setup' })
    expect(firstRunRedirect('setup', true)).toBe('allow')
  })

  it('carries on as before when the API cannot be reached', () => {
    expect(firstRunRedirect('projects', null)).toBe('continue')
    expect(firstRunRedirect('setup', null)).toBe('allow')
  })
})
