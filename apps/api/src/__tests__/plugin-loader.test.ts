import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bus } from '../events.js'

// We test loadPlugins by pointing it at a temp virtual directory.
// Since loadPlugins uses dynamic import() by file URL, we mock fs and import.

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
}))

import { readdir } from 'node:fs/promises'
import { loadPlugins } from '../plugin-loader.js'

beforeEach(() => {
  bus.removeAllListeners()
  vi.clearAllMocks()
})

describe('loadPlugins', () => {
  it('does nothing when pluginsDir is undefined', async () => {
    await expect(loadPlugins(undefined)).resolves.toBeUndefined()
    expect(readdir).not.toHaveBeenCalled()
  })

  it('warns and returns when directory does not exist', async () => {
    vi.mocked(readdir).mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await loadPlugins('/nonexistent')
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'))
    warn.mockRestore()
  })

  it('skips non-.js files', async () => {
    vi.mocked(readdir).mockResolvedValue(['readme.md', 'image.png'] as never)
    // no import attempted, should not throw
    await expect(loadPlugins('/plugins')).resolves.toBeUndefined()
  })

  it('is fail-safe: plugin load error does not throw', async () => {
    vi.mocked(readdir).mockResolvedValue(['bad.js'] as never)
    // dynamic import will fail since /plugins/bad.js doesn't exist on disk
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadPlugins('/nonexistent')).resolves.toBeUndefined()
    errorSpy.mockRestore()
  })
})
