#!/usr/bin/env bash
# Runs in each fresh worktree Cyrus creates for an issue.
# Without this, node_modules is absent and every gate in `pnpm check` fails,
# so the agent cannot verify its own work before opening a pull request.
set -euo pipefail

pnpm install --frozen-lockfile
