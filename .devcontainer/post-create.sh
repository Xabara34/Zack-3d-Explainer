#!/usr/bin/env bash
# Runs once when a new Codespace is created.
set -euo pipefail

# System libraries Remotion's headless Chromium needs on Debian/Ubuntu.
# See https://www.remotion.dev/docs/miscellaneous/linux-dependencies
# `|| true`: a broken third-party apt source in the base image shouldn't block
# setup; the Debian package lists still get refreshed.
sudo apt-get update || true
sudo apt-get install -y --no-install-recommends \
  libnss3 libdbus-1-3 libatk1.0-0 libgbm-dev libasound2 libxrandr2 \
  libxkbcommon-dev libxfixes3 libxcomposite1 libxdamage1 \
  libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2

# Project dependencies, exactly as pinned in package-lock.json.
npm ci

# Download Remotion's headless Chromium now so the first render is fast.
npx remotion browser ensure
