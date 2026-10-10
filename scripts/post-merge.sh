#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter @workspace/quick-pass-emissions-os db:generate
