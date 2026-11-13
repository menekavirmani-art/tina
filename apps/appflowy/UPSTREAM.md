# Upstream

Imported from https://github.com/AppFlowy-IO/AppFlowy at commit `8fcee27` (2026-10-28), without git history.

## License

AppFlowy is licensed **AGPL-3.0** (see [`LICENSE`](LICENSE)), not MIT like the rest of this repo. That license
applies to everything in `apps/appflowy/`. If you modify AppFlowy and distribute it, or run a modified version as a
network service, you must release your changes under AGPL-3.0.

## Local changes

None. Six upstream-tracked files matched this repo's ignore rules and were force-added so the copy is complete:
`frontend/.vscode/{launch,tasks}.json`, `frontend/rust-lib/.vscode/launch.json`,
`frontend/rust-lib/.cargo/config.toml`, `frontend/rust-lib/flowy-sqlite/.env`, and
`frontend/appflowy_flutter/assets/translations/mr-IN.json`.

## Install the app

For everyday use, install a release build instead of building from source:
https://appflowy.com/download or https://github.com/AppFlowy-IO/AppFlowy/releases

## Build from source

Needs Flutter, Rust and `cargo-make`. Follow the upstream guide:
https://docs.appflowy.io/docs/documentation/appflowy/from-source

## Connect it to Claude

AppFlowy syncs through AppFlowy Cloud. `tools/clis/appflowy.js` talks to the AppFlowy Cloud API as a CLI or as an
MCP server. See [`tools/integrations/appflowy.md`](../../tools/integrations/appflowy.md).
