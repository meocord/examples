// Prints the bots as a JSON array, for CI's matrix, and fails when .github/dependabot.yml's npm entry doesn't list
// exactly those folders, so a new bot isn't left without dependency updates.
//
//   node scripts/bots.mjs
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bots, ROOT } from './lib/bots.mjs'

const found = bots()
const config = readFileSync(path.join(ROOT, '.github', 'dependabot.yml'), 'utf8')
// The `directories` list of the npm entry: the indented `- /<folder>` lines that follow it
const npm = config.slice(config.indexOf('package-ecosystem: npm'))
const block = npm.slice(npm.indexOf('directories:'), npm.indexOf('\n    schedule:'))
const listed = [...block.matchAll(/^\s+- ['"]?\/([^'"\s]+)['"]?$/gm)].map(match => match[1]).sort()

if (JSON.stringify(found) !== JSON.stringify(listed)) {
  console.error(
    `.github/dependabot.yml lists ${JSON.stringify(listed)} for npm, but the bots are ${JSON.stringify(found)}.`,
  )
  process.exit(1)
}
console.log(JSON.stringify(found))
