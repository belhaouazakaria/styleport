#!/usr/bin/env sh
set -eu

echo "[hostinger] Installing dependencies..."
npm ci

echo "[hostinger] Validating production environment..."
npm run validate:env:production

echo "[hostinger] Generating Prisma client..."
npm run prisma:generate

echo "[hostinger] Applying production migrations..."
npm run prisma:deploy

echo "[hostinger] Building Next.js app..."
npm run build

echo "[hostinger] Build pipeline complete. Start app with: npm run start:hostinger"
