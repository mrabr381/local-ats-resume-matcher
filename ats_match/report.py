"""Markdown + HTML report generation. Pure local rendering, no network."""

from __future__ import annotations

import html
from pathlib import Path

from .scorer import MatchResult

_CSS = """
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
max-width:820px;margin:2rem auto;padding:0 1rem;color:#1a1a1a;line-height:1.55}
h1{font-size:1.7rem}h2{font-size:1.25rem;margin-top:2rem;border-bottom:2px solid #eee;padding-bottom:.3rem}
.score{font-size:3rem;font-weight:800;margin:.2rem 0}
.bar{height:18px;background:#eee;border-radius:9px;overflow:hidden;max-width:420px}
.bar>div{height:100%;background:#2563eb}
table{border-collapse:collapse;width:100%;margin:.5rem 0}
th,td{border:1px solid #ddd;padding:.45rem .6rem;text-align:left;font-size:.95rem}
th{background:#f5f5f5}.pill{display:inline-block;background:#e8f5e9;color:#1b5e20;
border-radius:999px;padding:.1rem .6rem;margin:.15rem;font-size:.9rem}
.pill.miss{background:#fdecea;color:#7a1f1f}
ol li{margin:.35rem 0}.muted{color:#666;font-size:.9rem}
"""


def _verdict(score: int) -> str:
    if score >= 80:
        return "Strong match — ready to submit after a final proofread."
    if score >= 60:
        return "Good match — fix the top items below and it will be competitive."
    if score >= 40:
        return "Partial match — needs targeted tailoring before applying."
    return "Weak match — the resume is missing most of what this job asks for."


def render_markdown(result: MatchResult, resume_name: str, job_name: str) -> str:
    b = result.breakdown
    lines = [
        "# ATS Resume Match Report",
        "",
        f"**Resume:** {resume_name}  ",
        f"**Job description:** {job_name}  ",
        f"**Resume length:** {result.resume_words} words (~{result.resume_pages} pages)",
        "",
        f"## Match score: {result.score}/100",
        "",
        _verdict(result.score),
        "",
        "### Score breakdown",
        "",
        "| Area | Points | Max |",
        "|------|-------:|----:|",
        f"| Keyword coverage | {b['keyword_coverage']} | 50 |",
        f"| Skills match | {b['skills_match']} | 20 |",
        f"| Experience & education | {b['experience_education']} | 15 |",
        f"| Formatting | {b['formatting']} | 15 |",
        f"| **Total** | **{result.score}** | **100** |",
        "",
        f"### Matched keywords ({len(result.matched_keywords)}/{len(result.keywords)})",
        "",
    ]
    lines += [f"- {k}" for k in result.matched_keywords] or ["- (none)"]
    lines += [
        "",
        f"### Missing keywords ({len(result.missing_keywords)})",
        "",
    ]
    lines += [f"- {k}" for k in result.missing_keywords] or ["- (none)"]
    lines += [
        "",
        f"### Matched skills ({len(result.matched_skills)}/{len(result.matched_skills) + len(result.missing_skills)})",
        "",
    ]
    lines += [f"- {s}" for s in result.matched_skills] or ["- (none)"]
    lines += [
        "",
        f"### Missing skills ({len(result.missing_skills)})",
        "",
    ]
    lines += [f"- {s}" for s in result.missing_skills] or ["- (none)"]
    lines += [
        "",
        "### Prioritised fixes",
        "",
    ]
    lines += [f"{i}. {fix}" for i, fix in enumerate(result.fixes, 1)]
    lines += [
        "",
        "---",
        "",
        "_Generated locally by Local ATS Resume Matcher — your resume never left this machine._",
        "",
    ]
    return "\n".join(lines)


def render_html(result: MatchResult, resume_name: str, job_name: str) -> str:
    b = result.breakdown
    esc = html.escape

    def pills(items, cls=""):
        return " ".join(
            f'<span class="pill {cls}">{esc(i)}</span>' for i in items
        ) or "<span class='muted'>(none)</span>"

    def rows(items, col):
        return "".join(f"<tr><td>{esc(i)}</td></tr>" for i in items) or (
            f"<tr><td class='muted'>(none)</td></tr>"
        )

    fixes = "".join(f"<li>{esc(f)}</li>" for f in result.fixes)
    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ATS Resume Match Report — {result.score}/100</title>
<style>{_CSS}</style></head><body>
<h1>ATS Resume Match Report</h1>
<p class="muted">Resume: {esc(resume_name)} &middot; Job: {esc(job_name)} &middot;
{result.resume_words} words (~{result.resume_pages} pages)</p>
<div class="score">{result.score}<span style="font-size:1.2rem;color:#666">/100</span></div>
<div class="bar"><div style="width:{result.score}%"></div></div>
<p><strong>{esc(_verdict(result.score))}</strong></p>
<h2>Score breakdown</h2>
<table><tr><th>Area</th><th>Points</th><th>Max</th></tr>
<tr><td>Keyword coverage</td><td>{b['keyword_coverage']}</td><td>50</td></tr>
<tr><td>Skills match</td><td>{b['skills_match']}</td><td>20</td></tr>
<tr><td>Experience &amp; education</td><td>{b['experience_education']}</td><td>15</td></tr>
<tr><td>Formatting</td><td>{b['formatting']}</td><td>15</td></tr>
<tr><td><strong>Total</strong></td><td><strong>{result.score}</strong></td><td><strong>100</strong></td></tr></table>
<h2>Matched keywords ({len(result.matched_keywords)}/{len(result.keywords)})</h2>
<p>{pills(result.matched_keywords)}</p>
<h2>Missing keywords ({len(result.missing_keywords)})</h2>
<p>{pills(result.missing_keywords, 'miss')}</p>
<h2>Matched skills ({len(result.matched_skills)})</h2>
<table><tr><th>Skill</th></tr>{rows(result.matched_skills, 'skill')}</table>
<h2>Missing skills ({len(result.missing_skills)})</h2>
<table><tr><th>Skill</th></tr>{rows(result.missing_skills, 'skill')}</table>
<h2>Prioritised fixes</h2>
<ol>{fixes}</ol>
<hr><p class="muted">Generated locally by Local ATS Resume Matcher — your resume never left this machine.</p>
</body></html>
"""


def write_reports(
    result: MatchResult, resume_name: str, job_name: str, out_dir: str | Path
) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path = out_dir / "report.md"
    html_path = out_dir / "report.html"
    md_path.write_text(render_markdown(result, resume_name, job_name), encoding="utf-8")
    html_path.write_text(render_html(result, resume_name, job_name), encoding="utf-8")
    return {"markdown": md_path, "html": html_path}
