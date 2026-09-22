# Graphify

Zero-dependency local CLI that turns CSV/JSON data into SVG charts. Unlike every other tool in this registry, it wraps no external API — it's a pure data-to-SVG renderer, so there's nothing to authenticate and no account to create.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | - | Not applicable — runs locally |
| MCP | - | Not available |
| CLI | ✓ | [clis/graphify.js](../clis/graphify.js), Node 18+, no npm install |
| SDK | - | Not applicable |

## Authentication

None. No API key, no environment variable.

## Command Pattern

```
graphify <bar|line|pie|sparkline> [options]
```

Data comes from `--data <file>` (CSV or JSON, inferred from the extension) or stdin (default, or `--data -`). Output is the raw SVG on stdout, or written to `--out <file>` (which also prints a small JSON confirmation instead of the SVG).

## Common Agent Operations

### Grouped bar chart from a CSV

```bash
node tools/clis/graphify.js bar \
  --data spend.csv --x month --y spend --series channel \
  --title "Spend by Channel" --out spend-by-channel.svg
```

Expects tidy/long-format rows, e.g.:

```csv
channel,month,spend
Email,Jan,1200
Paid Social,Jan,2200
```

### Line chart / trend

```bash
node tools/clis/graphify.js line \
  --data traffic.csv --x week --y sessions --series source \
  --title "Sessions by Source" --out traffic.svg
```

### Pie chart from JSON piped over stdin

```bash
echo '[{"channel":"Email","spend":3700},{"channel":"Paid Social","spend":7900}]' \
  | node tools/clis/graphify.js pie --label channel --value spend --out mix.svg
```

### Sparkline for a KPI tile

```bash
node tools/clis/graphify.js sparkline --data revenue.csv --y value --out spark.svg
```

## Options

| Flag | Applies to | Description |
|------|-----------|-------------|
| `--data` | all | Path to `.csv`/`.json`, or `-`/omitted for stdin |
| `--format` | all | Force `csv` or `json` if the extension is ambiguous |
| `--x`, `--y` | bar, line | Category field and numeric value field |
| `--series` | bar, line | Field to group/color multiple series by (tidy/long data) |
| `--label`, `--value` | pie | Slice label field and numeric value field |
| `--y` | sparkline | Numeric value field (row order is the x-axis) |
| `--title` | bar, line, pie | Chart title |
| `--width`, `--height` | all | Pixel dimensions (default 640x400, sparkline 240x60) |
| `--theme` | all | `light` (default) or `dark` |
| `--colors` | all | Comma-separated hex colors to override the default palette |
| `--out` | all | Write SVG to a file; prints `{file, type, rows, width, height}` JSON instead of the SVG |

## Key Features

- Grouped bar and multi-series line charts from tidy (long-format) data via `--series`
- Pie charts with an auto-generated percentage legend
- Sparklines for compact KPI tiles
- Light/dark theme and custom color palettes
- SVG output — embeds directly in HTML reports, Markdown (via `<img>`), or emails; scales without pixelation

## When to Use

- Turning another CLI's JSON output (e.g. `ga4`, `mixpanel`, `google-ads`) into a chart for a report
- Building a quick visual for a campaign performance summary
- Adding a sparkline to a dashboard or KPI card
- Any case where you want a chart without standing up a charting API or paid service

## Limitations

- SVG only — no PNG/raster export (pipe through a headless browser or image tool if you need a raster file)
- No stacked bars, log scales, or annotations — for anything beyond bar/line/pie/sparkline, use the `dataviz` skill's guidance to build a richer artifact
- CSV parsing is RFC 4180-ish (handles quoted fields and commas) but not a full spec implementation

## Relevant Skills

- analytics
