#!/usr/bin/env node
/**
 * Batch rebrand: swaps the Naxlex header/footer for Cambridge Nurse branding
 * and renames the teal "NCLEX Success Tips" box to "Success Tips".
 *
 * Usage:
 *   node scripts/rebrand.mjs <inputDir> <outputDir> [options]
 *
 * Options:
 *   --url "WWW.CAMBRIDGENURSE.COM"   brand url printed in header + footer
 *   --tips "Success Tips"            new title for the teal box
 *   --no-tips                        leave the teal box untouched
 *   --no-ocr                         use file names as titles instead of OCR
 *   --titles titles.csv              CSV of "filename,title" to override OCR
 *   --footer 0.045                   fraction of page height wiped for footer
 *   --pad 45                         extra space (px at 612-wide scale) added under the header
 *
 * Example:
 *   node scripts/rebrand.mjs ./in ./out --url WWW.CAMBRIDGENURSE.COM
 */

import { readdir, mkdir, writeFile, readFile } from "node:fs/promises"
import { join, extname, basename, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas"
import { createWorker } from "tesseract.js"

// Bundled fonts so output is identical on any machine (no system fonts needed)
const fontsDir = join(dirname(fileURLToPath(import.meta.url)), "fonts")
GlobalFonts.registerFromPath(join(fontsDir, "Sans-Bold.ttf"), "BrandSans")
GlobalFonts.registerFromPath(join(fontsDir, "ComicNeue-Bold.ttf"), "BrandComic")
const SANS = "BrandSans, Arial, Helvetica, sans-serif"
const COMIC = 'BrandComic, "Comic Sans MS", cursive, sans-serif'

/* ---------- args ---------- */
const args = process.argv.slice(2)
const positional = args.filter((a) => !a.startsWith("--"))
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def
}
const has = (name) => args.includes(`--${name}`)

const [inputDir, outputDir] = positional
if (!inputDir || !outputDir) {
  console.error("Usage: node scripts/rebrand.mjs <inputDir> <outputDir> [--url ...] [--tips ...]")
  process.exit(1)
}

const settings = {
  brandUrl: flag("url", "WWW.CAMBRIDGENURSE.COM"),
  tipsTitle: flag("tips", "Success Tips"),
  replaceTips: !has("no-tips"),
  useOcr: !has("no-ocr"),
  footerPct: Number(flag("footer", "0.045")),
  pad: Number(flag("pad", "45")), // extra px (at 612px-wide scale) added below the header
  titlesCsv: flag("titles", null),
}

const REF_W = 612
const TEAL = { r: 0, g: 167, b: 157 }
const isTeal = (r, g, b, tol = 22) =>
  Math.abs(r - TEAL.r) < tol && Math.abs(g - TEAL.g) < tol && Math.abs(b - TEAL.b) < tol

/* ---------- detection ---------- */
function detectTealBox(ctx, w, h) {
  const data = ctx.getImageData(0, 0, w, h).data
  const step = 2
  for (let y = Math.round(h * 0.12); y < h; y += step) {
    let count = 0
    let left = w
    let right = 0
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (isTeal(data[i], data[i + 1], data[i + 2])) {
        count++
        if (x < left) left = x
        if (x > right) right = x
      }
    }
    if (count / (w / step) > 0.35) return { top: y, left, right }
  }
  return null
}

/* ---------- drawing ---------- */
function drawHeader(ctx, w, s, title, brandUrl, pad = 0) {
  // wipe old header (which now sits `pad` px lower) plus the new header zone
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, 84 * s + pad)

  const barTop = 33 * s
  const barBottom = 78 * s
  const barH = barBottom - barTop
  ctx.fillStyle = "#1a4fd8"
  ctx.fillRect(0, barTop, w, barH)

  const rib = (x0, x1, y0, y1, color) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y0)
    ctx.lineTo(x1 + 60 * s, y1)
    ctx.lineTo(x0 + 60 * s, y1)
    ctx.closePath()
    ctx.fill()
  }
  const y0 = 10 * s
  const y1 = 84 * s
  rib(0, 70 * s, y0, y1, "#1a4fd8")
  rib(70 * s, 100 * s, y0, y1, "#ffffff")
  rib(100 * s, 135 * s, y0, y1, "#14b1e6")
  rib(135 * s, 165 * s, y0, y1, "#ffffff")
  rib(165 * s, 195 * s, y0, y1, "#1a4fd8")
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, y0)

  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${15 * s}px ${SANS}`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(title.toUpperCase(), (w + 180 * s) / 2, barTop + barH / 2)

  ctx.fillStyle = "#222222"
  ctx.font = `bold ${13 * s}px ${SANS}`
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(brandUrl.toUpperCase(), w - 10 * s, barBottom + 25 * s)
}

function drawFooter(ctx, w, h, s, brandUrl, footerPct) {
  const footerH = Math.max(h * footerPct, 24 * s)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, h - footerH, w, footerH)
  ctx.fillStyle = "#222222"
  ctx.font = `bold ${9 * s}px ${SANS}`
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(brandUrl.toUpperCase(), w - 10 * s, h - 12 * s)
}

function drawTipsTitle(ctx, s, box, title) {
  const bandTop = box.top + 2 * s
  const bandH = 28 * s
  const inset = 55 * s
  ctx.fillStyle = `rgb(${TEAL.r},${TEAL.g},${TEAL.b})`
  ctx.fillRect(box.left + inset, bandTop, box.right - box.left - inset * 2, bandH)

  const cx = (box.left + box.right) / 2
  const cy = bandTop + bandH / 2 + 2 * s
  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${16 * s}px ${COMIC}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(title, cx, cy)
  const tw = ctx.measureText(title).width
  ctx.fillRect(cx - tw / 2, cy + 10 * s, tw, 1.5 * s)
}

/* ---------- OCR ---------- */
let worker = null
async function ocrTitle(img) {
  if (!worker) worker = await createWorker("eng")
  const s = img.width / REF_W
  const cw = Math.round(img.width * 0.45)
  const cy = Math.round(18 * s)
  const ch = Math.round(34 * s)
  const crop = createCanvas(cw * 3, ch * 3)
  const cctx = crop.getContext("2d")
  cctx.drawImage(img, img.width - cw, cy, cw, ch, 0, 0, crop.width, crop.height)
  const d = cctx.getImageData(0, 0, crop.width, crop.height)
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
    const v = lum > 200 ? 0 : 255
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
  }
  cctx.putImageData(d, 0, 0)
  const { data } = await worker.recognize(await crop.encode("png"))
  return data.text
    .replace(/[^A-Za-z0-9 &'()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:[A-Za-z]{1,2}\s+)+(?=[A-Za-z]{3,})/, "")
    .trim()
}

const titleFromFileName = (name) =>
  basename(name, extname(name)).replace(/[-_]+/g, " ").replace(/\d+\s*$/, "").trim()

/* ---------- main ---------- */
async function main() {
  await mkdir(outputDir, { recursive: true })

  const overrides = new Map()
  if (settings.titlesCsv) {
    const csv = await readFile(settings.titlesCsv, "utf8")
    for (const line of csv.split(/\r?\n/)) {
      const [file, ...rest] = line.split(",")
      if (file && rest.length) overrides.set(file.trim(), rest.join(",").trim())
    }
  }

  const files = (await readdir(inputDir)).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()
  console.log(`Processing ${files.length} file(s) from ${inputDir} -> ${outputDir}`)

  const report = ["file,title,tips_box_found"]
  let i = 0
  for (const file of files) {
    i++
    try {
      const img = await loadImage(join(inputDir, file))
      const w = img.width
      const h = img.height
      const s = w / REF_W

      let title = overrides.get(file)
      if (!title) title = settings.useOcr ? await ocrTitle(img) : titleFromFileName(file)
      if (!title) title = titleFromFileName(file)

      // Extra room under the new header so the URL line clears the content
      const pad = Math.round(settings.pad * s)
      const outH = h + pad
      const canvas = createCanvas(w, outH)
      const ctx = canvas.getContext("2d")
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, w, outH)
      ctx.drawImage(img, 0, pad)

      let tipsFound = false
      if (settings.replaceTips) {
        const box = detectTealBox(ctx, w, outH)
        if (box) {
          tipsFound = true
          drawTipsTitle(ctx, s, box, settings.tipsTitle)
        }
      }
      drawHeader(ctx, w, s, title, settings.brandUrl, pad)
      drawFooter(ctx, w, outH, s, settings.brandUrl, settings.footerPct)

      const outName = basename(file, extname(file)) + ".png"
      await writeFile(join(outputDir, outName), await canvas.encode("png"))
      report.push(`${file},"${title.replace(/"/g, '""')}",${tipsFound}`)
      console.log(`[${i}/${files.length}] ${file} -> "${title}"${tipsFound ? "" : "  (no tips box)"}`)
    } catch (err) {
      report.push(`${file},ERROR,${false}`)
      console.error(`[${i}/${files.length}] ${file} FAILED: ${err.message}`)
    }
  }

  await writeFile(join(outputDir, "_report.csv"), report.join("\n"))
  if (worker) await worker.terminate()
  console.log(`Done. Report written to ${join(outputDir, "_report.csv")}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
