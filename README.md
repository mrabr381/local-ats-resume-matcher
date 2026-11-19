# Local ATS Resume Matcher

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Local only](https://img.shields.io/badge/privacy-100%25%20local-brightgreen.svg)](#privacy)
[![No account](https://img.shields.io/badge/account-none%20required-brightgreen.svg)](#quickstart)

**Free, local, privacy-first resume scorer.** Paste a job description, upload
your resume (PDF / DOCX / TXT), and get a match score out of 100, matched vs
missing keywords, and plain-language fixes — without your resume ever leaving
your machine.

> **The problem:** paid tools like Jobscan charge **$49.95/month** to tell you
> how well your resume matches a job. This tool does the same core job —
> keyword coverage, skills match, formatting checks — for free, offline,
> on your own computer.

## Table of contents

- [Quickstart](#quickstart)
- [How scoring works](#how-scoring-works)
- [Before / after](#before--after)
- [Comparison with Jobscan](#comparison-with-jobscan)
- [Privacy](#privacy)
- [CLI usage](#cli-usage)
- [Web app (Streamlit)](#web-app-streamlit)
- [Sample data](#sample-data)
- [Development & testing](#development--testing)
- [Limitations](#limitations)
- [License](#license)

## Quickstart

```bash
git clone https://github.com/mrabr381/local-ats-resume-matcher.git
cd local-ats-resume-matcher

python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm

python -m ats_match --resume sample_data/resume.pdf \
                    --job sample_data/job.txt \
                    --out report/
```

Open `report/report.html` in any browser. Or run the web app:

```bash
streamlit run app.py
```

No account. No API key. No upload. Works fully offline after install.

## How scoring works

Everything is computed from the parsed texts — no score is ever hardcoded.

| Area | Max | What it measures |
|------|----:|------------------|
| Keyword coverage | 50 | Share of job-description keywords (spaCy noun phrases + skill terms) found in the resume |
| Skills match | 20 | Share of hard + soft skills named in the job that appear in the resume |
| Experience & education | 15 | Degree mentioned (5), years of experience (5), quantified achievements (5) |
| Formatting | 15 | Email (4), phone (3), LinkedIn/URL (2), 3+ sections (4), 1–2 page length (2) |
| **Total** | **100** | |

Keywords are extracted with the free spaCy `en_core_web_sm` model
(Apache-2.0, ~13 MB) plus a curated skills list. Matching is whole-phrase,
case-insensitive, so "java" never matches "javascript" — and a skill is
never counted twice.

## Before / after

Sample resume vs the sample Junior Data Analyst job (`sample_data/`):

<!-- SAMPLE-RESULT: verified 2026-11-20, CLI run on sample_data/resume.pdf vs job.txt -->

| | Before (original resume) |
|---|---|
| **Match score** | **57 / 100** |
| Keywords matched | 16 / 42 |
| Skills matched | 8 / 19 |
| Top fix | Add 'a/b testing' with evidence — a bullet showing where you used it and what it achieved |

After applying the report's top fixes — adding the missing skills with
evidence and quantifying two more achievements — the same resume scores
noticeably higher on keyword coverage and skills match. Re-run the CLI on
your edited resume to see the new score; the tool never stores your files.

## Comparison with Jobscan

| Feature | Local ATS Resume Matcher | Jobscan |
|---|---:|---:|
| Price | **Free** | **$49.95/month** |
| Resume upload | Local file only | Uploaded to their servers |
| Works offline | Yes | No |
| Account required | No | Yes |
| Match score + keyword breakdown | Yes | Yes |
| Matched / missing keywords | Yes | Yes |
| Fix suggestions | Yes | Yes |
| LinkedIn optimisation / cover letters | No | Yes (paid) |
| Job tracking dashboard | No | Yes (paid) |

Jobscan is the established paid tool in this niche (founded 2013). This
project is a free, local alternative for the core scoring job — not a
clone of its premium features.

## Privacy

- **100% local.** Parsing, keyword extraction and scoring run on your machine.
- **No network calls at runtime.** After `pip install`, the tool works fully
  offline. Verify it yourself: disconnect and run the CLI.
- **No account, no API key, no telemetry.** Nothing is sent anywhere, ever.
- **Your files stay yours.** The Streamlit app processes uploads in memory
  and deletes its temp files immediately.

## CLI usage

```bash
python -m ats_match --resume my-resume.pdf --job job-description.txt --out report/
```

Options:

| Flag | Meaning |
|---|---|
| `--resume` | Resume file — PDF, DOCX or TXT (required) |
| `--job` | Job description file — TXT or MD (required) |
| `--out` | Output directory for `report.md` + `report.html` (default: `report/`) |
| `--quiet` | Print only the score |

Exit codes: `0` = report written, `1` = input error (missing file, corrupt
PDF, empty job text) with a clear message and no traceback.

## Web app (Streamlit)

```bash
streamlit run app.py
```

Paste the job description, upload the resume, click **Score my resume**.
Download the Markdown or HTML report from the page.

## Sample data

`sample_data/` contains a realistic **fictional** resume — "Alex Carter",
Junior Data Analyst — in PDF and DOCX, plus a fictional Junior Data Analyst
job description (`job.txt`). `sample_output/` holds the report generated
from them. No real person's resume is anywhere in this repo.

## Development & testing

```bash
# syntax check
python -m compileall ats_match app.py

# CLI end-to-end on the sample data
python -m ats_match --resume sample_data/resume.pdf --job sample_data/job.txt --out sample_output/

# error paths (each must exit 1 with a clear message, no traceback)
python -m ats_match --resume missing.pdf --job sample_data/job.txt
python -m ats_match --resume sample_data/resume.pdf --job empty.txt

# determinism: two runs must produce identical reports
python -m ats_match --resume sample_data/resume.pdf --job sample_data/job.txt --out /tmp/run1
python -m ats_match --resume sample_data/resume.pdf --job sample_data/job.txt --out /tmp/run2
diff /tmp/run1/report.md /tmp/run2/report.md && diff /tmp/run1/report.html /tmp/run2/report.html
```

## Limitations

- Keyword matching is lexical (whole-phrase), not semantic: a resume that
  says "data viz" instead of "data visualisation" won't match that phrase.
  Rewording to the job description's own terms is exactly what the fixes
  suggest.
- The spaCy `en_core_web_sm` model is small and fast, not the most accurate
  NLP model — noun-phrase extraction can include generic phrases. The
  curated skills list keeps the important terms precise.
- PDF parsing needs a text-based PDF; scanned-image PDFs are rejected with
  a clear message.
- This tool scores a resume against one job description. It does not write
  your resume for you, and a high score is not a guarantee of an interview.

## License

MIT — see [LICENSE](LICENSE).
