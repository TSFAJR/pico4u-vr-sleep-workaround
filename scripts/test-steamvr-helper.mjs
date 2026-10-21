// Integration checks using a real helper process. Never requests a dark overlay.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const profile = process.argv.includes('--release') ? 'release' : 'debug'
const exe = path.join(root, 'target', profile, 'steamvr-brightness-helper.exe')

async function check(binary, expectedCode) {
  const child = spawn(binary, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  let buffer = ''
  const reports = []
  const exit = once(child, 'exit')
  child.stdout.on('data', (data) => {
    buffer += data
    let index
    while ((index = buffer.indexOf('\n')) >= 0) {
      reports.push(JSON.parse(buffer.slice(0, index)))
      buffer = buffer.slice(index + 1)
    }
  })
  const write = (value) => child.stdin.write(`${JSON.stringify(value)}\n`)
  try {
    const state = { revision: 1, enabled: true, percent: 100, retry: 0, quit: false }
    write(state)
    const deadline = Date.now() + 5000
    while (!reports.some((r) => r.revision === 1) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    const reply = reports.find((r) => r.revision === 1)
    assert(reply, 'Helper must answer initialization request')
    if (expectedCode) assert.equal(reply.error?.code, expectedCode)
    else assert(['active', 'waiting', 'error'].includes(reply.phase))
    // Newer restoration wins over a subsequently delivered stale dark request.
    write({ ...state, revision: 3, enabled: false })
    write({ ...state, revision: 2, percent: 0 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    const restored = reports.findLast((r) => r.revision === 3)
    assert.equal(restored?.applied_percent, 100)
    assert.equal(restored?.phase, 'disabled')
    child.stdin.end() // Parent EOF must release the session and exit normally.
    const [code] = await Promise.race([
      exit,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Helper did not exit on EOF')), 1500)
        timer.unref()
      }),
    ])
    assert.equal(code, 0)
    console.log(`PASS ${expectedCode || 'native runtime'}: initialization, stale command rejection, restore, EOF cleanup`)
  } finally {
    if (child.exitCode === null) child.kill()
  }
}

await check(exe)
const isolated = path.join(root, '.tools', 'helper-no-dll')
await mkdir(isolated, { recursive: true })
const missing = path.join(isolated, 'steamvr-brightness-helper.exe')
await copyFile(exe, missing)
await check(missing, 'dll_missing')
