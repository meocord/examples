// Prints CI's matrix as JSON: each bot with the meocord its lockfile pins and with `latest` on the newest Node LTS,
// with `latest` on the oldest Node meocord's engines field allows, and with the `beta` release while it is newer than `latest`.
// It fails when .github/dependabot.yml's npm entry doesn't list exactly the bots, so a new one isn't left without
// dependency updates.
//
//   node scripts/bots.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bots, ROOT } from './lib/bots.mjs'
import { compareVersions, engineFloor } from './lib/versions.mjs'

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

const npmView = field =>
  JSON.parse(execFileSync('npm', ['view', 'meocord@latest', field, '--json'], { encoding: 'utf8' }))
const tags = npmView('dist-tags')
// The oldest Node a bot must run on, as the newest meocord's engines field says
const nodeFloor = engineFloor(npmView('engines').node)
const rows = [
  { meocord: 'pinned', node: 'lts/*' },
  { meocord: 'latest', node: 'lts/*' },
  { meocord: 'latest', node: nodeFloor },
  ...(tags.beta && compareVersions(tags.beta, tags.latest) > 0 ? [{ meocord: 'beta', node: 'lts/*' }] : []),
]
console.log(JSON.stringify(found.flatMap(bot => rows.map(row => ({ bot, ...row })))))
