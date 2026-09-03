"use client"

import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  DEFAULT_SETTINGS,
  loadImage,
  ocrHeaderTitle,
  renderRebrand,
  titleFromFileName,
  type ProcessedPage,
  type RebrandSettings,
} from "@/lib/rebrand"
import { PageCard } from "@/components/page-card"
import { SettingsPanel } from "@/components/settings-panel"
import { Download, Play, Trash2, Upload } from "lucide-react"

export function RebrandStudio() {
  const [pages, setPages] = useState<ProcessedPage[]>([])
  const [settings, setSettings] = useState<RebrandSettings>(DEFAULT_SETTINGS)
  const [running, setRunning] = useState(false)
  const [zipping, setZipping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const update = (id: string, patch: Partial<ProcessedPage>) =>
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const addFiles = useCallback((files: FileList | File[]) => {
    const next: ProcessedPage[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        title: titleFromFileName(f.name),
        ocrTitle: "",
        originalUrl: URL.createObjectURL(f),
        outputUrl: null,
        outputBlob: null,
        status: "queued",
        tipsBoxFound: false,
      }))
    setPages((prev) => [...prev, ...next])
  }, [])

  const processOne = async (page: ProcessedPage) => {
    const s = settingsRef.current
    try {
      const img = await loadImage(page.originalUrl)
      let title = page.title
      if (!page.ocrTitle) {
        update(page.id, { status: "ocr" })
        const ocr = await ocrHeaderTitle(img)
        if (ocr) {
          title = ocr
          update(page.id, { ocrTitle: ocr, title: ocr })
        }
      }
      update(page.id, { status: "rendering" })
      const { blob, tipsBoxFound } = await renderRebrand(img, title, s)
      update(page.id, {
        status: "done",
        outputBlob: blob,
        outputUrl: URL.createObjectURL(blob),
        tipsBoxFound,
      })
    } catch (e) {
      update(page.id, { status: "error", error: (e as Error).message })
    }
  }

  const runAll = async () => {
    setRunning(true)
    const targets = pages.filter((p) => p.status !== "done")
    for (const p of targets) await processOne(p)
    setRunning(false)
  }

  const rerenderAll = async () => {
    // Re-render with current settings/titles but skip OCR (already done)
    setRunning(true)
    for (const p of pages) {
      const img = await loadImage(p.originalUrl)
      update(p.id, { status: "rendering" })
      const { blob, tipsBoxFound } = await renderRebrand(img, p.title, settingsRef.current)
      update(p.id, {
        status: "done",
        outputBlob: blob,
        outputUrl: URL.createObjectURL(blob),
        tipsBoxFound,
      })
    }
    setRunning(false)
  }

  const rerenderOne = async (page: ProcessedPage, title: string) => {
    update(page.id, { title, status: "rendering" })
    const img = await loadImage(page.originalUrl)
    const { blob, tipsBoxFound } = await renderRebrand(img, title, settingsRef.current)
    update(page.id, {
      status: "done",
      outputBlob: blob,
      outputUrl: URL.createObjectURL(blob),
      tipsBoxFound,
    })
  }

  const downloadZip = async () => {
    setZipping(true)
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    for (const p of pages) {
      if (p.outputBlob) zip.file(p.fileName.replace(/\.[^.]+$/, "") + ".png", p.outputBlob)
    }
    const blob = await zip.generateAsync({ type: "blob" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "cambridgenurse-rebranded.zip"
    a.click()
    setZipping(false)
  }

  const done = pages.filter((p) => p.status === "done").length
  const flagged = pages.filter((p) => p.status === "done" && !p.tipsBoxFound).length

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="flex w-full flex-col gap-6 border-b border-border bg-card p-6 lg:w-80 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-1">
          <h1 className="font-sans text-lg font-semibold tracking-tight text-foreground">
            Rebrand Studio
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Batch-swap headers and footers on exported study pages.
          </p>
        </div>

        <SettingsPanel settings={settings} onChange={setSettings} />

        <div className="flex flex-col gap-2">
          <Button
            onClick={runAll}
            disabled={running || pages.every((p) => p.status === "done") || pages.length === 0}
          >
            <Play data-icon="inline-start" />
            {running ? "Processing…" : `Process ${pages.length - done} page${pages.length - done === 1 ? "" : "s"}`}
          </Button>
          <Button
            variant="outline"
            onClick={rerenderAll}
            disabled={running || done === 0}
          >
            Re-render with current settings
          </Button>
          <Button
            variant="secondary"
            onClick={downloadZip}
            disabled={zipping || done === 0}
          >
            <Download data-icon="inline-start" />
            {zipping ? "Zipping…" : `Download ZIP (${done})`}
          </Button>
        </div>

        {pages.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted-foreground">Queued</dt>
            <dd className="text-right font-mono">{pages.length - done}</dd>
            <dt className="text-muted-foreground">Done</dt>
            <dd className="text-right font-mono">{done}</dd>
            <dt className="text-muted-foreground">Needs review</dt>
            <dd className="text-right font-mono">{flagged}</dd>
          </dl>
        )}
      </aside>

      <main className="flex flex-1 flex-col gap-6 p-6">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            addFiles(e.dataTransfer.files)
          }}
          className="flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-card px-6 py-10 text-center"
        >
          <Upload className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-sm text-foreground">
            Drop PNG or JPG pages here, or
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()}>
              Choose files
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                const res = await fetch("/samples/naxlex-original.png")
                const blob = await res.blob()
                addFiles([new File([blob], "command-hallucinations.png", { type: "image/png" })])
              }}
            >
              Load sample page
            </Button>
            {pages.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setPages([])}
                disabled={running}
              >
                <Trash2 data-icon="inline-start" />
                Clear all
              </Button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
        </div>

        {pages.length > 0 && (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pages.map((p) => (
              <PageCard
                key={p.id}
                page={p}
                onTitleCommit={(t) => rerenderOne(p, t)}
                onRemove={() => setPages((prev) => prev.filter((x) => x.id !== p.id))}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
