// Shows where each bot has drifted from what `meocord create` generates today: the tooling and config files the
// template owns, and package.json's scripts and dependencies. A bot's own code, README and lockfile are its own and
// are not compared. It reports and exits 0; pass --check to exit 1 when anything differs.
//
//   node scripts/template-drift.mjs [--check] [--version <meocord version>] [bot-folder...]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { bots, ROOT } from './lib/bots.mjs'

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

const args = process.argv.slice(2)
const check = args.includes('--check')
const versionAt = args.indexOf('--version')
const version = versionAt >= 0 ? args[versionAt + 1] : 'latest'
const named = args.filter((arg, i) => !arg.startsWith('--') && i !== versionAt + 1)

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

/** A unified diff of two files, from git, which needs no repository for --no-index. */
function diff(generatedDir, botDir, file, label) {
  const result = spawnSync(
    'git',
    [
      'diff',
      '--no-index',
      '--no-color',
      '--src-prefix=generated/',
      `--dst-prefix=${label}/`,
      path.join(generatedDir, file),
      path.join(botDir, file),
    ],
    { encoding: 'utf8' },
  )
  // Named by the file alone: git prints each absolute path after its prefix, without the leading separator
  const inner = dir => `${dir.replace(/^[\\/]+/, '')}/`
  return result.stdout.replaceAll(inner(generatedDir), '').replaceAll(inner(botDir), '')
}

/** The template's package.json fields that differ, with both values. */
function packageDrift(generatedDir, botDir) {
  const generated = JSON.parse(readFileSync(path.join(generatedDir, 'package.json'), 'utf8'))
  const bot = JSON.parse(readFileSync(path.join(botDir, 'package.json'), 'utf8'))
  const lines = []
  for (const field of PACKAGE_FIELDS) {
    const a = generated[field] ?? {}
    const b = bot[field] ?? {}
    if (typeof a !== 'object' || typeof b !== 'object') {
      if (JSON.stringify(a) !== JSON.stringify(b)) lines.push(`  ${field}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`)
      continue
    }
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (a[key] === b[key]) continue
      lines.push(
        `  ${field}.${key}: ${a[key] === undefined ? '(not generated)' : JSON.stringify(a[key])} → ${b[key] === undefined ? '(removed)' : JSON.stringify(b[key])}`,
      )
    }
  }
  return lines
}

const targets = named.length ? named : bots()
const scratch = mkdtempSync(path.join(tmpdir(), 'meocord-drift-'))
let drifted = false
try {
  for (const name of targets) {
    const botDir = path.join(ROOT, name)
    const generatedDir = generate(name, scratch)
    const report = []
    const fields = packageDrift(generatedDir, botDir)
    if (fields.length) report.push(`package.json:\n${fields.join('\n')}`)
    for (const file of TEMPLATE_FILES) {
      const generated = path.join(generatedDir, file)
      const own = path.join(botDir, file)
      if (!existsSync(generated)) continue
      if (!existsSync(own)) report.push(`${file}: not in the bot`)
      else if (readFileSync(generated, 'utf8') !== readFileSync(own, 'utf8'))
        report.push(diff(generatedDir, botDir, file, name))
    }
    console.log(`## ${name} against meocord@${version}\n`)
    console.log(report.length ? report.join('\n') : 'No drift.\n')
    drifted ||= report.length > 0
  }
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
process.exit(check && drifted ? 1 : 0)
