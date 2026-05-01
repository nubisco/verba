import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const localeDir = join(__dirname, '../src/locales/en')
const output = {}

for (const file of readdirSync(localeDir)) {
  if (!file.endsWith('.json')) continue
  const ns = file.replace('.json', '')
  const data = JSON.parse(readFileSync(join(localeDir, file), 'utf8'))

  function flatten(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k
      if (typeof v === 'object' && v !== null) flatten(v, key)
      else output[`${ns}.${key}`] = v
    }
  }
  flatten(data)
}

writeFileSync(join(__dirname, '../src/locales/en.json'), JSON.stringify(output, null, 2))
console.log(`Exported ${Object.keys(output).length} keys to en.json`)
