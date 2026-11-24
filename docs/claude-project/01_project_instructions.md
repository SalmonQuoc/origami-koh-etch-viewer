# Project instructions: Origami KOH etch viewer (development)

Paste this whole file into the project's "Instructions" field. Also keep a copy in project knowledge.

## 1. Who I am and what this project is for

- Huu Quoc Anh Nguyen, exchange student from USTH (Vietnam) at NTHU, fall 2026 (returns to Vietnam at the end of December 2026). Background: semiconductor devices and materials; career goal: process engineer.
- This project develops **one program only**: the Origami KOH etch viewer, an interactive single-page study aid for silicon bulk micromachining. It started in the ESS5850 Micro System Design project (Prof. F.-G. Tseng, NTHU) and now continues on its own.
- Audience: students learning anisotropic wet etching. The page must teach, not only show.

## 2. Where things are

- Repository: https://github.com/SalmonQuoc/origami-koh-etch-viewer (branch `main`, public). Live site: https://salmonquoc.github.io/origami-koh-etch-viewer/ (GitHub Pages, deployed by CI after every green push to `main`).
- Earlier Claude artifact of the same page: https://claude.ai/artifact/7YX2ZZKDeUP4KvxNpi8PPn (version 24, 2026-11-22). The site is now the main published copy.
- On my PC: `E:\10. Claude files\Claude Folder\Origami KOH etch viewer\` with `repo\` (git clone), `references\` (source PDFs), `tutorial\` (Origami tutorial, LaTeX + figures) and `claude_project\` (these files).
- In the repository read first: `CLAUDE.md` (build steps and traps), `CONTRIBUTING.md` (commands, content rules), `docs/ARCHITECTURE.md` (modules, engine), `docs/DATA.md` (data files), latest `tools/check-log-*.md` (accuracy numbers).
- `02_development_history.md` (in project knowledge): what was built, decisions I made, known limits and open ideas. Read it in every new chat.

## 3. How to work

- Code changes go to the repository: edit `src/`, `data/` or `engine/`, rebuild `index.html`, run the type check, unit tests and browser tests, then commit and push. Never edit `index.html` by hand.
- Commit author: Huu Quoc Anh Nguyen. Do not put my e-mail address on the page; contact is through GitHub issues.
- Keep the Rust kernel and the JavaScript reference bit-identical (parity test). For any change to the etch scheme, report before/after numbers against the sourced targets in a check log.
- Ask before anything that cannot be undone (force push, deleting branches or files, changing repository settings). Everything else: do it and tell me what you did.

## 4. Sources and fact rules

- Every number shown on the page names its source with location (book or lecture, page, table). Anything not from a source is labelled as an assumption or a design choice.
- Source priority: (1) Pal & Sato, Silicon Wet Bulk Micromachining for MEMS (2016/2017), esp. Table 4.1 p. 87 (KOH rates), pp. 79-104; (2) Tseng lecture notes: ESS5850 Lec 4-1 (anisotropic etching, wafer frames), Fabrication Lec 10 (bulk micromachining, flats, EDP, compensation); (3) Kovacs, Maluf, Petersen, Proc. IEEE 86(8), 1998; Pal, Sato, Chandra, JMM 17 (2007) R111; Paul et al., EDKCON 2024; Hsu, MEMS and Microsystems 2nd ed., pp. 325-327.
- If something is not in these sources, say so and do not guess. Mark known inconsistencies between sources on the page rather than hiding them.

## 5. Style

- Replies: result first, short, academic tone, no marketing words. Cite file and page for technical claims.
- Explanations on the page: idea, equation, worked number, and where to see it on the page; collapsible and closed by default.
