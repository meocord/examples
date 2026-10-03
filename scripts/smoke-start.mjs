// Starts a built bot with no token and with a token Discord refuses, and checks that each run exits non-zero with
// MeoCord's own message. No real token is used: the second run sends a made-up one, which Discord answers with 401.
// Settings a bot checks as it starts, such as a channel id, come from scripts/smoke-env.json, with made-up values.
//
//   node scripts/smoke-start.mjs <bot-folder>
//
// SMOKE_TIME_LIMIT_MS sets how long a run may take before it counts as hung, 120000 by default.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const bot = process.argv[2]
if (!bot) {
  console.error('Usage: node scripts/smoke-start.mjs <bot-folder>')
  process.exit(2)
}
const cwd = path.resolve(bot)
const TIME_LIMIT_MS = Number(process.env.SMOKE_TIME_LIMIT_MS ?? 120_000)
const envFile = path.join(import.meta.dirname, 'smoke-env.json')
const settings = (existsSync(envFile) ? JSON.parse(readFileSync(envFile, 'utf8')) : {})[path.basename(cwd)] ?? {}

const cases = [
  { name: 'a missing token', token: undefined, expect: 'Discord token is missing' },
  { name: 'a token Discord refuses', token: 'not-a-real-token', expect: 'Discord refused the bot token' },
]

/** Runs `npm run start:prod` with the token set or unset, and resolves with its exit code and output. */
function start(token) {
  const env = { ...process.env, ...settings, NODE_ENV: 'production' }
  delete env.DISCORD_TOKEN
  if (token !== undefined) env.DISCORD_TOKEN = token
  return new Promise(resolve => {
    // In a process group of its own: npm starts the CLI, which starts the bot, and a hung run is ended as a whole,
    // rather than npm alone while the bot keeps the output open
    const child = spawn('npm', ['run', 'start:prod'], { cwd, env, detached: process.platform !== 'win32' })
    let output = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    let hung = false
    const timer = setTimeout(() => {
      hung = true
      try {
        process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGKILL')
      } catch {
        // Already gone
      }
    }, TIME_LIMIT_MS)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, hung, output })
    })
  })
}

let failed = false
for (const { name, token, expect } of cases) {
  const { code, hung, output } = await start(token)
  const problems = []
  if (hung) problems.push(`still running after ${TIME_LIMIT_MS / 1000} s, so it was stopped`)
  else if (code === 0) problems.push('exited 0')
  if (!output.includes(expect)) problems.push(`did not log "${expect}"`)
  if (problems.length) {
    failed = true
    console.error(`✗ ${bot}, ${name}: ${problems.join('; ')}\n${output}`)
  } else {
    console.log(`✓ ${bot}, ${name}: exited ${code} with "${expect}"`)
  }
}
process.exit(failed ? 1 : 0)
