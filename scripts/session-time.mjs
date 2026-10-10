#!/usr/bin/env node
// Measure how long a piece of work took, from the timestamps in AI session logs (JSONL).
// Only stretches where messages keep coming count: a gap longer than --idle minutes is treated as
// time away and dropped. Timestamps from every matched session are merged into one timeline first,
// so sessions that ran side by side are not counted twice.
//
// Usage:
//   node scripts/session-time.mjs --session <start of a session id>     one session
//   node scripts/session-time.mjs --match <text> [--min-hits 30]        every session that mentions the text often
// Options: --idle 5 (minutes) · --since 2026-10-01 · --roots <dir,dir> · --json
//
// Session logs are deleted by the tools after a while. Measure when the work is finished and write
// the number down (the "소요 시간" column of the Notion templates), or it cannot be recovered later.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join, basename } from "node:path"

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const session = opt("session", "")
const match = opt("match", "")
const minHits = Number(opt("min-hits", "30"))
const idleMs = Number(opt("idle", "5")) * 60_000
const since = opt("since", "")
const asJson = args.includes("--json")
// Claude Code and Codex keep their logs here by default. Pass --roots for anything else.
const roots = opt("roots", [join(homedir(), ".claude", "projects"), join(homedir(), ".codex", "sessions")].join(","))
  .split(",")
  .filter(Boolean)

if (!session && !match) {
  console.error("Pass --session <id> or --match <text>.")
  process.exit(2)
}

function* walk(dir) {
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) yield* walk(full)
    else if (name.endsWith(".jsonl")) yield full
  }
}

// Count only lines where a person and the AI actually exchange something. Housekeeping lines
// (title refreshes, keep-alives) are written even while nobody is working.
const COUNTED = new Set(["user", "assistant", "response_item", "event_msg"])

const stamps = new Set()
const used = []
for (const root of roots) {
  for (const file of walk(root)) {
    const name = basename(file)
    let text
    if (session) {
      if (!name.includes(session)) continue
      text = readFileSync(file, "utf8")
    } else {
      text = readFileSync(file, "utf8")
      const hits = text.split(match).length - 1
      if (hits < minHits) continue
    }
    let count = 0
    for (const line of text.split("\n")) {
      if (!line.includes('"timestamp"')) continue
      let row
      try {
        row = JSON.parse(line)
      } catch {
        continue
      }
      if (!COUNTED.has(row.type) || !row.timestamp) continue
      const t = Date.parse(row.timestamp)
      if (Number.isNaN(t)) continue
      if (since && t < Date.parse(`${since}T00:00:00`)) continue
      stamps.add(t)
      count++
    }
    if (count) used.push(name)
  }
}

const times = [...stamps].sort((a, b) => a - b)
const perDay = new Map()
let total = 0
for (let i = 1; i < times.length; i++) {
  const gap = times[i] - times[i - 1]
  if (gap > idleMs) continue
  total += gap
  const d = new Date(times[i - 1])
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  perDay.set(day, (perDay.get(day) ?? 0) + gap)
}

const hours = (ms) => Math.round(ms / 360_000) / 10
const result = {
  hours: hours(total),
  sessions: used.length,
  idleMinutes: idleMs / 60_000,
  first: times.length ? new Date(times[0]).toISOString() : null,
  last: times.length ? new Date(times[times.length - 1]).toISOString() : null,
  days: Object.fromEntries([...perDay].sort().map(([day, ms]) => [day, hours(ms)])),
}

if (asJson) {
  console.log(JSON.stringify(result, null, 2))
} else {
  console.log(`${result.hours}h · sessions ${result.sessions} · idle cutoff ${result.idleMinutes} min`)
  for (const [day, h] of Object.entries(result.days)) console.log(`  ${day}  ${h}h`)
}
