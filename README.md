# Kaiju Planner

A personal planning tool for software projects. You describe what you want, it helps you organise it, and **you approve every requirement**. Approved information can then be turned into a clear brief for Claude Code.

It is not a to-do list. It covers the path from an idea to features, tasks, a roadmap, decisions and documentation, without assuming you know how software development works.

## The one rule: no assumptions

- Nothing is invented. Empty fields say **"Not answered yet"**.
- Five kinds of information are never mixed: *You wrote this*, *You approved this*, *AI suggestion*, *Needs clarification*, *Not decided*.
- A feature can only become Approved, Planned, In development, Testing or Completed after **you** approve it. Editing an approved feature keeps the approved version until you approve the change. Older approved versions are kept.
- Completing a task, feature or phase always asks for your confirmation.
- Your original words for a feature are stored once and never rewritten.
- The Claude Code brief uses **approved text only**. Everything else is listed as context, and gaps go under "Questions Before Implementation". A brief says plainly when it is not complete.
- Dates are never made up. Relationships are *possible* until you confirm them.

## What is in this version

Projects and guided project definition · **Structure: a tree of components** (project → plugin → subplugin → addon / integration, your own types, any depth) · Features with guided creation and future-feature planning · Tasks (Kanban) · Roadmap phases · Dependencies and impact check · Decisions · Documentation · Technical debt · Change history · Claude Code briefs (preview, edit, approve, copy, export) · Export/import · Light and dark theme.

**Optional Claude assistant** (off by default, see below). Everything else works without AI.

## Structure: plugins, subplugins, addons

A project is a **tree of components**. Each component has a type you choose (Plugin, Subplugin, Addon, Integration, Module, or your own) and can live inside another one, to any depth. Features, tasks, roadmap phases, decisions, docs and debt can each belong to a component.

- **Sidebar:** the tree sits under *Structure*. Pick a component and you see **only its own** features, tasks, roadmap, decisions, docs and debt, in tabs. The rarely-needed project-wide pages are folded under *Whole project*.
- **Roll-up:** tick *Include everything inside it* to see a component together with everything nested in it. Progress and counts on the Structure page include what is inside.
- **Safe moves:** a component cannot be placed inside itself or its own contents. Deleting one asks first and moves what was inside it to the top level. Nothing is deleted with it.
- **Claude Code import:** `parts` accept `type` and `parent` (by name, in any order), and phases, decisions and docs accept `part`.

## Keeping it clear

- **Needs you** (sidebar, with a count): everything waiting for your call. Open decisions and questions at the top. Below, every unapproved draft, grouped by type, with tick boxes and **Approve selected**. Nothing is ticked by default, decisions without a chosen solution are never bulk-approved, and Claude's tokens cannot use it.
- **Structure has three views:** *Tree* (status dots, version, install state, "N drafts", and a warning when the version info is stale; drag a row onto another to move it), *Table* (the plugin overview: version, install state, repo link, how old that info is, counts, progress; filter by type or stale), and *Map* (boxes and lines, with dashed arcs for possible relationships between components).
- **Plugin facts are real fields:** version, install state, repository link, branch or commit, and a "last checked" date.
- **Search everything** with Ctrl+K (or the Search button) across every project and record type.
- **Calmer forms:** the essential fields first, the rest folded under "More fields". Only exceptions get a label (AI suggestion, approved, unclear). Mark something as unclear with one small link.
- **Fewer sidebar items:** Overview, My Projects, Settings. Inside a project: Dashboard, Needs you, Structure (with the tree), Project Definition, then *Whole project* and *More* folded away.

## The Claude assistant (optional)

Turn it on in **Settings** with your own Anthropic API key (console.anthropic.com, billed by use, separate from a Claude subscription).

- **Planning Assistant** (per project): talk an idea through. Claude asks one or two plain-language questions at a time and only proposes a feature once it has enough from you. A proposal shows what you said, what is still unclear, and Claude's own ideas **separately as suggestions**.
- **Possible relationships** (Dependencies page): Claude suggests which features may be related, with its reasoning.
- **Claude can only suggest.** Proposals are shown to you and save nothing. If you keep one it becomes a **draft** (status "Proposed", labelled *AI suggestion*, not your original words). Suggested relationships stay *possible* until you confirm them. Claude cannot approve, complete, decide, or delete anything. Editing an AI-written field makes it yours.
- **What is sent to Anthropic:** your messages and a summary of the current project (definition, parts, feature names and descriptions). Project text is passed as data, with instructions telling Claude to ignore any commands inside it.
- **The key** lives in the app's database on your server, is never sent back to the browser, and is not part of exports. It *is* in the database file, so it is also in Proxmox backups of the container. Use a key with a spending limit and remove it in Settings if you stop using the assistant.

## Claude Code integration (import and manage from your computer)

Claude Code can read your planner and add **drafts** to it, so you can bring in projects you already have. It connects through a small MCP server in this repo (`mcp/server.ts`, no dependencies, Node 24+) using an access token.

1. In the app: **Settings → Claude Code access → Create token**. Copy the command it shows (once only).
2. On your computer, clone this repo, then run that command, with the path filled in:

```bash
claude mcp add kaiju-planner \
  --env KAIJU_URL=https://planner.example.com \
  --env KAIJU_TOKEN=kpt_... \
  -- node /path/to/kaiju-planner/mcp/server.ts
```

3. In Claude Code, for example: *"Read the notes and code in this folder and import this project into my planner. Do a dry run first."*

**Tools Claude gets:** `kaiju_get_schema`, `kaiju_list_projects`, `kaiju_get_project`, `kaiju_bulk_import` (with `dry_run`), `kaiju_add_item`, `kaiju_update_item`, `kaiju_suggest_link`, `kaiju_get_brief`. The brief tool also lets Claude Code fetch the approved instructions for a feature and work from them.

**What a token can and cannot do** (enforced by the server, not by trust):

- It can read everything and add drafts. Everything it adds is **unapproved**, status "Proposed" for features, labelled *AI suggestion* with the author shown as Claude Code in the change history, and it never fills your "original words".
- It **cannot** approve, complete, change a status, delete, confirm a relationship, create briefs, import export files, or touch settings, passwords, the AI key or tokens. Those are only possible when you are logged in.
- It **cannot overwrite** text you wrote or touch anything you approved. It can fill empty fields and extend its own drafts. Records with the same name are **skipped, not changed**.
- Real-world status ("half built") goes in as an unverified note, never as the status itself. Tasks, and roadmap entries, can only attach to features you have approved, so those are reported as *skipped* and can be imported after you approve.
- A dry run changes nothing. A real import is all-or-nothing, with at most 500 items per call.
- Tokens are stored as hashes, shown once, and can be revoked at any time. Over the internet they are accepted only over HTTPS. Bad tokens are rate-limited like bad passwords.

## Install on Proxmox

Run this on your **Proxmox host** shell. It creates a small Debian container, installs Node, builds the app and starts it as a service.

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Kalinewb/kaiju-planner/main/ct/kaijuplanner.sh)"
```

When it finishes, open `http://<container-ip>:3210`. The generated login password is in the container:

```bash
pct exec <CTID> -- cat /root/kaiju-planner.creds
```

Change it in **Settings → Change password** after logging in. Forgotten it? In the container console run `kaiju-set-password`.

### Update

Run the same command **inside the container** (console), or on the host:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/Kalinewb/kaiju-planner/main/ct/kaijuplanner.sh)"
```

On an existing container it detects the install and updates. Before updating it saves a copy of your database in `/var/lib/kaiju-planner/pre-update-copies/` (never overwriting an earlier copy).

## Using it on the internet (HTTPS + Nginx)

The app has a password login, but a password is only safe over **HTTPS**. Put it behind your Nginx reverse proxy:

```nginx
server {
    listen 443 ssl;
    server_name planner.example.com;
    # ssl_certificate / ssl_certificate_key ...

    client_max_body_size 50m;

    location / {
        proxy_pass http://<container-ip>:3210;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

Then tell the app which proxy to trust. In the container, edit `/etc/kaiju-planner.env`:

```
KAIJU_TRUSTED_PROXIES=<nginx-server-ip>
```

and run `systemctl restart kaiju-planner`. (You can also set it at install time: `KAIJU_TRUSTED_PROXIES=<ip> bash -c "$(curl ...)"`.)

What this gives you:

- Forwarded headers (real client address, HTTPS or not) are believed **only** from the proxy you list. Anyone else sending them is ignored.
- From outside your home network, **login over plain HTTP is refused**.
- Cookies are `HttpOnly`, `SameSite=Strict`, and `Secure` over HTTPS. Cross-site writes are blocked.
- Wrong passwords are slowed down: five tries, then a lockout that grows up to an hour. Passwords are stored as salted scrypt hashes, at least 12 characters.
- Changing the password logs out all other devices.

Do not forward a router port straight to the container. Keep the system up to date.

## Backups

- **Proxmox backups** of the container are the main backup. Use **Snapshot** or **Stop** mode so the database file is copied in a consistent state.
- **Export** (Settings) saves your projects to a file you can keep or move.
- **Import** adds the file's projects as *new* projects. It never replaces or merges with existing ones, and it first saves a copy of the database in `pre-import-copies/` (never overwriting an existing copy).

## Develop locally

Needs Node 24 or newer.

```bash
npm install
KAIJU_NEW_PASSWORD='a-long-test-password' npm run set-password
npm run build && npm start        # http://localhost:3210
npm test                          # server rules and security checks
npm run typecheck
```

For live reloading run `npm run dev:server` and `npm run dev:web` (port 5173) in two terminals.

Data lives in `./data/kaiju.db` (override with `KAIJU_DATA`). Settings: `PORT`, `HOST`, `KAIJU_TRUSTED_PROXIES`, `KAIJU_SESSION_DAYS`.

## How it is built

React + TypeScript web app, a small Node server (Hono), and one SQLite file. Node's built-in SQLite is used, so there is nothing to compile. Record types and wording live in `shared/schema.ts`; the brief generator is `shared/brief.ts`; the rules above are enforced on the **server** (`server/store.ts`) and covered by tests in `test/`.

## License

MIT
