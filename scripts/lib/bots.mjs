import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..', '..')

/** Every folder at the repository's root whose package.json depends on meocord, by name. */
export function bots() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && existsSync(path.join(ROOT, entry.name, 'package.json')))
    .map(entry => entry.name)
    .filter(name =>
      Boolean(JSON.parse(readFileSync(path.join(ROOT, name, 'package.json'), 'utf8')).dependencies?.meocord),
    )
    .sort()
}
