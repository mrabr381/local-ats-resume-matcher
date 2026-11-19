"""Scoring engine — everything is computed from the parsed texts.

Weights (sum to 100):
  * keyword coverage   50 pts — share of job keywords present in the resume
  * skills match       20 pts — share of job skills present in the resume
  * experience/education signals 15 pts — degree, years, quantified results
  * formatting         15 pts — contact info, sections, sensible length
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .keywords import ALL_SKILLS, extract_keywords, find_skills, normalize, _phrase_in
from .parser import page_estimate, word_count

WEIGHTS = {
    "keyword_coverage": 50,
    "skills_match": 20,
    "experience_education": 15,
    "formatting": 15,
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(\+\d[\d\s().-]{7,}\d|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|\b07\d{3}[\s-]?\d{6}\b)")
LINKEDIN_RE = re.compile(r"linkedin\.com/\S+", re.I)
URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)

SECTION_PATTERNS = {
    "experience": re.compile(r"\b(experience|employment|work history|career)\b", re.I),
    "education": re.compile(r"\b(education|qualifications|degree)\b", re.I),
    "skills": re.compile(r"\b(skills|core skills|technical skills|competencies)\b", re.I),
    "summary": re.compile(r"\b(summary|profile|objective|about)\b", re.I),
}

DEGREE_RE = re.compile(
    r"\b(b\.?a\.?|b\.?sc\.?|b\.?eng\.?|b\.?com\.?|m\.?a\.?|m\.?sc\.?|m\.?ba\.?|"
    r"m\.?eng\.?|ph\.?d\.?|bachelor|master'?s|doctorate|diploma|a-level|gcse|"
    r"degree)\b",
    re.I,
)
YEARS_RE = re.compile(r"(\d+)\+?\s*(?:years?|yrs?)\b", re.I)
NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:%|percent|k|£|\$|€)?\b")
QUANTIFIED_RE = re.compile(
    r"\b(increased|reduced|improved|grew|saved|delivered|achieved|generated|"
    r"cut|boosted|raised|lowered|managed|led|launched)\b[^.]{0,60}?\d",
    re.I,
)


@dataclass
class MatchResult:
    score: int
    breakdown: dict[str, float]
    keywords: list[str]
    matched_keywords: list[str]
    missing_keywords: list[str]
    matched_skills: list[str]
    missing_skills: list[str]
    fixes: list[str]
    signals: dict
    resume_words: int
    resume_pages: float

    def to_dict(self) -> dict:
        return {
            "score": self.score,
            "breakdown": self.breakdown,
            "keywords": self.keywords,
            "matched_keywords": self.matched_keywords,
            "missing_keywords": self.missing_keywords,
            "matched_skills": self.matched_skills,
            "missing_skills": self.missing_skills,
            "fixes": self.fixes,
            "signals": self.signals,
            "resume_words": self.resume_words,
            "resume_pages": self.resume_pages,
        }


def _split_keyword_hits(keywords: list[str], resume_norm: str) -> tuple[list[str], list[str]]:
    matched, missing = [], []
    for kw in keywords:
        if _phrase_in(kw, resume_norm):
            matched.append(kw)
        else:
            missing.append(kw)
    return matched, missing


def score_resume(resume_text: str, job_text: str) -> MatchResult:
    if not job_text.strip():
        raise ValueError("Job description is empty — paste a job description first.")
    if not resume_text.strip():
        raise ValueError("Resume text is empty — the file produced no readable text.")

    resume_norm = normalize(resume_text)
    job_norm = normalize(job_text)

    keywords = extract_keywords(job_text)
    matched_kw, missing_kw = _split_keyword_hits(keywords, resume_norm)
    keyword_coverage = len(matched_kw) / len(keywords) if keywords else 0.0

    job_skills = find_skills(job_text)
    all_job_skills = sorted(set(job_skills["hard"]) | set(job_skills["soft"]))
    matched_sk, missing_sk = _split_keyword_hits(all_job_skills, resume_norm)
    skills_coverage = len(matched_sk) / len(all_job_skills) if all_job_skills else 0.0

    # --- experience / education signals (15 pts) ---
    signals: dict = {}
    signals["has_degree"] = bool(DEGREE_RE.search(resume_text))
    years = [int(m.group(1)) for m in YEARS_RE.finditer(resume_text)]
    signals["years_experience"] = max(years) if years else 0
    signals["has_years"] = bool(years)
    signals["quantified_count"] = len(QUANTIFIED_RE.findall(resume_text))
    signals["has_quantified"] = signals["quantified_count"] > 0
    signals["number_count"] = len(NUMBER_RE.findall(resume_text))

    exp_points = 0.0
    if signals["has_degree"]:
        exp_points += 5
    if signals["has_years"]:
        exp_points += 5
    if signals["has_quantified"]:
        exp_points += 5
    elif signals["number_count"] >= 3:
        exp_points += 2  # some numbers, but not tied to achievements

    # --- formatting (15 pts) ---
    signals["has_email"] = bool(EMAIL_RE.search(resume_text))
    signals["has_phone"] = bool(PHONE_RE.search(resume_text))
    signals["has_linkedin_or_url"] = bool(LINKEDIN_RE.search(resume_text) or URL_RE.search(resume_text))
    signals["sections"] = {
        name: bool(pat.search(resume_text)) for name, pat in SECTION_PATTERNS.items()
    }
    signals["section_count"] = sum(signals["sections"].values())
    words = word_count(resume_text)
    signals["word_count"] = words
    pages = page_estimate(resume_text)
    signals["page_estimate"] = pages
    signals["length_ok"] = 200 <= words <= 1200

    fmt_points = 0.0
    if signals["has_email"]:
        fmt_points += 4
    if signals["has_phone"]:
        fmt_points += 3
    if signals["has_linkedin_or_url"]:
        fmt_points += 2
    if signals["section_count"] >= 3:
        fmt_points += 4
    elif signals["section_count"] == 2:
        fmt_points += 2
    if signals["length_ok"]:
        fmt_points += 2

    breakdown = {
        "keyword_coverage": round(keyword_coverage * WEIGHTS["keyword_coverage"], 1),
        "skills_match": round(skills_coverage * WEIGHTS["skills_match"], 1),
        "experience_education": round(exp_points, 1),
        "formatting": round(fmt_points, 1),
    }
    total = sum(breakdown.values())
    score = max(0, min(100, int(round(total))))

    fixes = _build_fixes(
        missing_kw, missing_sk, keyword_coverage, skills_coverage, signals
    )

    return MatchResult(
        score=score,
        breakdown=breakdown,
        keywords=keywords,
        matched_keywords=matched_kw,
        missing_keywords=missing_kw,
        matched_skills=matched_sk,
        missing_skills=missing_sk,
        fixes=fixes,
        signals=signals,
        resume_words=words,
        resume_pages=pages,
    )


def _build_fixes(
    missing_kw: list[str],
    missing_sk: list[str],
    kw_cov: float,
    sk_cov: float,
    signals: dict,
) -> list[str]:
    fixes: list[str] = []

    # Highest-impact first: missing skills, then missing keywords.
    for skill in missing_sk[:5]:
        fixes.append(
            f"Add the skill '{skill}' with evidence — a bullet showing where "
            f"you used it and what it achieved, not just a word in a skills list."
        )
    other_kw = [
        k
        for k in missing_kw
        if k not in missing_sk
        and not k.startswith(("a ", "an ", "the ", "our "))
        and len(k.split()) <= 2
    ][:5]
    for kw in other_kw:
        fixes.append(
            f"Work the phrase '{kw}' into your experience naturally — "
            "ATS systems rank resumes on the exact terms in the job description."
        )
    if not signals["has_quantified"]:
        fixes.append(
            "Quantify your achievements — add numbers to at least 3 bullets "
            "(e.g. 'increased sales by 18%', 'cut processing time by 2 days')."
        )
    if not signals["has_email"]:
        fixes.append("Add a professional email address to your contact details.")
    if not signals["has_phone"]:
        fixes.append("Add a phone number to your contact details.")
    if not signals["has_linkedin_or_url"]:
        fixes.append("Add your LinkedIn profile URL or a portfolio link.")
    missing_sections = [
        name for name, present in signals["sections"].items() if not present
    ]
    if "experience" in missing_sections:
        fixes.append("Add a clear 'Experience' section with job titles, employers and dates.")
    if "education" in missing_sections:
        fixes.append("Add an 'Education' section with your highest qualification.")
    if "skills" in missing_sections:
        fixes.append("Add a 'Skills' section listing the tools and skills from the job description.")
    if "summary" in missing_sections:
        fixes.append(
            "Add a 2–3 line 'Summary' at the top, tailored to this role, "
            "using the job description's own language."
        )
    if not signals["length_ok"]:
        if signals["word_count"] < 250:
            fixes.append(
                f"Your resume is very short ({signals['word_count']} words, "
                "~1 page or less). Add detail to your experience bullets."
            )
        else:
            fixes.append(
                f"Your resume is long ({signals['word_count']} words, "
                f"~{signals['page_estimate']} pages). Trim to 1–2 pages — "
                "cut older roles and keep only what matches this job."
            )
    if kw_cov >= 0.8 and sk_cov >= 0.8 and not fixes:
        fixes.append(
            "Strong match — do a final proofread and tailor the top summary "
            "to the hiring manager's first requirement."
        )
    return fixes
