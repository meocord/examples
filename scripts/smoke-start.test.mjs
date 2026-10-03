import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, test } from 'node:test'

const script = path.join(import.meta.dirname, 'smoke-start.mjs')
const folders = []
afterEach(() => folders.splice(0).forEach(folder => rmSync(folder, { recursive: true, force: true })))

/** A stand-in bot whose `start:prod` runs `main.js` through npm, as a real bot's runs the CLI and then the bot. */
function standIn(main) {
  const folder = mkdtempSync(path.join(tmpdir(), 'smoke-bot-'))
  folders.push(folder)
  writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ scripts: { 'start:prod': 'node main.js' } }))
  writeFileSync(path.join(folder, 'main.js'), main)
  return folder
}

const isRunning = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// Bounded itself, so a script that can't stop a bot fails here rather than hanging the run
const run = folder =>
  spawnSync(process.execPath, [script, folder], {
    encoding: 'utf8',
    env: { ...process.env, SMOKE_TIME_LIMIT_MS: '3000' },
    timeout: 30_000,
    killSignal: 'SIGKILL',
  })

test("passes a bot that exits non-zero with MeoCord's message for each token", () => {
  const folder = standIn(`
    console.error(process.env.DISCORD_TOKEN ? 'Discord refused the bot token.' : 'Discord token is missing.')
    process.exit(1)`)

  assert.equal(run(folder).status, 0)
})

test('fails a bot that exits 0', () => {
  const folder = standIn(`console.log('Discord token is missing. Discord refused the bot token.')`)

  const result = run(folder)
  assert.equal(result.status, 1)
  assert.match(result.stderr, /exited 0/)
})

test('stops a bot that never exits, the bot itself and not only npm, within its limit', () => {
  const pidFile = path.join(mkdtempSync(path.join(tmpdir(), 'smoke-pid-')), 'pid')
  folders.push(path.dirname(pidFile))
  const folder = standIn(`
    require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid))
    setInterval(() => {}, 1000)`)

  const started = Date.now()
  const result = run(folder)
  const pid = existsSync(pidFile) ? Number(readFileSync(pidFile, 'utf8')) : undefined
  const alive = pid !== undefined && isRunning(pid)
  if (alive) process.kill(pid, 'SIGKILL')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /still running after 3 s/)
  // Two runs of the 3 s limit, and well short of what an unkillable pipe would wait
  assert.ok(Date.now() - started < 20_000, `took ${Date.now() - started} ms`)
  assert.ok(pid !== undefined)
  assert.equal(alive, false, 'the bot was left running')
})
