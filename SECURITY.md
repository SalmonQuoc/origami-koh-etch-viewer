# Security

## Reporting a problem

Please report security problems **privately** through GitHub: open the repository's **Security** tab and choose **Report a vulnerability** (private vulnerability reporting). Do not open a public issue for a security problem. Other questions go to the normal [issues](https://github.com/SalmonQuoc/origami-koh-etch-viewer/issues).

Only the latest version on `main` (the GitHub Pages site) is maintained.

## What the page does and does not do

- It is one static HTML file. It has no server, no account and no cookies, and it sends no data anywhere. Settings, custom etchants and presets stay in the visitor's browser (`localStorage`); files are saved only when the visitor presses a save or export button.
- The only external code is three.js r128 (npm package `three@0.128.0`) from jsDelivr. Both files are pinned by SHA-384 [subresource integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity) hashes, so a changed file on the CDN is refused by the browser. Fonts come from Google Fonts.
- A Content Security Policy in the page (`<meta http-equiv="Content-Security-Policy">` in `src/index.html`) allows scripts only from the page itself and jsDelivr, WebAssembly only for the etch kernel, workers only from the page, and no network requests (`connect-src 'none'`).
- Files that visitors import (presets, custom etchants) are untrusted. Names from such files are escaped before they are shown (`escHTML` in `src/app/01-settings-helpers.ts`), and shapes are checked before they are used.

## For contributors

- Never insert text from a file, from storage or from the URL into `innerHTML` without `escHTML`; prefer `textContent`.
- To change the three.js version: update both `<script>` tags in `src/index.html`, compute the new hashes from the npm package (`npm pack three@<version>`, then `openssl dgst -sha384 -binary <file> | openssl base64 -A`) and check the tarball against `npm view three@<version> dist.integrity`.
- Do not commit secrets. The repository has GitHub secret scanning with push protection; GitHub Actions use the default `GITHUB_TOKEN` with read-only permissions except for the Pages deployment.
- Dependabot (`.github/dependabot.yml`) proposes updates for npm, Cargo and GitHub Actions; CodeQL (`.github/workflows/codeql.yml`) scans the JavaScript/TypeScript and the workflows.
