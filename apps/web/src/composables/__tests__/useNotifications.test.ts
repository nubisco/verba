import { afterEach, describe, expect, it } from 'vitest'
import { useToast } from '@nubisco/ui'
import { useNotifications } from '../useNotifications'

// The toasts used to live in a Verba store rendered by a hand-built stack.
// They now go through @nubisco/ui's queue (rendered by NbToaster), and these
// pin the timings Verba kept while moving.
describe('useNotifications', () => {
  afterEach(() => useToast().dismissAll())

  it('queues a toast on the shared @nubisco/ui queue', () => {
    useNotifications().success('Saved', { title: 'Key' })
    const [record] = useToast().items.value
    expect(record).toMatchObject({ variant: 'success', message: 'Saved', title: 'Key' })
  })

  it('closes everything but errors after four seconds', () => {
    const n = useNotifications()
    n.success('a')
    n.info('b')
    n.warning('c')
    expect(useToast().items.value.map((r) => r.duration)).toEqual([4000, 4000, 4000])
  })

  it('keeps an error until it is dismissed, unless told otherwise', () => {
    const n = useNotifications()
    n.error('failed')
    n.error('brief', { duration: 2000 })
    expect(useToast().items.value.map((r) => r.duration)).toEqual([0, 2000])
  })

  it('dismisses by the id it returned, and clears the lot', () => {
    const n = useNotifications()
    const id = n.info('one')
    n.info('two')
    n.dismiss(id)
    expect(useToast().items.value.map((r) => r.message)).toEqual(['two'])
    n.clear()
    expect(useToast().items.value).toHaveLength(0)
  })
})
