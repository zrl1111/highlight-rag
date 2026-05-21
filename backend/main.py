"""
FastAPI backend for PDF RAG Highlighter.

Endpoints:
  POST /api/upload          — upload PDF, parse via Azure Document Intelligence, build index
  POST /api/query           — BM25 search, return chunks with page_idx + bbox
  GET  /api/pdf/{name}      — serve original PDF for the browser viewer
  GET  /api/markdown/{name} — serve Markdown export of the parsed document
  GET  /api/status/{name}   — check whether a PDF is indexed (used by frontend on reload)
  GET  /api/documents       — list indexed PDF filenames
  POST /api/reconciliation/evaluate — extract fields from cached Markdown (pre-vetting UI)
  POST /api/vetting/risk-scan     — applicant risk assessment (pre-vetting dashboard Scan)
  POST /api/vetting/background-screening — adverse media / background screening (OpenRouter)
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
from pathlib import Path
from typing import Optional

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel
from starlette.requests import Request

try:
    from .demo_registry import BASELINE_PDF_FILENAME, BASELINE_STEM
    from .doc_parser import parse_pdf, post_process
    from .rag import RAGIndex
    from .reconciliation import (
        ReconciliationFileRef,
        build_file_status,
        evaluate_files,
        init_upload_job,
        maybe_schedule_extraction,
        update_upload_job,
    )
    from .adverse_media import screen_applicant_background
    from .risk_scan import analyze_applicant_risk
except ImportError:
    # Script / IDE run: python backend/main.py — no package context for relative imports
    import sys

    _backend_dir = Path(__file__).resolve().parent
    if str(_backend_dir) not in sys.path:
        sys.path.insert(0, str(_backend_dir))
    from demo_registry import BASELINE_PDF_FILENAME, BASELINE_STEM
    from doc_parser import parse_pdf, post_process
    from rag import RAGIndex
    from reconciliation import (
        ReconciliationFileRef,
        build_file_status,
        evaluate_files,
        init_upload_job,
        maybe_schedule_extraction,
        update_upload_job,
    )
    from adverse_media import screen_applicant_background
    from risk_scan import analyze_applicant_risk

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

BASE       = Path(__file__).parent.parent
UPLOAD_DIR = BASE / "uploads"
PARSED_DIR = BASE / "parsed"
DEMO_ASSETS_DIR = BASE / "demo-assets"
UPLOAD_DIR.mkdir(exist_ok=True)
PARSED_DIR.mkdir(exist_ok=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="PDF RAG Highlighter")

app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)


# #region agent log
def _agent_dbg(location: str, message: str, hypothesis_id: str, data: dict | None = None) -> None:
    try:
        import time as _t

        log_path = Path(__file__).resolve().parent.parent.parent / "debug-0af642.log"
        payload = {
            "sessionId": "0af642",
            "location": location,
            "message": message,
            "hypothesisId": hypothesis_id,
            "timestamp": int(_t.time() * 1000),
            "data": data or {},
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass


@app.middleware("http")
async def _agent_upload_mw(request: Request, call_next):
    if request.url.path != "/api/upload":
        return await call_next(request)
    response = await call_next(request)
    _agent_dbg(
        "main.py:_agent_upload_mw",
        "POST /api/upload response headers",
        "A",
        {
            "status": response.status_code,
            "content_length": response.headers.get("content-length", ""),
            "content_type": response.headers.get("content-type", ""),
        },
    )
    return response


# #endregion

# In-memory index store: filename → RAGIndex
_indexes: dict[str, RAGIndex] = {}


# ---------------------------------------------------------------------------
# Startup: validate Azure config + reload cached indexes
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def _startup() -> None:
    # #region agent log
    try:
        import time as _t

        log_path = Path(__file__).resolve().parent.parent.parent / "debug-cedaa1.log"
        payload = {
            "sessionId": "cedaa1",
            "location": "main.py:_startup",
            "message": "app started",
            "hypothesisId": "H1",
            "timestamp": int(_t.time() * 1000),
            "data": {
                "__package__": __package__,
                "import_mode": "package" if __package__ else "script",
            },
        }
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    # #endregion
    _check_azure_config()
    _seed_demo_baseline()
    await _reload_cached_indexes()


def _check_azure_config() -> None:
    endpoint = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    key      = os.environ.get("AZURE_DOCUMENT_INTELLIGENCE_KEY")

    missing = []
    if not endpoint: missing.append("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
    if not key:      missing.append("AZURE_DOCUMENT_INTELLIGENCE_KEY")

    if missing:
        print("[startup] ⚠️  Azure Document Intelligence is NOT configured. Missing env vars: "
              + ", ".join(missing))
        print("[startup]    Copy .env.example → .env and fill in the values.")
        print("[startup]    Uploads will fail until this is fixed.")
    else:
        print(f"[startup] Azure Document Intelligence: endpoint={endpoint}")


async def _reload_cached_indexes() -> None:
    loaded = 0
    for cache_file in sorted(PARSED_DIR.glob("*.json")):
        stem     = cache_file.stem
        pdf_path = UPLOAD_DIR / f"{stem}.pdf"
        filename = f"{stem}.pdf"

        if not pdf_path.exists():
            continue
        if filename in _indexes:
            continue

        try:
            chunks = json.loads(cache_file.read_text(encoding="utf-8"))
            idx = RAGIndex()
            idx.build(post_process(chunks))
            _indexes[filename] = idx
            loaded += 1
        except Exception as e:
            print(f"[startup] Failed to reload {cache_file.name}: {e}")

    if loaded:
        print(f"[startup] Restored {loaded} index(es) from disk cache.")


def _seed_demo_baseline() -> None:
    """Copy packaged demo prior PDF + parse cache into uploads/parsed if missing."""
    pdf_src = DEMO_ASSETS_DIR / "demo-prior.pdf"
    if not pdf_src.exists():
        print("[startup] Demo baseline PDF not found in demo-assets/ — skipping seed.")
        return

    pdf_dst = UPLOAD_DIR / BASELINE_PDF_FILENAME
    if not pdf_dst.exists():
        shutil.copy2(pdf_src, pdf_dst)
        print(f"[startup] Seeded demo baseline PDF → {pdf_dst.name}")

    for suffix in (".json", ".md", ".extraction.json"):
        src = DEMO_ASSETS_DIR / f"{BASELINE_STEM}{suffix}"
        dst = PARSED_DIR / f"{BASELINE_STEM}{suffix}"
        if src.exists() and not dst.exists():
            shutil.copy2(src, dst)
            print(f"[startup] Seeded demo parse artifact → {dst.name}")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cache_path(pdf_stem: str) -> Path:
    return PARSED_DIR / f"{pdf_stem}.json"


def _md_path(pdf_stem: str) -> Path:
    return PARSED_DIR / f"{pdf_stem}.md"


def _build_index(filename: str, chunks: list) -> int:
    idx = RAGIndex()
    idx.build(post_process(chunks))
    _indexes[filename] = idx
    return len(chunks)


async def _process_upload_background(pdf_stem: str, filename: str) -> None:
    """Parse PDF, build BM25 index, then schedule field extraction (cache miss path)."""
    pdf_path = UPLOAD_DIR / filename
    cache = _cache_path(pdf_stem)
    md = _md_path(pdf_stem)
    try:
        chunks, markdown_str = await parse_pdf(str(pdf_path))
        if not chunks:
            update_upload_job(
                pdf_stem,
                "error",
                error="No text could be extracted from the PDF.",
            )
            return

        cache.write_text(
            json.dumps(chunks, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        md.write_text(markdown_str, encoding="utf-8")
        mode = "Azure Document Intelligence Layout"
        chunk_count = _build_index(filename, chunks)
        update_upload_job(
            pdf_stem,
            "indexed",
            chunk_count=chunk_count,
            mode=mode,
        )
        maybe_schedule_extraction(PARSED_DIR, pdf_stem)
    except Exception as e:
        update_upload_job(pdf_stem, "error", error=f"Parsing failed: {e}")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/api/upload")
async def upload(file: UploadFile):
    # #region agent log
    _agent_dbg(
        "main.py:upload",
        "handler entered",
        "A",
        {"filename": file.filename, "content_type": file.content_type},
    )
    # #endregion
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    filename = Path(file.filename).name
    pdf_stem = Path(filename).stem
    pdf_path = UPLOAD_DIR / filename
    cache    = _cache_path(pdf_stem)

    # Save uploaded file
    with open(pdf_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # #region agent log
    _agent_dbg(
        "main.py:upload",
        "after save",
        "B",
        {"pdf_path": str(pdf_path), "cache_exists": cache.exists()},
    )
    # #endregion

    md = _md_path(pdf_stem)

    if cache.exists():
        chunks = json.loads(cache.read_text(encoding="utf-8"))
        mode = "cache (previously parsed)"
        chunk_count = _build_index(filename, chunks)
        init_upload_job(pdf_stem, filename)
        update_upload_job(
            pdf_stem,
            "indexed",
            chunk_count=chunk_count,
            mode=mode,
        )
        maybe_schedule_extraction(PARSED_DIR, pdf_stem)
        status = build_file_status(filename, PARSED_DIR, indexed=True)
        # #region agent log
        _agent_dbg(
            "main.py:upload",
            "cache hit indexed",
            "E",
            {"chunk_count": chunk_count, "phase": status["phase"]},
        )
        # #endregion
        return {
            "filename": filename,
            "chunk_count": chunk_count,
            "mode": mode,
            "has_markdown": md.exists(),
            "phase": status["phase"],
            "accepted": False,
        }

    init_upload_job(pdf_stem, filename)
    asyncio.create_task(_process_upload_background(pdf_stem, filename))
    # #region agent log
    _agent_dbg(
        "main.py:upload",
        "accepted async parse",
        "B",
        {"filename": filename},
    )
    # #endregion
    return JSONResponse(
        status_code=202,
        content={
            "filename": filename,
            "phase": "parsing",
            "accepted": True,
            "has_markdown": False,
        },
    )


class QueryRequest(BaseModel):
    filename: str
    query:    str
    top_k:    int = 5


@app.post("/api/query")
async def query(req: QueryRequest):
    idx = _indexes.get(req.filename)
    if idx is None:
        raise HTTPException(
            status_code=404,
            detail="PDF not indexed — please re-upload.",
        )
    return {"results": idx.search(req.query, top_k=req.top_k)}


@app.get("/api/pdf/{filename}")
async def serve_pdf(filename: str):
    pdf_path = UPLOAD_DIR / Path(filename).name
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found.")
    return FileResponse(str(pdf_path), media_type="application/pdf")


@app.get("/api/markdown/{filename}")
async def serve_markdown(filename: str):
    """Return the Markdown export of a parsed PDF (saved alongside the JSON cache)."""
    stem = Path(filename).stem
    md   = _md_path(stem)
    if not md.exists():
        raise HTTPException(
            status_code=404,
            detail="Markdown not found — please re-upload the PDF to regenerate it.",
        )
    content = md.read_text(encoding="utf-8")
    # Return as plain text; browser download triggered by frontend with correct filename
    return PlainTextResponse(
        content,
        headers={"Content-Disposition": f'attachment; filename="{stem}.md"'},
    )


@app.get("/api/status/{filename}")
async def status(filename: str):
    """Poll upload phases: parsing → indexed → extracting → ready."""
    filename = Path(filename).name
    return build_file_status(
        filename,
        PARSED_DIR,
        indexed=filename in _indexes,
    )


@app.get("/api/documents")
async def list_documents():
    """Indexed PDF filenames for pickers (pre-vetting UI, etc.)."""
    return {"filenames": sorted(_indexes.keys())}


class ReconciliationFileIn(BaseModel):
    filename: str
    original_name: str


class ReconciliationEvaluateRequest(BaseModel):
    batch_session_id: str
    entity_id: Optional[str] = None
    files: list[ReconciliationFileIn]


@app.post("/api/reconciliation/evaluate")
async def reconciliation_evaluate(req: ReconciliationEvaluateRequest):
    """Run health Extractor on cached Markdown; return reconciliation snapshot."""
    if not req.files:
        raise HTTPException(status_code=400, detail="No files provided.")

    refs = [
        ReconciliationFileRef(filename=f.filename, original_name=f.original_name)
        for f in req.files
    ]

    def _search_fn(filename: str, query: str, top_k: int = 1) -> list[dict]:
        idx = _indexes.get(filename)
        if idx is None:
            return []
        return idx.search(query, top_k=top_k)

    try:
        snapshot = await evaluate_files(
            PARSED_DIR,
            req.batch_session_id,
            req.entity_id,
            refs,
            search=_search_fn,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except RuntimeError as e:
        msg = str(e)
        if "OPENROUTER_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=500, detail=msg) from e

    return snapshot


class RiskScanRequest(BaseModel):
    name: str
    context: str = ""


@app.post("/api/vetting/risk-scan")
async def vetting_risk_scan(req: RiskScanRequest):
    """Pre-vetting dashboard risk assessment via OpenRouter."""
    try:
        return await asyncio.to_thread(
            analyze_applicant_risk, req.name, req.context
        )
    except RuntimeError as e:
        msg = str(e)
        if "OPENROUTER_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=500, detail=msg) from e


class BackgroundScreeningRequest(BaseModel):
    name: str
    context: str = ""


@app.post("/api/vetting/background-screening")
async def vetting_background_screening(req: BackgroundScreeningRequest):
    """Adverse media / background screening via OpenRouter (web search + Gemini)."""
    try:
        return await asyncio.to_thread(
            screen_applicant_background, req.name, req.context
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        msg = str(e)
        if "OPENROUTER_API_KEY" in msg:
            raise HTTPException(status_code=503, detail=msg) from e
        raise HTTPException(status_code=500, detail=msg) from e


@app.get("/")
async def root():
    """API-only server; use pre-vetting-system on :3000 for the UI."""
    return {"service": "highlight-rag-api", "docs": "/docs"}


if __name__ == "__main__":
    # Package run: python -m backend.main  |  Script run: python backend/main.py
    _uvicorn_app = "backend.main:app" if __package__ else "main:app"
    uvicorn.run(_uvicorn_app, host="0.0.0.0", port=8000, reload=True)
