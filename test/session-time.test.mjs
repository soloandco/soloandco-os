import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'session-time.mjs')
const at = (minute) => new Date(Date.UTC(2026, 9, 10, 1, 0, 0) + minute * 60_000).toISOString()
const line = (type, minute) => JSON.stringify({ type, timestamp: at(minute), text: 'site-x' })

const write = (name, lines) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'))
  fs.writeFileSync(path.join(dir, name), lines.join('\n'))
  return dir
}
const run = (args) => JSON.parse(execFileSync('node', [script, ...args, '--json'], { encoding: 'utf8' }))

test('gaps longer than the idle cutoff are dropped', () => {
  // 0-4 min (4) + 30-33 min (3) = 7 min = 0.1 h. The 4-30 min gap is dropped.
  const root = write('abc123.jsonl', [line('user', 0), line('assistant', 4), line('user', 30), line('assistant', 33)])
  const out = run(['--session', 'abc123', '--roots', root])
  assert.equal(out.hours, 0.1)
  assert.equal(out.sessions, 1)
})

test('a longer idle cutoff brings the gap back in', () => {
  const root = write('abc123.jsonl', [line('user', 0), line('assistant', 4), line('user', 30), line('assistant', 33)])
  const out = run(['--session', 'abc123', '--roots', root, '--idle', '40'])
  assert.equal(out.hours, 0.6) // 33 min
})

test('housekeeping lines do not count as work', () => {
  // custom-title lines every 3 minutes must not bridge the 12-minute gap between user and assistant.
  const root = write('abc123.jsonl', [
    line('user', 0), line('custom-title', 3), line('custom-title', 6), line('custom-title', 9), line('assistant', 12),
  ])
  assert.equal(run(['--session', 'abc123', '--roots', root]).hours, 0)
})

test('two sessions at the same time are counted once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-'))
  const lines = [line('user', 0), line('assistant', 3), line('user', 6)]
  fs.writeFileSync(path.join(dir, 'one.jsonl'), lines.join('\n'))
  fs.writeFileSync(path.join(dir, 'two.jsonl'), lines.join('\n'))
  const out = run(['--match', 'site-x', '--min-hits', '2', '--roots', dir])
  assert.equal(out.sessions, 2)
  assert.equal(out.hours, 0.1) // 6 min. Must not double to 12 min (0.2).
})

test('sessions that mention the text too rarely are skipped', () => {
  const root = write('abc123.jsonl', [line('user', 0), line('assistant', 3)])
  assert.equal(run(['--match', 'site-x', '--min-hits', '5', '--roots', root]).sessions, 0)
})
