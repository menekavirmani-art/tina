# n8n

Self-hostable workflow automation platform. Connect to n8n from code, scripts, and AI tools using the public API, the CLI, or the built-in MCP server — pick the interface that matches the job, since each uses a different access model.

## Capabilities

| Integration | Available | Notes |
|-------------|-----------|-------|
| API | ✓ | REST API for managing workflows, executions, and credentials |
| MCP | ✓ | Built-in n8n MCP server, plus a separate n8n docs MCP server |
| CLI | ✓ | Local terminal control for import/export and scripted runs |
| SDK | - | No official SDK; use the REST API directly |

## Choosing an Interface

| Interface | Best for |
|-----------|----------|
| **n8n API** | Building platforms/tooling on top of n8n, triggering and monitoring executions from external systems, automating workflow and credential management |
| **n8n CLI** | Importing/exporting workflows, running executions in scripts and CI pipelines, local development and debugging |
| **MCP server** | Connecting AI agents (Claude Code, Claude Desktop, Lovable, and similar tools) directly to an n8n instance — discovering and executing workflows, managing workflows through an MCP client |

## n8n API

Manage n8n programmatically over HTTP. Use for triggering/monitoring executions from external systems and automating workflow and credential management.

- Auth: API key, sent as a header on each request
- Core resources: workflows, executions, credentials, tags, users (on relevant plans)

## n8n CLI

Control n8n directly from the terminal. Use for importing/exporting workflows, running executions in CI, and local development.

```bash
n8n export:workflow --all --output=workflows.json
n8n import:workflow --input=workflows.json
n8n execute --id=<workflow_id>
```

## MCP Server (n8n instance)

Connect MCP-compatible clients (Claude Code, Claude Desktop, Lovable, and similar tools) directly to your n8n instance to discover and execute workflows and manage them through an MCP client.

## n8n Docs MCP Server

A separate MCP server that lets an MCP client search the n8n documentation itself — useful for agents that need to look up node behavior or API reference while building automations.

## Key Concepts

- **Workflow** — an automation built from connected nodes
- **Node** — a single step in a workflow (trigger, action, or logic)
- **Execution** — one run of a workflow, with its own status and data
- **Custom node** — a node you build yourself to add an integration n8n doesn't ship natively

## Related

- Create a custom node to add a new integration to n8n rather than connecting to an existing instance.
