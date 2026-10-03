// Shows where each bot has drifted from what `meocord create` generates today: the tooling and config files the
// template owns, and package.json's scripts and dependencies. A bot's own code, README and lockfile are its own and
// are not compared. A difference a bot means to keep is accepted in template-drift.json, with the reason; with
// --check, any other difference, or an accepted one that no longer exists, exits 1.
//
//   node scripts/template-drift.mjs [--check] [--version <meocord version>] [bot-folder...]
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bots, ROOT } from './lib/bots.mjs'
import { olderFloor } from './lib/versions.mjs'

// The files `meocord create` writes that a bot keeps as generated unless it has a reason not to
const TEMPLATE_FILES = [
  '.env.example',
  '.gitignore',
  '.prettierrc.mjs',
  'eslint.config.ts',
  'meocord.config.ts',
  'src/main.ts',
  'src/types/assets.d.ts',
  'src/types/theme.d.ts',
  'tsconfig.eslint.json',
  'tsconfig.json',
  'tsconfig.test.json',
  'vitest.config.ts',
  'vitest.setup.ts',
]
// package.json's fields the template decides; name, version and description are the bot's
const PACKAGE_FIELDS = ['type', 'private', 'engines', 'scripts', 'dependencies', 'devDependencies']
const ACCEPTED_FILE = 'template-drift.json'

const args = process.argv.slice(2)
const check = args.includes('--check')
const versionAt = args.indexOf('--version')
const version = versionAt >= 0 ? args[versionAt + 1] : 'latest'
const named = args.filter((arg, i) => !arg.startsWith('--') && i !== versionAt + 1)
const accepted = JSON.parse(readFileSync(path.join(ROOT, ACCEPTED_FILE), 'utf8'))

/** Generates a fresh app with the bot's name, so the files that name the app compare as equal. */
function generate(name, into) {
  const result = spawnSync('npx', ['-y', `meocord@${version}`, 'create', name, '--use-npm'], {
    cwd: into,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) throw new Error(`meocord create ${name} failed:\n${result.stdout}${result.stderr}`)
  return path.join(into, name)
}

/** A unified diff of two texts, from git, which needs no repository for --no-index. */
function diff(generated, own, file, label) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'meocord-diff-'))
  try {
    const [a, b] = ['generated', label].map(side => path.join(scratch, side))
    spawnSync('mkdir', ['-p', a, b])
    const write = (dir, text) => spawnSync('sh', ['-c', 'cat > "$1"', 'sh', path.join(dir, 'file')], { input: text })
    write(a, generated)
    write(b, own)
    const result = spawnSync('git', ['diff', '--no-index', '--no-color', path.join(a, 'file'), path.join(b, 'file')], {
      encoding: 'utf8',
    })
    // Named by the file rather than the scratch paths, and without the index line, whose hashes add nothing
    const inner = dir => `${dir.replace(/^[\\/]+/, '')}/file`
    return result.stdout
      .replaceAll(inner(a), `generated/${file}`)
      .replaceAll(inner(b), `${label}/${file}`)
      .split('\n')
      .filter(line => !line.startsWith('index '))
      .join('\n')
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

/** What identifies an accepted diff: its hunks, so a further change to either side makes it a new difference. */
const diffHash = text =>
  createHash('sha256')
    .update(text.slice(text.indexOf('\n@@')))
    .digest('hex')
    .slice(0, 12)

/** The .env.example without the keys the bot accepts adding, and the comment lines directly above them. */
function withoutKeys(text, keys) {
  const out = []
  let comments = []
  for (const line of text.split('\n')) {
    if (line.startsWith('#')) {
      comments.push(line)
      continue
    }
    const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1]
    if (!(key && keys.includes(key))) out.push(...comments, line)
    comments = []
  }
  return [...out, ...comments].join('\n')
}

const envKeys = text => [...text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)=/gm)].map(match => match[1])

/** How to accept a difference, as the JSON to add under the bot in template-drift.json. */
const acceptHint = (name, entry) =>
  `  If the difference is intended, accept it in ${ACCEPTED_FILE}, under "${name}":\n    ${JSON.stringify(entry)}`

/** The problems with one template file: differences not accepted, and accepted ones that no longer exist. */
function fileProblems(name, file, generated, own) {
  const rule = accepted[name]?.[file] ?? {}
  const keys = Object.keys(rule.keys ?? {})
  const problems = []

  if (keys.length) {
    const ownKeys = envKeys(own)
    const generatedKeys = envKeys(generated)
    for (const key of keys) {
      if (!ownKeys.includes(key))
        problems.push(`${file}: accepts the key ${key}, which the bot no longer has. Remove it.`)
      else if (generatedKeys.includes(key))
        problems.push(`${file}: accepts the key ${key}, which the template now generates. Remove it.`)
    }
  }

  const rest = keys.length ? withoutKeys(own, keys) : own
  if (rest === generated) {
    if (rule.diff) problems.push(`${file}: accepts a diff, but the file matches the template now. Remove it.`)
    return problems
  }
  const text = diff(generated, rest, file, name)
  const hash = diffHash(text)
  if (rule.diff?.hash === hash) return problems
  const added = file === '.env.example' ? envKeys(rest).filter(key => !envKeys(generated).includes(key)) : []
  const hint = added.length
    ? acceptHint(name, { [file]: { keys: Object.fromEntries(added.map(key => [key, '<what the bot reads it for>'])) } })
    : acceptHint(name, { [file]: { diff: { hash, why: '<why the bot differs>' } } })
  problems.push(
    `${file}: differs from the template${rule.diff ? ', and not as the accepted diff does' : ''}:\n${text}\n${hint}`,
  )
  return problems
}

/** The problems with package.json's template fields, each named by its path, such as scripts.start. */
function packageProblems(name, generatedDir, botDir) {
  const generated = JSON.parse(readFileSync(path.join(generatedDir, 'package.json'), 'utf8'))
  const bot = JSON.parse(readFileSync(path.join(botDir, 'package.json'), 'utf8'))
  const acceptedFields = accepted[name]?.['package.json']?.fields ?? {}
  const differing = new Map()
  for (const field of PACKAGE_FIELDS) {
    const a = generated[field]
    const b = bot[field]
    if (typeof a === 'object' && typeof b === 'object' && a && b) {
      // A dependency the bot keeps at a newer floor than the template's, as Dependabot raises it, hasn't drifted
      const ranges = field === 'dependencies' || field === 'devDependencies'
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const same =
          a[key] === b[key] || (ranges && a[key] !== undefined && b[key] !== undefined && !olderFloor(a[key], b[key]))
        if (!same) differing.set(`${field}.${key}`, [a[key], b[key]])
      }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) differing.set(field, [a, b])
  }
  const show = value => (value === undefined ? '(none)' : JSON.stringify(value))
  const problems = []
  for (const [field, [a, b]] of [...differing].sort()) {
    if (acceptedFields[field]) continue
    problems.push(
      `package.json: ${field} is ${show(b)} where the template has ${show(a)}.\n` +
        acceptHint(name, { 'package.json': { fields: { [field]: '<why the bot differs>' } } }),
    )
  }
  for (const field of Object.keys(acceptedFields)) {
    if (!differing.has(field))
      problems.push(`package.json: accepts ${field}, which matches the template now. Remove it.`)
  }
  return problems
}

const targets = named.length ? named : bots()
const scratch = mkdtempSync(path.join(tmpdir(), 'meocord-drift-'))
let failed = false
try {
  for (const name of targets) {
    const botDir = path.join(ROOT, name)
    const generatedDir = generate(name, scratch)
    const problems = packageProblems(name, generatedDir, botDir)
    for (const file of TEMPLATE_FILES) {
      const generated = path.join(generatedDir, file)
      const own = path.join(botDir, file)
      if (!existsSync(generated)) continue
      if (!existsSync(own)) problems.push(`${file}: the template generates it, and the bot doesn't have it.`)
      else problems.push(...fileProblems(name, file, readFileSync(generated, 'utf8'), readFileSync(own, 'utf8')))
    }
    console.log(`## ${name} against meocord@${version}\n`)
    console.log(problems.length ? `${problems.join('\n\n')}\n` : 'No drift beyond what template-drift.json accepts.\n')
    failed ||= problems.length > 0
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
process.exit(check && failed ? 1 : 0)
