#!/usr/bin/env bash
# Bumps packages/desktop/package.json's version, commits, tags, and pushes —
# the mechanical half of the stable release skill. Run from the repo root.
#
# Does NOT write the changelog entry for you (that's copy, not mechanics —
# see SKILL.md step 3) and does NOT publish the resulting GitHub Release
# draft (that click is the deliberate human gate).
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>   e.g. $0 0.3.0" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
  echo "error: on branch '$BRANCH', not 'main'. Stable only ships from main." >&2
  exit 1
fi
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree not clean — commit or stash first." >&2
  exit 1
fi

CHANGELOG="apps/web/src/content/changelog/${VERSION}.md"
if [[ ! -f "$CHANGELOG" ]]; then
  echo "error: $CHANGELOG doesn't exist yet — write the changelog entry first (SKILL.md step 3)." >&2
  exit 1
fi

PKG="packages/desktop/package.json"
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('$PKG', 'utf8'));
  pkg.version = '$VERSION';
  fs.writeFileSync('$PKG', JSON.stringify(pkg, null, 2) + '\n');
"

git add "$PKG" "$CHANGELOG"
git commit -m "release: v${VERSION}"
git push origin main
git tag "v${VERSION}"
git push origin "v${VERSION}"

echo ""
echo "Tag v${VERSION} pushed. release.yml is building now:"
echo "  https://github.com/sparstrow/sparstrowGen/actions/workflows/release.yml"
echo "When it finishes, publish the draft release by hand (this click is the release gate):"
echo "  https://github.com/sparstrow/sparstrowGen/releases"
