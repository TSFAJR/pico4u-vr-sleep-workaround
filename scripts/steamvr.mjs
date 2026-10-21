import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
export const sdkCommit = '0924064316de3effbcd1acf1e309182a2deb1c05'
export const dllSha256 = 'bab8ac6ef64e68a9ca53315b0014d131088584b2efdfa6db511d67ec03cfcb4a'

export async function prepareSteamVr(release) {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('SteamVR helper currently requires Windows x64')
  }
  const bin = path.join(root, 'bin')
  mkdirSync(bin, { recursive: true })
  const dll = path.join(bin, 'openvr_api.dll')
  if (!existsSync(dll)) {
    const response = await fetch(`https://raw.githubusercontent.com/ValveSoftware/openvr/${sdkCommit}/bin/win64/openvr_api.dll`)
    if (!response.ok) throw new Error(`OpenVR DLL download failed: ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== dllSha256) throw new Error('OpenVR DLL hash mismatch')
    writeFileSync(dll, bytes)
  }
  if (createHash('sha256').update(readFileSync(dll)).digest('hex') !== dllSha256) {
    throw new Error('bin/openvr_api.dll is not the pinned SDK binary; remove it and retry')
  }
  const env = { ...process.env }
  const localCargo = path.join(root, '.tools/cargo/bin/cargo.exe')
  const cargo = existsSync(localCargo) ? localCargo : 'cargo'
  if (existsSync(localCargo)) {
    env.CARGO_HOME = path.join(root, '.tools/cargo')
    env.RUSTUP_HOME = path.join(root, '.tools/rustup')
  }
  const args = ['build', '-p', 'steamvr-brightness-helper', '--locked', ...(release ? ['--release'] : [])]
  const result = spawnSync(cargo, args, { cwd: root, env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`SteamVR helper build failed (${result.status})`)
  const profile = release ? 'release' : 'debug'
  const output = path.resolve(root, env.CARGO_TARGET_DIR || 'target', profile)
  copyFileSync(path.join(output, 'steamvr-brightness-helper.exe'), path.join(bin, 'steamvr-brightness-helper-x86_64-pc-windows-msvc.exe'))
  copyFileSync(dll, path.join(output, 'openvr_api.dll'))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareSteamVr(process.argv.includes('--release'))
}
