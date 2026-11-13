#!/usr/bin/env node
// AppFlowy Cloud CLI + MCP server (zero dependencies, Node 18+).
//
//   node tools/clis/appflowy.js workspaces list
//   node tools/clis/appflowy.js mcp            # stdio MCP server
//
// Auth (env):
//   APPFLOWY_BASE_URL   AppFlowy Cloud URL (default https://beta.appflowy.cloud)
//   APPFLOWY_TOKEN      GoTrue access token, or
//   APPFLOWY_EMAIL + APPFLOWY_PASSWORD   password login via {base}/gotrue/token
//
// Routes follow AppFlowy-Cloud src/api/workspace.rs (/api/workspace/...).

const BASE_URL = (process.env.APPFLOWY_BASE_URL || 'https://beta.appflowy.cloud').replace(/\/+$/, '')
const LAYOUTS = { document: 0, grid: 1, board: 2, calendar: 3, chat: 4 }

let cachedToken = process.env.APPFLOWY_TOKEN || null
let dryRun = false

async function getToken() {
  if (cachedToken) return cachedToken
  const email = process.env.APPFLOWY_EMAIL
  const password = process.env.APPFLOWY_PASSWORD
  if (!email || !password) {
    throw new Error('Set APPFLOWY_TOKEN, or APPFLOWY_EMAIL and APPFLOWY_PASSWORD')
  }
  const res = await fetch(`${BASE_URL}/gotrue/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) {
    throw new Error(`Login failed (${res.status}): ${data.error_description || data.msg || data.error || 'no access_token'}`)
  }
  cachedToken = data.access_token
  return cachedToken
}

async function api(method, path, body) {
  const url = `${BASE_URL}${path}`
  if (dryRun) {
    return { _dry_run: true, method, url, headers: { Authorization: 'Bearer ***', 'Content-Type': 'application/json' }, body: body || undefined }
  }
  const token = await getToken()
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { return { status: res.status, body: text } }
  // AppFlowy wraps responses as { code, message, data }; code 0 is success.
  if (json && typeof json === 'object' && 'code' in json) {
    if (json.code !== 0) return { error: json.message || 'AppFlowy error', code: json.code, status: res.status }
    return json.data === undefined ? { ok: true } : json.data
  }
  return json
}

// Turn plain text / light markdown into AppFlowy blocks.
function textToBlocks(text) {
  const blocks = []
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (!line.trim()) continue
    let m
    const delta = (s) => [{ insert: s }]
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) blocks.push({ type: 'heading', data: { level: m[1].length, delta: delta(m[2]) } })
    else if ((m = line.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/))) blocks.push({ type: 'todo_list', data: { checked: m[1] !== ' ', delta: delta(m[2]) } })
    else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) blocks.push({ type: 'bulleted_list', data: { delta: delta(m[1]) } })
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) blocks.push({ type: 'numbered_list', data: { delta: delta(m[1]) } })
    else if ((m = line.match(/^>\s?(.*)$/))) blocks.push({ type: 'quote', data: { delta: delta(m[1]) } })
    else blocks.push({ type: 'paragraph', data: { delta: delta(line) } })
  }
  return blocks
}

const ws = (id) => `/api/workspace/${encodeURIComponent(id)}`

// One table drives both the CLI and the MCP server.
const TOOLS = [
  {
    name: 'list_workspaces', cli: ['workspaces', 'list'],
    description: 'List the AppFlowy workspaces the user belongs to.',
    params: {},
    run: () => api('GET', '/api/workspace'),
  },
  {
    name: 'get_folder', cli: ['folder', 'get'],
    description: 'Get the page tree (spaces, pages, databases) of a workspace.',
    params: { workspace_id: { type: 'string', required: true }, depth: { type: 'number', description: 'Tree depth (default server-side)' }, root_view_id: { type: 'string', description: 'Start from this view instead of the workspace root' } },
    run: (a) => {
      const q = new URLSearchParams()
      if (a.depth) q.set('depth', String(a.depth))
      if (a.root_view_id) q.set('root_view_id', a.root_view_id)
      const qs = q.toString()
      return api('GET', `${ws(a.workspace_id)}/folder${qs ? `?${qs}` : ''}`)
    },
  },
  {
    name: 'get_page', cli: ['pages', 'get'],
    description: 'Get a page view and its data.',
    params: { workspace_id: { type: 'string', required: true }, view_id: { type: 'string', required: true } },
    run: (a) => api('GET', `${ws(a.workspace_id)}/page-view/${encodeURIComponent(a.view_id)}`),
  },
  {
    name: 'create_page', cli: ['pages', 'create'],
    description: 'Create a page under a parent view (a space or another page). Optional text is appended as blocks; lines starting with #, -, 1., - [ ] or > become headings, bullets, numbered items, to-dos or quotes.',
    params: {
      workspace_id: { type: 'string', required: true },
      parent_view_id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      layout: { type: 'string', description: 'document (default), grid, board, calendar or chat' },
      text: { type: 'string', description: 'Initial content for a document page' },
    },
    run: async (a) => {
      const layout = LAYOUTS[(a.layout || 'document').toLowerCase()]
      if (layout === undefined) return { error: `Unknown layout: ${a.layout}` }
      const created = await api('POST', `${ws(a.workspace_id)}/page-view`, { parent_view_id: a.parent_view_id, layout, name: a.name })
      if (a.text && created._dry_run) return { create: created, then_append_blocks: textToBlocks(a.text) }
      if (!a.text || created.error) return created
      const viewId = created.view_id
      if (!viewId) return { created, warning: 'No view_id returned; text not appended' }
      const appended = await api('POST', `${ws(a.workspace_id)}/page-view/${encodeURIComponent(viewId)}/append-block`, { blocks: textToBlocks(a.text) })
      return { ...created, appended: appended.error ? appended : true }
    },
  },
  {
    name: 'append_to_page', cli: ['pages', 'append'],
    description: 'Append text to the end of a document page. Lines starting with #, -, 1., - [ ] or > become headings, bullets, numbered items, to-dos or quotes.',
    params: { workspace_id: { type: 'string', required: true }, view_id: { type: 'string', required: true }, text: { type: 'string', required: true } },
    run: (a) => api('POST', `${ws(a.workspace_id)}/page-view/${encodeURIComponent(a.view_id)}/append-block`, { blocks: textToBlocks(a.text) }),
  },
  {
    name: 'rename_page', cli: ['pages', 'rename'],
    description: 'Rename a page.',
    params: { workspace_id: { type: 'string', required: true }, view_id: { type: 'string', required: true }, name: { type: 'string', required: true } },
    run: (a) => api('POST', `${ws(a.workspace_id)}/page-view/${encodeURIComponent(a.view_id)}/update-name`, { name: a.name }),
  },
  {
    name: 'trash_page', cli: ['pages', 'trash'],
    description: 'Move a page to the trash (restorable in AppFlowy).',
    params: { workspace_id: { type: 'string', required: true }, view_id: { type: 'string', required: true } },
    run: (a) => api('POST', `${ws(a.workspace_id)}/page-view/${encodeURIComponent(a.view_id)}/move-to-trash`, {}),
  },
  {
    name: 'list_databases', cli: ['databases', 'list'],
    description: 'List databases (grids, boards, calendars) in a workspace.',
    params: { workspace_id: { type: 'string', required: true } },
    run: (a) => api('GET', `${ws(a.workspace_id)}/database`),
  },
  {
    name: 'get_database_fields', cli: ['databases', 'fields'],
    description: 'List the fields (columns) of a database.',
    params: { workspace_id: { type: 'string', required: true }, database_id: { type: 'string', required: true } },
    run: (a) => api('GET', `${ws(a.workspace_id)}/database/${encodeURIComponent(a.database_id)}/fields`),
  },
  {
    name: 'list_database_rows', cli: ['rows', 'list'],
    description: 'List the row ids of a database.',
    params: { workspace_id: { type: 'string', required: true }, database_id: { type: 'string', required: true } },
    run: (a) => api('GET', `${ws(a.workspace_id)}/database/${encodeURIComponent(a.database_id)}/row`),
  },
  {
    name: 'get_database_rows', cli: ['rows', 'get'],
    description: 'Get cell values for database rows.',
    params: { workspace_id: { type: 'string', required: true }, database_id: { type: 'string', required: true }, ids: { type: 'string', required: true, description: 'Comma-separated row ids' }, with_doc: { type: 'boolean', description: 'Include each row document as markdown' } },
    run: (a) => {
      const q = new URLSearchParams({ ids: a.ids })
      if (a.with_doc) q.set('with_doc', 'true')
      return api('GET', `${ws(a.workspace_id)}/database/${encodeURIComponent(a.database_id)}/row/detail?${q}`)
    },
  },
  {
    name: 'add_database_row', cli: ['rows', 'add'],
    description: 'Add a row to a database. cells maps field names or ids to values.',
    params: { workspace_id: { type: 'string', required: true }, database_id: { type: 'string', required: true }, cells: { type: 'object', required: true, description: 'e.g. {"Name": "Launch post", "Status": "Draft"}' }, document: { type: 'string', description: 'Markdown body for the row page' } },
    run: (a) => {
      let cells = a.cells
      if (typeof cells === 'string') { try { cells = JSON.parse(cells) } catch { return { error: 'cells must be a JSON object' } } }
      const body = { cells }
      if (a.document) body.document = a.document
      return api('POST', `${ws(a.workspace_id)}/database/${encodeURIComponent(a.database_id)}/row`, body)
    },
  },
]

function missing(tool, a) {
  return Object.entries(tool.params).filter(([k, p]) => p.required && (a[k] === undefined || a[k] === '')).map(([k]) => k)
}

// ---------- MCP (stdio, newline-delimited JSON-RPC) ----------
function runMcp() {
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
  const toolList = TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(Object.entries(t.params).map(([k, p]) => [k, { type: p.type, ...(p.description ? { description: p.description } : {}) }])),
      required: Object.entries(t.params).filter(([, p]) => p.required).map(([k]) => k),
    },
  }))

  async function handle(msg) {
    const { id, method, params } = msg
    if (id === undefined) return // notification
    try {
      if (method === 'initialize') {
        return send({ jsonrpc: '2.0', id, result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'appflowy', version: '1.0.0' } } })
      }
      if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} })
      if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: toolList } })
      if (method === 'tools/call') {
        const tool = TOOLS.find((t) => t.name === params?.name)
        if (!tool) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } })
        const a = params.arguments || {}
        const miss = missing(tool, a)
        let out
        if (miss.length) out = { error: `Missing required: ${miss.join(', ')}` }
        else {
          try { out = await tool.run(a) } catch (e) { out = { error: e.message } }
        }
        return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], isError: Boolean(out && out.error) } })
      }
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } })
    } catch (e) {
      send({ jsonrpc: '2.0', id, error: { code: -32603, message: e.message } })
    }
  }

  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue }
      handle(msg)
    }
  })
}

// ---------- CLI ----------
function parseArgs(argv) {
  const result = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-/g, '_')
      const next = argv[i + 1]
      if (next !== undefined && !next.startsWith('--')) { result[key] = next; i++ } else result[key] = true
    } else result._.push(arg)
  }
  return result
}

function usage() {
  const lines = TOOLS.map((t) => {
    const flags = Object.entries(t.params).map(([k, p]) => (p.required ? `--${k.replace(/_/g, '-')} <${k}>` : `[--${k.replace(/_/g, '-')}]`)).join(' ')
    return `  ${t.cli.join(' ')} ${flags}`.trimEnd()
  })
  return [
    'Usage: appflowy <command> [flags] [--dry-run]',
    '       appflowy mcp     Run as a stdio MCP server',
    '',
    'Commands:',
    ...lines,
    '',
    'Env: APPFLOWY_BASE_URL, APPFLOWY_TOKEN or APPFLOWY_EMAIL + APPFLOWY_PASSWORD',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const [cmd, sub] = args._
  if (cmd === 'mcp') return runMcp()
  if (!cmd) { console.log(usage()); return }
  dryRun = Boolean(args.dry_run)
  const tool = TOOLS.find((t) => t.cli[0] === cmd && t.cli[1] === sub)
  if (!tool) { console.error(JSON.stringify({ error: `Unknown command: ${[cmd, sub].filter(Boolean).join(' ')}` })); console.error(usage()); process.exit(1) }
  const miss = missing(tool, args)
  if (miss.length) { console.error(JSON.stringify({ error: `Missing required: ${miss.map((k) => `--${k.replace(/_/g, '-')}`).join(', ')}` })); process.exit(1) }
  try {
    const out = await tool.run(args)
    console.log(JSON.stringify(out, null, 2))
    if (out && out.error) process.exit(1)
  } catch (e) {
    console.error(JSON.stringify({ error: e.message }))
    process.exit(1)
  }
}

main()
