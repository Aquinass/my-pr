"use client"

import { useEffect, useState } from "react"
import type { ProcessedPage } from "@/lib/rebrand"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Check, Loader2, X } from "lucide-react"

type Props = {
  page: ProcessedPage
  onTitleCommit: (title: string) => void
  onRemove: () => void
}

const statusLabel: Record<ProcessedPage["status"], string> = {
  queued: "Queued",
  ocr: "Reading title…",
  rendering: "Rendering…",
  done: "Done",
  error: "Error",
}

export function PageCard({ page, onTitleCommit, onRemove }: Props) {
  const [title, setTitle] = useState(page.title)
  const [view, setView] = useState<"after" | "before">("after")
  useEffect(() => setTitle(page.title), [page.title])

  const busy = page.status === "ocr" || page.status === "rendering"
  const shown = view === "after" && page.outputUrl ? page.outputUrl : page.originalUrl

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="relative overflow-hidden rounded-md border border-border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shown}
          alt={`${view === "after" ? "Rebranded" : "Original"} page: ${page.title}`}
          className="aspect-[612/792] w-full object-cover object-top"
        />
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin text-foreground" aria-hidden />
            <span className="sr-only">{statusLabel[page.status]}</span>
          </div>
        )}
        {page.outputUrl && (
          <div className="absolute right-2 top-2 flex rounded-md border border-border bg-background text-xs">
            {(["before", "after"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`px-2 py-1 capitalize ${view === v ? "bg-foreground text-background" : "text-foreground"} first:rounded-l-md last:rounded-r-md`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate font-mono text-muted-foreground" title={page.fileName}>
            {page.fileName}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            {page.status === "done" && <Check className="size-3.5 text-primary" aria-hidden />}
            {page.status === "error" && <AlertTriangle className="size-3.5 text-destructive" aria-hidden />}
            {statusLabel[page.status]}
          </span>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (title.trim() && title !== page.title) onTitleCommit(title.trim())
          }}
        >
          <input
            aria-label="Page title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== page.title && onTitleCommit(title.trim())}
            disabled={busy}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove page">
            <X />
          </Button>
        </form>

        {page.status === "done" && !page.tipsBoxFound && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AlertTriangle className="size-3.5" aria-hidden />
            No teal tips box detected — title band left untouched.
          </p>
        )}
        {page.error && <p className="text-xs text-destructive">{page.error}</p>}
      </div>
    </li>
  )
}
