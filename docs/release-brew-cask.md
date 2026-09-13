# Homebrew Cask release prep

This repo is ready for a Homebrew Cask release for `Bubble for Messenger`.

## Verified release build

I ran the release checks locally:

- `npm test` → 83 passing, 0 failing
- `npm run build` → generated the macOS distribution artifacts in `dist/`

Artifacts generated:

- `dist/Bubble-2.1.0-arm64.dmg`
- `dist/Bubble-2.1.0-arm64-mac.zip`

Checksum for the DMG:

```bash
0ecdf39bc26b40ac73d83160fe30d5c7b21bc4119e767959629e993f0f863d1d  dist/Bubble-2.1.0-arm64.dmg
```

## Recommended Homebrew Cask formula

Use this in the tap repo for the cask formula, for example `termite09/homebrew-tap/Casks/bubble-for-messenger.rb`:

```ruby
cask "bubble-for-messenger" do
  version "2.1.0"
  sha256 "0ecdf39bc26b40ac73d83160fe30d5c7b21bc4119e767959629e993f0f863d1d"

  url "https://github.com/termite09/bubble-for-messenger/releases/download/v2.1.0/Bubble-2.1.0-arm64.dmg"
  name "Bubble for Messenger"
  desc "Facebook Messenger as a floating chat head for macOS"
  homepage "https://github.com/termite09/bubble-for-messenger"

  app "Bubble.app"

  depends_on macos: ">= :big_sur"

  uninstall quit: "com.termite09.bubble-for-messenger"
  zap trash: "~/Library/Application Support/Bubble for Messenger"
end
```

## Install command

Modern Homebrew does not accept a standalone `--no-quarantine` flag for casks. Use the normal cask install:

```bash
brew install --cask termite09/tap/bubble-for-messenger
```

If Gatekeeper blocks the first launch, clear the quarantine flag once:

```bash
xattr -d com.apple.quarantine /Applications/Bubble.app
```

## Release checklist

1. Tag the release in the app repo, for example `v2.1.0`.
2. Upload both `Bubble-2.1.0-arm64.dmg` and `Bubble-2.1.0-arm64-mac.zip` to GitHub Releases.
3. Add the changelog text from `CHANGELOG.md` to the GitHub release notes.
4. Submit the cask definition to the tap repo.
5. Verify the installed app launches with `brew install --cask --no-quarantine ...`.

This is the expected unsigned-app setup for this repo and matches the existing install instructions in `README.md`.
