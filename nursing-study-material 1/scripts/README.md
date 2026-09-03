# Batch rebrand script

Swaps the old header/footer on exported study pages for new branding and
renames the teal tips box. Runs fully offline on your computer.

## Setup (once)

1. Install Node.js 18 or newer from https://nodejs.org
2. Download this project (v0 → three dots → Download ZIP) and unzip it
3. In a terminal, inside the project folder:

```bash
npm install -g pnpm
pnpm install
```

## Run

Put all your source PNG/JPG files in one folder, then:

```bash
pnpm rebrand ./input ./output
```

Every page is written to `./output` as a PNG with the same file name, plus
`_report.csv` listing the title detected for each page and whether the teal
tips box was found. Open the report and spot-check any row marked `false`.

## Options

```bash
pnpm rebrand ./input ./output --url WWW.CAMBRIDGENURSE.COM   # brand text (default)
pnpm rebrand ./input ./output --tips "Success Tips"          # teal box title (default)
pnpm rebrand ./input ./output --no-tips                      # leave the teal box alone
pnpm rebrand ./input ./output --no-ocr                       # use file names as titles
pnpm rebrand ./input ./output --titles titles.csv            # override titles per file
pnpm rebrand ./input ./output --pad 45                       # space added under the header
pnpm rebrand ./input ./output --footer 0.045                 # footer wipe height (fraction)
```

`titles.csv` format (no header row):

```
command-hallucinations.png,Command Hallucinations
page-002.png,Delusions
```

## Fixing a wrong title

OCR occasionally misreads a word. Check `_report.csv`, put the corrected
lines into `titles.csv`, and re-run with `--titles titles.csv` on just the
affected files (copy them to a separate folder first).

## Where to change the look

Everything visual lives in `scripts/rebrand.mjs`:

- `drawHeader` — ribbon colours (`#1a4fd8`, `#14b1e6`), bar position, title font
- `drawFooter` — footer text size and position
- `drawTipsTitle` — teal box title band and underline
- `TEAL` — the colour used to find the tips box (`#00A79D`)

All sizes are relative to a 612px-wide page and scale automatically, so
higher-resolution exports of the same layout work unchanged.
