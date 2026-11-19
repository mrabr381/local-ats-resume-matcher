"""CLI: python -m ats_match --resume resume.pdf --job job.txt --out report/

Exit codes: 0 = report written, 1 = usage/input error (no traceback).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from .parser import ParseError, extract_text
from .report import write_reports
from .scorer import score_resume


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="ats_match",
        description="Local ATS Resume Matcher — score a resume against a job "
        "description, 100% offline.",
    )
    parser.add_argument("--resume", required=True, help="Resume file (PDF, DOCX or TXT)")
    parser.add_argument("--job", required=True, help="Job description file (TXT/MD)")
    parser.add_argument("--out", default="report", help="Output directory (default: report)")
    parser.add_argument("--quiet", action="store_true", help="Only print the score")
    args = parser.parse_args(argv)

    try:
        resume_text = extract_text(args.resume)
        job_text = Path(args.job).read_text(encoding="utf-8", errors="replace")
    except ParseError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    except OSError as exc:
        print(f"Error: cannot read file: {exc}", file=sys.stderr)
        return 1

    try:
        result = score_resume(resume_text, job_text)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    paths = write_reports(
        result,
        resume_name=Path(args.resume).name,
        job_name=Path(args.job).name,
        out_dir=args.out,
    )

    if args.quiet:
        print(result.score)
        return 0

    b = result.breakdown
    print(f"Match score: {result.score}/100")
    print(f"  Keyword coverage:        {b['keyword_coverage']:>5}/50")
    print(f"  Skills match:            {b['skills_match']:>5}/20")
    print(f"  Experience & education:  {b['experience_education']:>5}/15")
    print(f"  Formatting:              {b['formatting']:>5}/15")
    print(
        f"Keywords: {len(result.matched_keywords)}/{len(result.keywords)} matched, "
        f"{len(result.missing_keywords)} missing"
    )
    print(
        f"Skills: {len(result.matched_skills)}/"
        f"{len(result.matched_skills) + len(result.missing_skills)} matched"
    )
    print(f"\nTop fix: {result.fixes[0]}")
    print(f"\nReports written:")
    print(f"  Markdown: {paths['markdown']}")
    print(f"  HTML:     {paths['html']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
