// Prints CI's matrix as JSON: each bot with the meocord its lockfile pins and with `latest` on the newest Node LTS,
// with `latest` on the oldest Node meocord supports, and with the `beta` release while it is newer than `latest`.
// It fails when .github/dependabot.yml's npm entry doesn't list exactly the bots, so a new one isn't left without
// dependency updates.
//
//   node scripts/bots.mjs
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { bots, ROOT } from './lib/bots.mjs'

// meocord's engines floor, the oldest Node a bot must run on
const NODE_FLOOR = '22.13'

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

/** Compares two versions by semver precedence: negative when a is older. */
function compareVersions(a, b) {
  const parse = version => {
    const [core, pre] = version.split('-', 2)
    return { core: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i]
  // A prerelease comes before its release
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const [p, q] = [x.pre[i], y.pre[i]]
    if (p === undefined || q === undefined) return p === undefined ? -1 : 1
    if (p === q) continue
    const numeric = /^\d+$/.test(p) && /^\d+$/.test(q)
    return numeric ? Number(p) - Number(q) : p < q ? -1 : 1
  }
  return 0
}

const tags = JSON.parse(execFileSync('npm', ['view', 'meocord', 'dist-tags', '--json'], { encoding: 'utf8' }))
const rows = [
  { meocord: 'pinned', node: 'lts/*' },
  { meocord: 'latest', node: 'lts/*' },
  { meocord: 'latest', node: NODE_FLOOR },
  ...(tags.beta && compareVersions(tags.beta, tags.latest) > 0 ? [{ meocord: 'beta', node: 'lts/*' }] : []),
]
console.log(JSON.stringify(found.flatMap(bot => rows.map(row => ({ bot, ...row })))))
