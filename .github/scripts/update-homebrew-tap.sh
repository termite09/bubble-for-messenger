#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?usage: $0 <version> <dmg-path>}"
DMG="${2:?usage: $0 <version> <dmg-path>}"
: "${HOMEBREW_TAP_TOKEN:?HOMEBREW_TAP_TOKEN is not set}"
REPO="termite09/homebrew-tap"
TAP_DIR="$(mktemp -d)"
trap 'rm -rf "$TAP_DIR"' EXIT

# The checksum is of the artifact this run built — not of whatever is at the download URL.
SHA256="$(shasum -a 256 "$DMG" | awk '{print $1}')"

# The token travels in a header, never in the remote URL (which git writes to .git/config) —
# the form actions/checkout uses.
AUTH="AUTHORIZATION: basic $(printf 'x-access-token:%s' "${HOMEBREW_TAP_TOKEN}" | base64 | tr -d '\n')"
git -c "http.extraheader=${AUTH}" clone --depth 1 "https://github.com/${REPO}.git" "$TAP_DIR/tap"
cd "$TAP_DIR/tap"

mkdir -p Casks
cat > "Casks/bubble-for-messenger.rb" <<EOF
cask "bubble-for-messenger" do
  version "${VERSION}"
  sha256 "${SHA256}"

  url "https://github.com/termite09/bubble-for-messenger/releases/download/v#{version}/Bubble-#{version}-arm64.dmg"
  name "Bubble for Messenger"
  desc "Facebook Messenger as a floating chat head"
  homepage "https://github.com/termite09/bubble-for-messenger"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on arch: :arm64
  depends_on macos: :big_sur

  app "Bubble.app"

  uninstall quit: "com.termite09.bubble-for-messenger"

  zap trash: [
    "~/Library/Application Support/Bubble for Messenger",
    "~/Library/Preferences/com.termite09.bubble-for-messenger.plist",
    "~/Library/Saved Application State/com.termite09.bubble-for-messenger.savedState",
  ]

  caveats <<~CAVEATS
    Bubble is not signed with an Apple developer certificate, so macOS blocks
    the first launch. Right-click Bubble.app in Applications -> Open -> Open,
    or clear the quarantine flag once:
      xattr -d com.apple.quarantine /Applications/Bubble.app
  CAVEATS
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
git -c "http.extraheader=${AUTH}" push origin HEAD:main
