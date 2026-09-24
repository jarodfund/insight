# Desktop Ecosystem Installation

Verified on Windows on 2026-09-16 with Pi 0.85.1 and bundled Node 22.23.2.
The original local installation is now also the source for the versioned desktop
resource bundle. Packaged clients obtain it through the resource server described
in [RELEASE.md](RELEASE.md); the server must be configured before online rollout.
Restart the desktop client once after this update; `/reload` cannot update the
Electron process environment or reliably reload installed package dependencies.

## Installed Components

| Component | Pinned package | Integration | Verified |
| --- | --- | --- | --- |
| Web access | `pi-web-access@0.29.0` | Native Pi extension | Search and article extraction |
| Context7 | `@upstash/context7-pi@0.1.2` | Native Pi extension | Library lookup and documentation retrieval |
| Playwright | `@playwright/cli@0.1.20` | CLI plus `playwright-cli` skill | Chrome launch, click, DOM result, close |
| Subagents | `pi-subagents@0.68.0` | Native Pi extension | Tools, 13 built-in agents, runtime doctor |
| MCP | `pi-mcp-adapter@2.34.0` | Native Pi extension | Local test server connection, discovery and tool call |
| Code diagnostics | `pi-lens@4.1.6` | Native Pi extension and skills | LSP, linters, formatters and type checks |
| Todo tracking | `@juicesharp/rpiv-todo@2.10.1` | Native tool and `/todos` command | Persistent task list |
| User questions | `@juicesharp/rpiv-ask-user-question@2.10.1` | Native tool | Structured clarification questions |
| Background tasks | `pi-background-tasks@2.5.0` | Native extension | Durable background shell and delegated tasks |

The verification did not call a paid model or dispatch model-backed subagents.
Model/provider compatibility for real child tasks still needs a user task to
exercise it. The MCP test server was temporary and is not left configured.

## Configuration

Personal configuration paths below are relative to `%APPDATA%\Jarod-Pi\agent`.
Packaged extension code lives in `components/installed/<hash>/node_modules` and
is connected to the native agent configuration on restart:

- `settings.json`: pinned Pi packages or managed extension paths, all nine built-in skill paths, and bundled npm command.
- `npm/package.json` and `npm/package-lock.json`: installed dependencies.
- `web-search.json`: Exa search with DuckDuckGo fallback, plain HTTP article fetching,
  no automatic summary-model request, browser cookie access or curator browser.
- `extensions/subagent/config.json`: default run concurrency 2, parallel concurrency
  2, depth 1, and at most 2 active top-level async runs per parent session. These
  are scoped defaults, not a global cost cap across sessions or explicit overrides.
- `mcp.json`: empty server list, ready for explicitly configured services.
- `settings.before-ecosystem-20260916.json`: settings backup from before installation.

Search currently works without a separate key; Context7 also passed without a key,
subject to its unauthenticated service quota. JarodFund credentials are not copied
into either service configuration. Playwright uses an isolated browser session;
it does not attach to the user's existing Chrome login.

Only the Pi child process gets the bundled Node and extension `.bin` directories
prepended to PATH. System PATH and native CLI configuration are unchanged.
The child process pins the host SDK path for subagent discovery and enables MCP
exclusive-config mode, which prevents importing other applications' MCP settings.
Add desired services explicitly to the desktop `mcp.json`; no database, filesystem
server, account integration, or unrelated MCP service was connected by this install.

Dependencies were installed with `--ignore-scripts --legacy-peer-deps`.
`pi-subagents`' Undici dependency is overridden to `8.10.2` for the published
[security fixes](https://github.com/nodejs/undici/releases/tag/v8.10.2).
The installation audit reported zero known vulnerabilities; this is not a full
source-code security audit. Reinstall from the `agent\npm` directory using bundled
Node/npm and `npm ci --ignore-scripts --legacy-peer-deps` to preserve the lockfile.

## Usage and Boundaries

The following skills are built-in capabilities of 学术派: `playwright-cli`,
`context7-docs`, `council-mode`, `pi-subagents`, `mcp-scripting`,
`pi-lens-ast-grep`, `pi-lens-lsp-navigation`, `pi-lens-write-ast-grep-rule`,
and `pi-lens-write-tree-sitter-rule`. They remain loaded and available to the
model without selecting a card, but are omitted from “我的智能体”. Personal
skills still appear there. The shared list in `src/skill-policy.cjs` also
declares the skill paths loaded by the packaged runtime.

Ask Pi to search the web, read current library documentation with Context7, use
Playwright to inspect a page, or delegate a task to subagents. The model can call
the added tools directly. `/skill:playwright-cli` and `/c7-docs` are also available;
skill and prompt commands run a normal model-backed task and can incur charges.

Use `playwright-cli open <url> --browser=chrome` for the locally installed Chrome.
Firefox and WebKit browser binaries were not installed. Close browser sessions
when finished. Child agents use model requests and can increase JarodFund usage.

This installation does not add custom desktop settings or fleet-management panels.
Terminal-only extension screens, including the interactive MCP panel, are not
supported by the current renderer. Dialog-dependent operations remain cancelled
instead of granting approvals automatically. MCP proxy tools and normal subagent
tools are available independently of those terminal screens.

## Verification Notes

- Real Pi RPC startup exposed all installed extension commands and skills without
  extension errors. The active tool list included all eight original built-ins.
- Desktop syntax checks and 13 focused runtime/reliability tests passed.
- The previous Google finish-reason type error has been fixed. The full root
  `npm run check` now passes, including TypeScript and browser smoke checks.

## Navigation Performance Fix

Pi 0.85.1 invalidates extension module factories when the workspace changes.
With these packages installed, importing them again added about 1.2 seconds per
switch, mostly from subagents. RPC also bound the replacement session twice,
running the same extension startup callbacks twice.

The desktop now applies a version/source-checked runtime patch with original-file
backups. It reuses module factories only for the pinned extension versions above,
while still creating new extension instances and loading project resources
and configuration. Local extensions retain cwd-based invalidation. `/reload`
clears both caches; child and Herdr modes use separate factory keys. Package code
or dependency upgrades still require a restart. Upgraded extension versions are
not automatically added to the reuse list.

Measured on this machine with isolated settings and no model requests:

| Operation, all ecosystem components loaded | Before | After |
| --- | --- | --- |
| Workspace switch | 1,827 ms | 199 ms |
| New conversation | 294 ms | 215 ms |
| First startup | 4,739 ms | 4,626 ms |
| Explicit `/reload` | 1,525 ms | 1,505 ms |

Five additional switches took 171–226 ms. The ecosystem regression test retained
all 19 tools and the Playwright skill, checked workspace-specific context, and
verified updated web-access configuration after both navigation and `/reload`.
Tests also cover one startup callback per new/switch/fork/clone operation, local
extension refresh, child-mode isolation and cancelled/failed switches. Existing
desktop workspace, slash-command and streaming/copy regressions passed; the copy
test took 13 ms while preserving text selection after 2,000 stream events.

Restart the desktop once to load these changes. Navigation is faster; first
startup and deliberate reload still perform the full extension load.

The productivity packages were added at the following pinned versions:
`pi-lens@4.1.6`, `@juicesharp/rpiv-todo@2.10.1`,
`@juicesharp/rpiv-ask-user-question@2.10.1`, and
`pi-background-tasks@2.5.0`. RPC startup exposed 45 active tools and 65
commands in the smoke test. Structured question `select` and `input` requests
are bridged to the desktop dialog; terminal-only overlays and arbitrary
confirmation prompts remain cancelled by design.
