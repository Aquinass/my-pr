/**
 * Batch rebranding engine.
 * All coordinates are expressed relative to a 612px-wide reference page
 * (US Letter at 72dpi, matching the source PNGs) and scaled to the actual
 * image size, so it works on any resolution export of the same layout.
 */

export type RebrandSettings = {
  brandUrl: string
  headerHeightPct: number // fraction of page height covered by old header (incl. the @url tag)
  footerHeightPct: number // fraction of page height covered by old footer
  replaceTipsTitle: boolean
  tipsTitle: string
  tipsTitleFind: string // the word(s) to strip from OCR'd title, e.g. "NCLEX"
  titleOverride?: string
}

export type ProcessedPage = {
  id: string
  fileName: string
  title: string
  ocrTitle: string
  originalUrl: string
  outputUrl: string | null
  outputBlob: Blob | null
  status: "queued" | "ocr" | "rendering" | "done" | "error"
  error?: string
  tipsBoxFound: boolean
}

export const DEFAULT_SETTINGS: RebrandSettings = {
  brandUrl: "WWW.CAMBRIDGENURSE.COM",
  headerHeightPct: 0.098, // ~78px of 792
  footerHeightPct: 0.045, // ~36px of 792
  replaceTipsTitle: true,
  tipsTitle: "Success Tips",
  tipsTitleFind: "NCLEX",
}

const REF_W = 612

/* ---------- colour helpers ---------- */

// Teal used by the "Success Tips" box in the source files (#00A79D)
const TEAL = { r: 0, g: 167, b: 157 }
function isTeal(r: number, g: number, b: number, tol = 22) {
  return (
    Math.abs(r - TEAL.r) < tol &&
    Math.abs(g - TEAL.g) < tol &&
    Math.abs(b - TEAL.b) < tol
  )
}

/**
 * Finds the top edge and horizontal extent of the teal tips box.
 * Scans rows; the first row where >35% of pixels are teal is the top.
 */
export function detectTealBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const data = ctx.getImageData(0, 0, w, h).data
  let top = -1
  let left = w
  let right = 0
  const step = 2
  // skip the header zone entirely so its gradient can't be mistaken for the box
  const startY = Math.round(h * 0.12)
  for (let y = startY; y < h; y += step) {
    let count = 0
    let rowLeft = w
    let rowRight = 0
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      if (isTeal(data[i], data[i + 1], data[i + 2])) {
        count++
        if (x < rowLeft) rowLeft = x
        if (x > rowRight) rowRight = x
      }
    }
    if (count / (w / step) > 0.35) {
      top = y
      left = rowLeft
      right = rowRight
      break
    }
  }
  if (top < 0) return null
  return { top, left, right }
}

/* ---------- drawing ---------- */

function drawHeader(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: number,
  title: string,
  brandUrl: string,
  pad = 0,
) {
  const headerH = 78 * s
  // wipe old header (now shifted down by `pad`) plus the new header zone
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, headerH + 6 * s + pad)

  const barTop = 33 * s
  const barBottom = 78 * s
  const barH = barBottom - barTop

  // main blue bar
  ctx.fillStyle = "#1a4fd8"
  ctx.fillRect(0, barTop, w, barH)

  // diagonal ribbon block on the left
  const rib = (
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    color: string,
  ) => {
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
  // trim ribbon below page top-left corner rounding
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, y0)

  // title
  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${15 * s}px Arial, Helvetica, sans-serif`
  ctx.textBaseline = "middle"
  ctx.textAlign = "center"
  ctx.fillText(title.toUpperCase(), (w + 180 * s) / 2, barTop + barH / 2)

  // url line
  ctx.fillStyle = "#222222"
  ctx.font = `bold ${13 * s}px Arial, Helvetica, sans-serif`
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(brandUrl.toUpperCase(), w - 10 * s, barBottom + 25 * s)
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  s: number,
  brandUrl: string,
  footerPct: number,
) {
  const footerH = Math.max(h * footerPct, 24 * s)
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, h - footerH, w, footerH)
  ctx.fillStyle = "#222222"
  ctx.font = `bold ${9 * s}px Arial, Helvetica, sans-serif`
  ctx.textAlign = "right"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(brandUrl.toUpperCase(), w - 10 * s, h - 12 * s)
}

function drawTipsTitle(
  ctx: CanvasRenderingContext2D,
  s: number,
  box: { top: number; left: number; right: number },
  title: string,
) {
  // The title band sits in the first ~30px (ref scale) of the box.
  // Leave room for the pushpins at both ends.
  const bandTop = box.top + 2 * s
  const bandH = 28 * s
  const inset = 55 * s
  ctx.fillStyle = `rgb(${TEAL.r},${TEAL.g},${TEAL.b})`
  ctx.fillRect(box.left + inset, bandTop, box.right - box.left - inset * 2, bandH)

  const cx = (box.left + box.right) / 2
  const cy = bandTop + bandH / 2 + 2 * s
  ctx.fillStyle = "#ffffff"
  ctx.font = `bold ${16 * s}px "Comic Sans MS", "Comic Neue", cursive, sans-serif`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(title, cx, cy)
  const tw = ctx.measureText(title).width
  ctx.fillRect(cx - tw / 2, cy + 10 * s, tw, 1.5 * s)
}

/* ---------- OCR ---------- */

let workerPromise: Promise<import("tesseract.js").Worker> | null = null
async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import("tesseract.js")
      return createWorker("eng")
    })()
  }
  return workerPromise
}

/** OCR the right half of the old header where the page title lives. */
export async function ocrHeaderTitle(img: HTMLImageElement): Promise<string> {
  const s = img.naturalWidth / REF_W
  const crop = document.createElement("canvas")
  // Title sits in the right ~45% of the header, between y≈18 and y≈50 (ref px)
  const cw = Math.round(img.naturalWidth * 0.45)
  const cy = Math.round(18 * s)
  const ch = Math.round(34 * s)
  // upscale 3x for better OCR on small text
  crop.width = cw * 3
  crop.height = ch * 3
  const cctx = crop.getContext("2d")!
  cctx.drawImage(img, img.naturalWidth - cw, cy, cw, ch, 0, 0, crop.width, crop.height)
  // invert so white-on-teal becomes dark-on-light
  const d = cctx.getImageData(0, 0, crop.width, crop.height)
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2]
    const v = lum > 200 ? 0 : 255
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v
  }
  cctx.putImageData(d, 0, 0)
  const worker = await getWorker()
  const {
    data: { text },
  } = await worker.recognize(crop)
  return text
    .replace(/[^A-Za-z0-9 &'()/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // drop leading junk tokens like "EE" / "|" picked up from the logo edge
    .replace(/^(?:[A-Za-z]{1,2}\s+)+(?=[A-Za-z]{3,})/, "")
    .trim()
}

/* ---------- main ---------- */

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Could not load image"))
    img.src = src
  })
}

export async function renderRebrand(
  img: HTMLImageElement,
  title: string,
  settings: RebrandSettings,
): Promise<{ blob: Blob; tipsBoxFound: boolean }> {
  const w = img.naturalWidth
  const s = w / REF_W
  // Extra room under the new header so the URL line clears the content
  const pad = Math.round(45 * s)
  const h = img.naturalHeight + pad
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, pad)

  let tipsBoxFound = false
  if (settings.replaceTipsTitle) {
    const box = detectTealBox(ctx, w, h)
    if (box) {
      tipsBoxFound = true
      drawTipsTitle(ctx, s, box, settings.tipsTitle)
    }
  }

  drawHeader(ctx, w, h, s, title, settings.brandUrl, pad)
  drawFooter(ctx, w, h, s, settings.brandUrl, settings.footerHeightPct)

  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
  )
  return { blob, tipsBoxFound }
}

export function titleFromFileName(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\d+\s*$/, "")
    .trim()
}
