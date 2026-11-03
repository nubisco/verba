import { describe, expect, it, vi } from 'vitest'
import { notePlanLimit, noteWrite, onPlanLimit, onWrite } from '../planLimit'

describe('plan limit refusals', () => {
  const body = {
    error: "This account's plan allows 10 projects, and it has 10. Upgrade the plan to add more.",
    code: 'plan_limit',
    resource: 'projects',
    limit: 10,
    current: 10,
    adding: 1,
  }

  it('reaches every listener with the server’s words', () => {
    const heard = vi.fn()
    const stop = onPlanLimit(heard)
    notePlanLimit(402, body)
    expect(heard).toHaveBeenCalledWith(
      expect.objectContaining({ resource: 'projects', limit: 10, message: body.error }),
    )
    stop()
    notePlanLimit(402, body)
    expect(heard).toHaveBeenCalledTimes(1)
  })

  it('ignores any other error', () => {
    const heard = vi.fn()
    const stop = onPlanLimit(heard)
    notePlanLimit(402, { error: 'Payment Required', feature: 'sso' })
    notePlanLimit(400, body)
    notePlanLimit(402, null)
    expect(heard).not.toHaveBeenCalled()
    stop()
  })

  it('carries the read-only reason through', () => {
    const heard = vi.fn()
    const stop = onPlanLimit(heard)
    notePlanLimit(402, { ...body, readOnly: true, over: [{ resource: 'projects', limit: 1, current: 2 }] })
    expect(heard).toHaveBeenCalledWith(expect.objectContaining({ readOnly: true, over: [expect.any(Object)] }))
    stop()
  })

  it('tells the write listeners after an accepted write', () => {
    const heard = vi.fn()
    const stop = onWrite(heard)
    noteWrite()
    stop()
    noteWrite()
    expect(heard).toHaveBeenCalledTimes(1)
  })
})
