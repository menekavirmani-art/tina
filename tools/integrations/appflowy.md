# AppFlowy

Open-source (AGPL-3.0) workspace for docs, wikis, and databases (grids, boards, calendars), and an alternative to Notion. You can self-host its sync server, **AppFlowy Cloud**, or use the hosted one. The app's source is in this repo at [`apps/appflowy/`](../../apps/appflowy/). Upstream: [AppFlowy-IO/AppFlowy](https://github.com/AppFlowy-IO/AppFlowy).

Use it when you want campaign plans, content calendars, and briefs in a workspace you own, and want an agent to read and write them.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | ✓ | AppFlowy Cloud REST API under `/api/workspace` |
| MCP | ✓ | `node tools/clis/appflowy.js mcp` (stdio, in this repo) |
| CLI | ✓ | [appflowy.js](../clis/appflowy.js) |
| SDK | - | Upstream Rust `client-api` crate only |

## Authentication

- **Type**: Bearer token from AppFlowy Cloud's GoTrue auth service
- **Header**: `Authorization: Bearer {access_token}`
- **Env vars**:
  - `APPFLOWY_BASE_URL`: your AppFlowy Cloud URL (default `https://beta.appflowy.cloud`)
  - `APPFLOWY_TOKEN`: an access token, **or**
  - `APPFLOWY_EMAIL` + `APPFLOWY_PASSWORD`: the CLI logs in via `POST {base}/gotrue/token?grant_type=password`
- Password login only works for accounts that have a password. On a self-hosted server, create one in the admin console. On the hosted cloud, which signs in with magic links or OAuth, copy an access token from a signed-in session instead.

## MCP Setup

Claude Code:

```bash
claude mcp add appflowy -e APPFLOWY_BASE_URL=https://your-appflowy.example.com -e APPFLOWY_EMAIL=you@example.com -e APPFLOWY_PASSWORD=... -- node /path/to/marketingskills/tools/clis/appflowy.js mcp
```

Any MCP client (JSON config):

```json
{
  "mcpServers": {
    "appflowy": {
      "command": "node",
      "args": ["/path/to/marketingskills/tools/clis/appflowy.js", "mcp"],
      "env": { "APPFLOWY_BASE_URL": "https://your-appflowy.example.com", "APPFLOWY_TOKEN": "..." }
    }
  }
}
```

## Tools / Commands

| MCP tool | CLI | Endpoint |
|----------|-----|----------|
| `list_workspaces` | `workspaces list` | `GET /api/workspace` |
| `get_folder` | `folder get` | `GET /api/workspace/{id}/folder` |
| `get_page` | `pages get` | `GET /api/workspace/{id}/page-view/{view_id}` |
| `create_page` | `pages create` | `POST /api/workspace/{id}/page-view` (+ `append-block` for `text`) |
| `append_to_page` | `pages append` | `POST /api/workspace/{id}/page-view/{view_id}/append-block` |
| `rename_page` | `pages rename` | `POST /api/workspace/{id}/page-view/{view_id}/update-name` |
| `trash_page` | `pages trash` | `POST /api/workspace/{id}/page-view/{view_id}/move-to-trash` |
| `list_databases` | `databases list` | `GET /api/workspace/{id}/database` |
| `get_database_fields` | `databases fields` | `GET /api/workspace/{id}/database/{db}/fields` |
| `list_database_rows` | `rows list` | `GET /api/workspace/{id}/database/{db}/row` |
| `get_database_rows` | `rows get` | `GET /api/workspace/{id}/database/{db}/row/detail?ids=...` |
| `add_database_row` | `rows add` | `POST /api/workspace/{id}/database/{db}/row` |

Text passed to `create_page` / `append_to_page` is converted to AppFlowy blocks. Lines starting with `#`, `-`, `1.`, `- [ ]` and `>` become headings, bullets, numbered items, to-dos and quotes. Everything else becomes a paragraph.

## Examples

```bash
# Find your workspace and its spaces
node tools/clis/appflowy.js workspaces list
node tools/clis/appflowy.js folder get --workspace-id <ws> --depth 2

# Create a campaign brief under a space
node tools/clis/appflowy.js pages create --workspace-id <ws> --parent-view-id <space> \
  --name "Q1 launch brief" --text $'# Goal\nShip v2 to 500 signups\n- [ ] Draft landing page'

# Log a content calendar entry
node tools/clis/appflowy.js rows add --workspace-id <ws> --database-id <db> \
  --cells '{"Name": "Launch post", "Status": "Draft"}'

# Preview any request without sending it
node tools/clis/appflowy.js pages append --workspace-id <ws> --view-id <page> --text "Hello" --dry-run
```

## Common Marketing Workflows

- **Campaign briefs**: draft with `marketing-plan` or `launch`, then save the brief to a page with `create_page`.
- **Content calendar**: keep a grid database of posts and add rows from `social` or `content-strategy` plans.
- **Research hub**: append findings from `customer-research` or `competitors` to a running page.

## Limits

- The API comes from AppFlowy-Cloud's source (`src/api/workspace.rs`). It isn't a published, versioned public API and may change between server releases.
- Cell values in `add_database_row` must match the field types in the database. Run `databases fields` first.
- Editing existing blocks in place isn't supported; you can only append.
