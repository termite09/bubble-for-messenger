#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?usage: $0 <version>}"
REPO="termite09/homebrew-tap"
TAP_DIR="$(mktemp -d)"
trap 'rm -rf "$TAP_DIR"' EXIT

curl -L --fail "https://github.com/termite09/bubble-for-messenger/releases/download/v${VERSION}/Bubble-${VERSION}-arm64.dmg" -o "$TAP_DIR/Bubble-${VERSION}-arm64.dmg"
SHA256="$(shasum -a 256 "$TAP_DIR/Bubble-${VERSION}-arm64.dmg" | awk '{print $1}')"

git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/${REPO}.git" "$TAP_DIR/tap"
cd "$TAP_DIR/tap"

mkdir -p Casks
cat > "Casks/bubble-for-messenger.rb" <<EOF
cask "bubble-for-messenger" do
  version "${VERSION}"
  sha256 "${SHA256}"

  url "https://github.com/termite09/bubble-for-messenger/releases/download/v#{version}/Bubble-#{version}-arm64.dmg"
  name "Bubble for Messenger"
  desc "Facebook Messenger as a floating chat head for macOS"
  homepage "https://github.com/termite09/bubble-for-messenger"

  app "Bubble.app"

  depends_on macos: ">= :big_sur"

  uninstall quit: "com.termite09.bubble-for-messenger"
  zap trash: "~/Library/Application Support/Bubble for Messenger"
end
EOF

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git add Casks/bubble-for-messenger.rb
if git diff --cached --quiet; then
  echo "Cask already up to date for ${VERSION}."
  exit 0
fi

git commit -m "Update bubble-for-messenger to ${VERSION}"
git push origin HEAD:main
