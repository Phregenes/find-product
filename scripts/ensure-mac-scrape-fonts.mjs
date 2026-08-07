/**
 * Stop macOS "download font" dialogs during Playwright scrapes.
 *
 * 1) Patches Playwright's mac font defaults so Chromium never asks for
 *    Osaka / STHeiti / PingFang / Songti / Kaiti (Apple downloadable fonts).
 * 2) Uses fonts already on macOS (Helvetica, Menlo, Hiragino, Apple SD Gothic Neo).
 *
 * Usage: node scripts/ensure-mac-scrape-fonts.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MARKER = '__FIND_PRODUCT_SAFE_MAC_FONTS__'

/** Replace Playwright defaults that trigger macOS font-download prompts. */
export function patchPlaywrightMacFonts() {
  const bundlePath = join(ROOT, 'node_modules', 'playwright-core', 'lib', 'coreBundle.js')
  if (!existsSync(bundlePath)) {
    return { ok: false, reason: 'playwright-core/lib/coreBundle.js not found' }
  }

  let src = readFileSync(bundlePath, 'utf8')
  if (src.includes(MARKER)) {
    return { ok: true, already: true, bundlePath }
  }

  const before = src
  src = src
    // Japanese — Osaka-Mono is downloadable; keep Hiragino (preinstalled).
    .replaceAll('"fixed": "Osaka-Mono"', '"fixed": "Menlo"')
    // Simplified Chinese — PingFang/STHeiti/Songti/Kaiti trigger download dialogs.
    .replaceAll('"standard": ",PingFang SC,STHeiti"', '"standard": "Hiragino Sans GB"')
    .replaceAll('"sansSerif": ",PingFang SC,STHeiti"', '"sansSerif": "Hiragino Sans GB"')
    .replaceAll('"serif": "Songti SC"', '"serif": "Hiragino Sans GB"')
    .replaceAll('"cursive": "Kaiti SC"', '"cursive": "Hiragino Sans GB"')
    // Traditional Chinese
    .replaceAll('"standard": ",PingFang TC,Heiti TC"', '"standard": "Hiragino Sans GB"')
    .replaceAll('"sansSerif": ",PingFang TC,Heiti TC"', '"sansSerif": "Hiragino Sans GB"')
    .replaceAll('"serif": "Songti TC"', '"serif": "Hiragino Sans GB"')
    .replaceAll('"cursive": "Kaiti TC"', '"cursive": "Hiragino Sans GB"')
    // Other downloadable / rarely-installed faces
    .replaceAll('"cursive": "Apple Chancery"', '"cursive": "Helvetica"')
    .replaceAll('"fantasy": "Papyrus"', '"fantasy": "Helvetica"')
    .replaceAll('"serif": "AppleMyungjo"', '"serif": "Apple SD Gothic Neo"')

  if (src === before) {
    return { ok: false, reason: 'no font strings matched — playwright version changed?', bundlePath }
  }

  src = src.replace(
    '// packages/playwright-core/src/server/chromium/defaultFontFamilies.ts',
    `// packages/playwright-core/src/server/chromium/defaultFontFamilies.ts\n// ${MARKER}`,
  )
  writeFileSync(bundlePath, src)
  return { ok: true, already: false, bundlePath }
}

export function ensureMacScrapeFonts() {
  if (process.platform !== 'darwin') {
    return { ok: true, skippedPlatform: true }
  }

  const patch = patchPlaywrightMacFonts()
  return {
    ok: patch.ok,
    skippedPlatform: false,
    patch,
  }
}

if (process.argv[1]?.includes('ensure-mac-scrape-fonts')) {
  const result = ensureMacScrapeFonts()
  if (result.skippedPlatform) {
    console.log('[fonts] not macOS — nothing to do')
  } else if (!result.patch?.ok) {
    console.error('[fonts] patch failed:', result.patch?.reason)
    process.exitCode = 1
  } else if (result.patch.already) {
    console.log('[fonts] Playwright mac fonts already patched (no Osaka/STHeiti)')
  } else {
    console.log('[fonts] Patched Playwright to use Helvetica/Hiragino instead of Osaka/STHeiti')
    console.log(`[fonts] ${result.patch.bundlePath}`)
  }
}
