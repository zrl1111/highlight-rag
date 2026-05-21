#!/usr/bin/env bash
set -e

REPO="$(cd "$(dirname "$0")" && pwd)"
ENV_NAME="highlight-rag"

# ── .env check ──────────────────────────────────────────────────────────────
if [ ! -f "$REPO/.env" ]; then
  echo "⚠️  .env not found."
  echo "   Copy .env.example → .env and set:"
  echo "     AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT"
  echo "     AZURE_DOCUMENT_INTELLIGENCE_KEY"
  echo "   New PDF uploads require Azure; cached parsed/*.json can load without it."
  echo ""
fi

# ── Conda environment ────────────────────────────────────────────────────────
if ! command -v conda &>/dev/null; then
  echo "❌  conda not found. Install Miniconda/Anaconda first."
  exit 1
fi

# Create env if it doesn't exist
if ! conda env list | grep -q "^${ENV_NAME} "; then
  echo "Creating conda environment '${ENV_NAME}' (Python 3.12)..."
  conda env create -f "$REPO/environment.yml"
  echo "✓ Environment created."
else
  echo "✓ Conda environment '${ENV_NAME}' already exists."
fi

# ── Launch via conda run ─────────────────────────────────────────────────────
echo ""
echo "Starting server at http://localhost:8000"
echo "Press Ctrl-C to stop."
echo ""

cd "$REPO"
conda run -n "$ENV_NAME" --no-capture-output \
  python -m backend.main
