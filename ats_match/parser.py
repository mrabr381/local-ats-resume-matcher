"""Resume text extraction: PDF (pdfplumber), DOCX (python-docx), plain text.

Only local file reads — nothing is uploaded anywhere.
"""

from __future__ import annotations

import re
from pathlib import Path

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".txt", ".md"}


class ParseError(ValueError):
    """Raised when a resume file cannot be parsed."""


def extract_text(path: str | Path) -> str:
    """Extract plain text from a resume file. Raises ParseError on failure."""
    path = Path(path)
    if not path.exists():
        raise ParseError(f"File not found: {path}")
    suffix = path.suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise ParseError(
            f"Unsupported file type '{suffix}'. Supported: "
            + ", ".join(sorted(SUPPORTED_EXTENSIONS))
        )
    try:
        if suffix == ".pdf":
            return _extract_pdf(path)
        if suffix == ".docx":
            return _extract_docx(path)
        return path.read_text(encoding="utf-8", errors="replace")
    except ParseError:
        raise
    except Exception as exc:  # corrupt file, unreadable, etc.
        raise ParseError(f"Could not parse {path.name}: {exc}") from exc


def _extract_pdf(path: Path) -> str:
    import pdfplumber

    pages: list[str] = []
    with pdfplumber.open(path) as pdf:
        if not pdf.pages:
            raise ParseError(f"PDF has no pages: {path.name}")
        for page in pdf.pages:
            pages.append(page.extract_text() or "")
    text = "\n".join(pages).strip()
    if not text:
        raise ParseError(
            f"No extractable text in {path.name} — it may be a scanned image. "
            "Export a text-based PDF from your word processor."
        )
    return text


def _extract_docx(path: Path) -> str:
    import docx

    document = docx.Document(path)
    parts = [p.text for p in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                parts.append(cell.text)
    text = "\n".join(p for p in parts if p.strip()).strip()
    if not text:
        raise ParseError(f"No extractable text in {path.name}.")
    return text


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def page_estimate(text: str) -> float:
    """Rough page estimate (~500 words per page for a typical resume)."""
    return round(word_count(text) / 500, 1)
