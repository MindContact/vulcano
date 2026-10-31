#!/usr/bin/env bash
# Renders docs/*.md to HTML and PDF next to each source, in the lava house
# style (tools/doc-template.html). Uses the md-to-pdf converter (md2pdf.sh on
# the PATH, or MD2PDF=/path/to/md2pdf.sh); rerun after every edit to a document.

set -euo pipefail

cd "$(dirname "$0")/.."

md2pdf="${MD2PDF:-$(command -v md2pdf.sh || true)}"
[ -n "$md2pdf" ] && [ -x "$md2pdf" ] || { echo "Manca md2pdf.sh (md-to-pdf): mettilo sul PATH o indica MD2PDF=/percorso/md2pdf.sh" >&2; exit 1; }

for doc in GUIDA TECNICA ARCHITETTURA; do
  "$md2pdf" "$PWD/docs/$doc.md" --template "$PWD/tools/doc-template.html" --eyebrow "Vulcano" --lang it
done
