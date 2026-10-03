// Starts a built bot with no token and with a token Discord refuses, and checks that each run exits non-zero with
// MeoCord's own message. No real token is used: the second run sends a made-up one, which Discord answers with 401.
//
//   node scripts/smoke-start.mjs <bot-folder>
import { spawn } from 'node:child_process'
import path from 'node:path'

const bot = process.argv[2]
if (!bot) {
  console.error('Usage: node scripts/smoke-start.mjs <bot-folder>')
  process.exit(2)
}
const cwd = path.resolve(bot)
const TIME_LIMIT_MS = 120_000

const cases = [
  { name: 'a missing token', token: undefined, expect: 'Discord token is missing' },
  { name: 'a token Discord refuses', token: 'not-a-real-token', expect: 'Discord refused the bot token' },
]

/** Runs `npm run start:prod` with the token set or unset, and resolves with its exit code and output. */
function start(token) {
  const env = { ...process.env, NODE_ENV: 'production' }
  delete env.DISCORD_TOKEN
  if (token !== undefined) env.DISCORD_TOKEN = token
  return new Promise(resolve => {
    const child = spawn('npm', ['run', 'start:prod'], { cwd, env, shell: process.platform === 'win32' })
    let output = ''
    child.stdout.on('data', chunk => (output += chunk))
    child.stderr.on('data', chunk => (output += chunk))
    // A bot that never exits would hang the job; past the limit it counts as a failure
    const timer = setTimeout(() => child.kill('SIGKILL'), TIME_LIMIT_MS)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, output })
    })
  })
}

let failed = false
for (const { name, token, expect } of cases) {
  const { code, signal, output } = await start(token)
  const problems = []
  if (signal) problems.push(`still running after ${TIME_LIMIT_MS / 1000} s`)
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
