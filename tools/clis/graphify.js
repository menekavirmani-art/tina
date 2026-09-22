#!/usr/bin/env node

const fs = require('fs')

const PALETTE = ['#4C6EF5', '#F76707', '#12B886', '#E64980', '#7048E8', '#FAB005', '#1098AD', '#82C91E']

const THEMES = {
  light: { bg: '#ffffff', text: '#1a1a2e', muted: '#495057', grid: '#e9ecef', axis: '#adb5bd' },
  dark: { bg: '#1a1a2e', text: '#f1f3f5', muted: '#ced4da', grid: '#343a52', axis: '#495057' },
}

function parseArgs(argv) {
  const result = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) {
        result[key] = next
        i++
      } else {
        result[key] = true
      }
    } else {
      result._.push(arg)
    }
  }
  return result
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatNum(v) {
  if (Math.abs(v) >= 1000000) return (v / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Number(v.toFixed(2)).toString()
}

function parseCSV(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function loadData(raw, format) {
  if (format === 'json') {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('JSON input must be an array of objects')
    return parsed
  }
  const rows = parseCSV(raw.trim())
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).filter(r => r.length === headers.length).map(r => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = r[i] })
    return obj
  })
}

function niceTicks(min, max, count) {
  if (min === max) { min -= 1; max += 1 }
  const span = max - min
  const rawStep = span / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const err = rawStep / magnitude
  let step
  if (err >= 7.5) step = 10 * magnitude
  else if (err >= 3.5) step = 5 * magnitude
  else if (err >= 1.5) step = 2 * magnitude
  else step = magnitude
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks = []
  for (let v = niceMin; v <= niceMax + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)))
  return { min: niceMin, max: niceMax, ticks }
}

function bandScale(categories, start, end, paddingRatio) {
  const n = categories.length || 1
  const step = (end - start) / n
  const bandWidth = step * (1 - paddingRatio)
  return { step, bandWidth, x: i => start + step * i + (step - bandWidth) / 2 }
}

function pointScale(categories, start, end) {
  const n = categories.length
  const step = n > 1 ? (end - start) / (n - 1) : 0
  return { x: i => (n > 1 ? start + step * i : (start + end) / 2) }
}

function axisLabels(categories, band, y, theme, rotate) {
  return categories.map((c, i) => {
    const cx = band.x(i) + band.bandWidth / 2
    if (rotate) {
      return `<text x="${cx.toFixed(2)}" y="${(y + 8).toFixed(2)}" font-size="11" fill="${theme.muted}" text-anchor="end" transform="rotate(-35 ${cx.toFixed(2)} ${(y + 8).toFixed(2)})">${esc(c)}</text>`
    }
    return `<text x="${cx.toFixed(2)}" y="${(y + 18).toFixed(2)}" font-size="11" fill="${theme.muted}" text-anchor="middle">${esc(c)}</text>`
  }).join('\n')
}

function chartHeader(opts, theme) {
  const parts = [`<rect x="0" y="0" width="${opts.width}" height="${opts.height}" fill="${theme.bg}"/>`]
  if (opts.title) {
    parts.push(`<text x="${opts.width / 2}" y="28" font-size="16" font-weight="600" fill="${theme.text}" text-anchor="middle" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">${esc(opts.title)}</text>`)
  }
  return parts
}

function legendRow(names, colors, width, top) {
  const swatch = 10
  const gap = 16
  const itemWidths = names.map(n => swatch + 6 + n.length * 6.5 + gap)
  const totalWidth = itemWidths.reduce((a, b) => a + b, 0)
  let x = (width - totalWidth) / 2
  const items = names.map((n, i) => {
    const color = colors[i % colors.length]
    const item = `<rect x="${x.toFixed(2)}" y="${(top - swatch + 2).toFixed(2)}" width="${swatch}" height="${swatch}" rx="2" fill="${color}"/>` +
      `<text x="${(x + swatch + 6).toFixed(2)}" y="${(top + 2).toFixed(2)}" font-size="12" fill="currentColor">${esc(n)}</text>`
    x += itemWidths[i]
    return item
  })
  return items.join('\n')
}

function renderBar(data, opts) {
  const theme = THEMES[opts.theme]
  const { xField, yField, seriesField } = opts
  const categories = [...new Set(data.map(d => d[xField]))]
  const seriesNames = seriesField ? [...new Set(data.map(d => d[seriesField]))] : ['value']

  const lookup = {}
  categories.forEach(c => { lookup[c] = {} })
  data.forEach(d => {
    const cat = d[xField]
    const s = seriesField ? d[seriesField] : 'value'
    const v = Number(d[yField])
    if (!Number.isNaN(v) && lookup[cat]) lookup[cat][s] = (lookup[cat][s] || 0) + v
  })

  const allValues = []
  categories.forEach(c => seriesNames.forEach(s => allValues.push(lookup[c][s] || 0)))
  const maxVal = Math.max(0, ...allValues)
  const { max: niceMax, ticks } = niceTicks(0, maxVal, 5)

  const hasLegend = !!seriesField
  const pad = { top: (opts.title ? 44 : 20) + (hasLegend ? 28 : 0), right: 24, bottom: categories.length > 6 ? 70 : 44, left: 56 }
  const plotW = opts.width - pad.left - pad.right
  const plotH = opts.height - pad.top - pad.bottom

  const yScale = v => pad.top + plotH - (v / (niceMax || 1)) * plotH
  const band = bandScale(categories, pad.left, pad.left + plotW, 0.3)
  const subWidth = band.bandWidth / seriesNames.length

  const parts = chartHeader(opts, theme)

  ticks.forEach(t => {
    const ty = yScale(t)
    parts.push(`<line x1="${pad.left}" y1="${ty.toFixed(2)}" x2="${pad.left + plotW}" y2="${ty.toFixed(2)}" stroke="${theme.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${pad.left - 8}" y="${(ty + 4).toFixed(2)}" font-size="11" fill="${theme.muted}" text-anchor="end">${formatNum(t)}</text>`)
  })
  parts.push(`<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="${theme.axis}" stroke-width="1"/>`)

  categories.forEach((cat, ci) => {
    seriesNames.forEach((s, si) => {
      const v = lookup[cat][s] || 0
      const x = band.x(ci) + si * subWidth
      const y = yScale(v)
      const h = pad.top + plotH - y
      if (h > 0) {
        parts.push(`<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(subWidth * 0.85).toFixed(2)}" height="${h.toFixed(2)}" fill="${opts.colors[si % opts.colors.length]}" rx="2"/>`)
      }
    })
  })

  parts.push(axisLabels(categories, band, pad.top + plotH, theme, categories.length > 6))
  if (hasLegend) {
    parts.push(`<g color="${theme.text}">${legendRow(seriesNames, opts.colors, opts.width, pad.top - 12)}</g>`)
  }

  return svgWrap(opts, parts)
}

function renderLine(data, opts) {
  const theme = THEMES[opts.theme]
  const { xField, yField, seriesField } = opts
  const categories = [...new Set(data.map(d => d[xField]))]
  const seriesNames = seriesField ? [...new Set(data.map(d => d[seriesField]))] : ['value']

  const lookup = {}
  seriesNames.forEach(s => { lookup[s] = {} })
  data.forEach(d => {
    const cat = d[xField]
    const s = seriesField ? d[seriesField] : 'value'
    const v = Number(d[yField])
    if (!Number.isNaN(v)) lookup[s][cat] = v
  })

  const allValues = []
  seriesNames.forEach(s => categories.forEach(c => { if (lookup[s][c] !== undefined) allValues.push(lookup[s][c]) }))
  if (allValues.length === 0) throw new Error('No numeric values found for --y field')
  const { min: niceMin, max: niceMax, ticks } = niceTicks(Math.min(0, ...allValues), Math.max(0, ...allValues), 5)

  const hasLegend = !!seriesField
  const pad = { top: (opts.title ? 44 : 20) + (hasLegend ? 28 : 0), right: 24, bottom: categories.length > 6 ? 70 : 44, left: 56 }
  const plotW = opts.width - pad.left - pad.right
  const plotH = opts.height - pad.top - pad.bottom

  const yScale = v => pad.top + plotH - (v - niceMin) / ((niceMax - niceMin) || 1) * plotH
  const point = pointScale(categories, pad.left, pad.left + plotW)
  const band = { x: i => point.x(i), bandWidth: 0 }

  const parts = chartHeader(opts, theme)

  ticks.forEach(t => {
    const ty = yScale(t)
    parts.push(`<line x1="${pad.left}" y1="${ty.toFixed(2)}" x2="${pad.left + plotW}" y2="${ty.toFixed(2)}" stroke="${theme.grid}" stroke-width="1"/>`)
    parts.push(`<text x="${pad.left - 8}" y="${(ty + 4).toFixed(2)}" font-size="11" fill="${theme.muted}" text-anchor="end">${formatNum(t)}</text>`)
  })
  parts.push(`<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${pad.top + plotH}" stroke="${theme.axis}" stroke-width="1"/>`)

  seriesNames.forEach((s, si) => {
    const color = opts.colors[si % opts.colors.length]
    const pts = categories.map((c, i) => (lookup[s][c] !== undefined ? [point.x(i), yScale(lookup[s][c])] : null)).filter(Boolean)
    if (pts.length === 0) return
    const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`)
    pts.forEach(([x, y]) => parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3" fill="${color}"/>`))
  })

  parts.push(axisLabels(categories, band, pad.top + plotH, theme, categories.length > 6))
  if (hasLegend) {
    parts.push(`<g color="${theme.text}">${legendRow(seriesNames, opts.colors, opts.width, pad.top - 12)}</g>`)
  }

  return svgWrap(opts, parts)
}

function renderPie(data, opts) {
  const theme = THEMES[opts.theme]
  const items = data
    .map(d => ({ label: d[opts.labelField], value: Number(d[opts.valueField]) }))
    .filter(d => !Number.isNaN(d.value) && d.value > 0)
  if (items.length === 0) throw new Error('No positive numeric values found for --value field')
  const total = items.reduce((a, b) => a + b.value, 0)

  const pad = { top: opts.title ? 44 : 20 }
  const legendWidth = Math.min(220, opts.width * 0.4)
  const cx = pad.top + (opts.width - legendWidth - pad.top) / 2
  const cy = pad.top + (opts.height - pad.top) / 2
  const r = Math.min(opts.width - legendWidth, opts.height - pad.top) / 2 - 24

  const parts = chartHeader(opts, theme)
  let angle = -Math.PI / 2
  items.forEach((item, i) => {
    const frac = item.value / total
    const start = angle
    const end = angle + frac * 2 * Math.PI
    angle = end
    const large = frac > 0.5 ? 1 : 0
    const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end)
    const color = opts.colors[i % opts.colors.length]
    if (items.length === 1) {
      parts.push(`<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${color}"/>`)
    } else {
      const d = `M ${cx.toFixed(2)},${cy.toFixed(2)} L ${x1.toFixed(2)},${y1.toFixed(2)} A ${r.toFixed(2)},${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`
      parts.push(`<path d="${d}" fill="${color}" stroke="${theme.bg}" stroke-width="2"/>`)
    }
  })

  const legendX = opts.width - legendWidth + 16
  let legendY = cy - (items.length * 22) / 2
  items.forEach((item, i) => {
    const color = opts.colors[i % opts.colors.length]
    const pct = ((item.value / total) * 100).toFixed(1)
    parts.push(`<rect x="${legendX}" y="${(legendY - 10).toFixed(2)}" width="12" height="12" rx="2" fill="${color}"/>`)
    parts.push(`<text x="${legendX + 18}" y="${legendY.toFixed(2)}" font-size="12" fill="${theme.text}">${esc(item.label)} (${pct}%)</text>`)
    legendY += 22
  })

  return svgWrap(opts, parts)
}

function renderSparkline(data, opts) {
  const theme = THEMES[opts.theme]
  const values = data.map(d => Number(d[opts.yField])).filter(v => !Number.isNaN(v))
  if (values.length < 2) throw new Error('Need at least 2 numeric values for --y field')
  const min = Math.min(...values), max = Math.max(...values)
  const p = 4
  const w = opts.width, h = opts.height
  const pts = values.map((v, i) => [
    p + (i / (values.length - 1)) * (w - 2 * p),
    p + (1 - (v - min) / ((max - min) || 1)) * (h - 2 * p),
  ])
  const color = opts.colors[0]
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(2)},${(h - p).toFixed(2)} L${pts[0][0].toFixed(2)},${(h - p).toFixed(2)} Z`
  const last = pts[pts.length - 1]
  const parts = [
    `<rect x="0" y="0" width="${w}" height="${h}" fill="${theme.bg}"/>`,
    `<path d="${area}" fill="${color}" fill-opacity="0.12"/>`,
    `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    `<circle cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="2.5" fill="${color}"/>`,
  ]
  return svgWrap(opts, parts)
}

function svgWrap(opts, parts) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">\n${parts.join('\n')}\n</svg>\n`
}

function readInput(args) {
  const src = args.data
  const raw = (!src || src === '-') ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8')
  const format = args.format || (src && src.endsWith('.json') ? 'json' : 'csv')
  return loadData(raw, format)
}

function printHelp() {
  console.error(JSON.stringify({
    usage: {
      bar: 'graphify bar --data <file.csv|file.json|-> --x <field> --y <field> [--series <field>] [--title <text>] [--out <file.svg>]',
      line: 'graphify line --data <file> --x <field> --y <field> [--series <field>] [--title <text>] [--out <file.svg>]',
      pie: 'graphify pie --data <file> --label <field> --value <field> [--title <text>] [--out <file.svg>]',
      sparkline: 'graphify sparkline --data <file> --y <field> [--out <file.svg>]',
    },
    options: {
      '--data': 'Path to a CSV or JSON (array of objects) file, or "-" for stdin (default: stdin)',
      '--format': 'Force "csv" or "json" instead of inferring from the file extension',
      '--width / --height': 'Chart dimensions in px (defaults: 640x400, sparkline 240x60)',
      '--theme': '"light" (default) or "dark"',
      '--colors': 'Comma-separated hex colors to override the default palette',
      '--out': 'Write the SVG to a file instead of stdout (prints a JSON confirmation)',
    },
  }, null, 2))
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const [type] = args._

  if (!type || args.help) { printHelp(); process.exit(type ? 0 : 1) }

  const validTypes = ['bar', 'line', 'pie', 'sparkline']
  if (!validTypes.includes(type)) {
    console.error(JSON.stringify({ error: `Unknown chart type "${type}". Use: ${validTypes.join(', ')}` }))
    process.exit(1)
  }

  let data
  try {
    data = readInput(args)
  } catch (err) {
    console.error(JSON.stringify({ error: `Failed to read --data: ${err.message}` }))
    process.exit(1)
  }
  if (!Array.isArray(data) || data.length === 0) {
    console.error(JSON.stringify({ error: 'No data rows found' }))
    process.exit(1)
  }

  const opts = {
    width: Number(args.width) || (type === 'sparkline' ? 240 : 640),
    height: Number(args.height) || (type === 'sparkline' ? 60 : 400),
    theme: THEMES[args.theme] ? args.theme : 'light',
    colors: args.colors ? args.colors.split(',') : PALETTE,
    title: typeof args.title === 'string' ? args.title : undefined,
    xField: args.x,
    yField: args.y,
    labelField: args.label,
    valueField: args.value,
    seriesField: args.series,
  }

  let svg
  try {
    if (type === 'bar') {
      if (!args.x || !args.y) throw new Error('--x and --y are required')
      svg = renderBar(data, opts)
    } else if (type === 'line') {
      if (!args.x || !args.y) throw new Error('--x and --y are required')
      svg = renderLine(data, opts)
    } else if (type === 'pie') {
      if (!args.label || !args.value) throw new Error('--label and --value are required')
      svg = renderPie(data, opts)
    } else {
      if (!args.y) throw new Error('--y is required')
      svg = renderSparkline(data, opts)
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }))
    process.exit(1)
  }

  if (args.out) {
    fs.writeFileSync(args.out, svg)
    console.log(JSON.stringify({ file: args.out, type, rows: data.length, width: opts.width, height: opts.height }, null, 2))
  } else {
    process.stdout.write(svg)
  }
}

main()
