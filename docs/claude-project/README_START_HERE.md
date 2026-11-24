# Origami KOH etch viewer: project folder

## Folder layout

| Folder | Contents |
|---|---|
| `repo\` | git clone of https://github.com/SalmonQuoc/origami-koh-etch-viewer (all source, tests, CI, docs). Work here. |
| `claude_project\` | `01_project_instructions.md` and `02_development_history.md` for the new Claude project |
| `references\` | source PDFs cited by the page (Pal & Sato book, three papers, Lec 4-1, Lec 10) |
| `tutorial\` | Origami tutorial Rev. 1 (PDF, LaTeX, figures, scripts) that the viewer accompanies |

The books and lecture notes in `references\` are for your own use; do not commit them to the public repository.

## Create the Claude project (in the Claude app)

1. Projects → New project, name it "Origami KOH etch viewer".
2. Paste `claude_project\01_project_instructions.md` into the project instructions.
3. Add to project knowledge: both files in `claude_project\`, plus the PDFs in `references\` you want Claude to read.
4. Connect the GitHub repository SalmonQuoc/origami-koh-etch-viewer to the project (or to Claude Code on the web), so threads can clone, commit and push.

## Develop on this PC

Install once: Git, Node.js 22, Rust (`rustup target add wasm32-unknown-unknown`). Then in `repo\`:

```
npm install
npx playwright install chromium
npm run check
```

`npm run check` validates the data, type-checks, builds the wasm kernel and `index.html`, and runs the unit and browser tests. With Claude Code, open `repo\` and it reads `CLAUDE.md` automatically.
