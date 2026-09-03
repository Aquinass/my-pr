"use client"

import type { RebrandSettings } from "@/lib/rebrand"

type Props = {
  settings: RebrandSettings
  onChange: (s: RebrandSettings) => void
}

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"

export function SettingsPanel({ settings, onChange }: Props) {
  const set = <K extends keyof RebrandSettings>(k: K, v: RebrandSettings[K]) =>
    onChange({ ...settings, [k]: v })

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Brand settings
      </legend>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-foreground">Website (header &amp; footer)</span>
        <input
          className={inputCls}
          value={settings.brandUrl}
          onChange={(e) => set("brandUrl", e.target.value)}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-primary"
          checked={settings.replaceTipsTitle}
          onChange={(e) => set("replaceTipsTitle", e.target.checked)}
        />
        <span className="text-foreground">Rewrite teal box title</span>
      </label>

      {settings.replaceTipsTitle && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-foreground">New box title</span>
          <input
            className={inputCls}
            value={settings.tipsTitle}
            onChange={(e) => set("tipsTitle", e.target.value)}
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="flex justify-between text-foreground">
          Footer wipe height
          <span className="font-mono text-muted-foreground">
            {Math.round(settings.footerHeightPct * 100)}%
          </span>
        </span>
        <input
          type="range"
          min={2}
          max={10}
          step={0.5}
          value={settings.footerHeightPct * 100}
          onChange={(e) => set("footerHeightPct", Number(e.target.value) / 100)}
          className="accent-primary"
        />
      </label>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Page titles are read from the old header with OCR. Edit any title on
        its card and it re-renders instantly.
      </p>
    </fieldset>
  )
}
