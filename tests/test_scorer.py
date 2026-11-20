"""Tests for the Local ATS Resume Matcher scoring maths.

The sample-run numbers below are the verified CLI run of 2026-11-20 on
the bundled sample data (sample_data/resume.txt vs sample_data/job.txt,
the real anonymised NHS Jobs posting): score 36/100, 5/101 keywords
matched (2.5/50), 1/5 skills matched (4.0/20), 15.0/15 experience &
education, 15.0/15 formatting.

Note: the numbers hold with AND without the spaCy model installed —
without it the tool uses its built-in regex fallback extractor, which
was verified to give the identical 36/100 on this sample data.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from ats_match.scorer import WEIGHTS, score_resume

ROOT = Path(__file__).resolve().parents[1]
RESUME = (ROOT / "sample_data" / "resume.txt").read_text(encoding="utf-8")
JOB = (ROOT / "sample_data" / "job.txt").read_text(encoding="utf-8")


def sample_result():
    return score_resume(RESUME, JOB)


def test_sample_run_score_is_36():
    result = sample_result()
    assert result.score == 36


def test_sample_run_breakdown():
    result = sample_result()
    assert result.breakdown == {
        "keyword_coverage": 2.5,
        "skills_match": 4.0,
        "experience_education": 15.0,
        "formatting": 15.0,
    }


def test_breakdown_sums_to_score():
    # Breakdown parts are rounded to 1 decimal each, so their sum can sit
    # up to 0.5 away from the integer score: 2.5 + 4.0 + 15.0 + 15.0 = 36.5,
    # and int(round(36.5)) == 36 (Python rounds half to even).
    result = sample_result()
    assert sum(result.breakdown.values()) == pytest.approx(36.5)
    assert result.score == int(round(sum(result.breakdown.values())))
    assert abs(sum(result.breakdown.values()) - result.score) <= 0.5


def test_keyword_maths():
    # 5 of 101 keywords matched -> 5/101 * 50 = 2.475 -> 2.5
    result = sample_result()
    assert len(result.keywords) == 101
    assert len(result.matched_keywords) == 5
    assert len(result.missing_keywords) == 96
    assert result.breakdown["keyword_coverage"] == pytest.approx(
        len(result.matched_keywords) / len(result.keywords) * 50, abs=0.05
    )


def test_skills_maths():
    # 1 of 5 skills matched -> 1/5 * 20 = 4.0
    result = sample_result()
    assert len(result.matched_skills) == 1
    assert result.matched_skills == ["excel"]
    assert len(result.missing_skills) == 4
    assert result.breakdown["skills_match"] == pytest.approx(
        len(result.matched_skills)
        / (len(result.matched_skills) + len(result.missing_skills))
        * 20,
        abs=0.05,
    )


def test_weights_sum_to_100():
    assert sum(WEIGHTS.values()) == 100
    assert WEIGHTS == {
        "keyword_coverage": 50,
        "skills_match": 20,
        "experience_education": 15,
        "formatting": 15,
    }


def test_sample_resume_signals():
    result = sample_result()
    assert result.signals["has_degree"] is True
    assert result.signals["has_years"] is True
    assert result.signals["has_quantified"] is True
    assert result.signals["has_email"] is True
    assert result.signals["has_phone"] is True
    assert result.signals["section_count"] >= 3
    assert result.resume_words == 248


def test_empty_job_raises():
    with pytest.raises(ValueError, match="Job description is empty"):
        score_resume(RESUME, "   ")


def test_empty_resume_raises():
    with pytest.raises(ValueError, match="Resume text is empty"):
        score_resume("   ", JOB)


def test_scoring_is_deterministic():
    first = sample_result()
    second = sample_result()
    assert first.score == second.score
    assert first.breakdown == second.breakdown
    assert first.matched_keywords == second.matched_keywords
    assert first.missing_keywords == second.missing_keywords


def test_top_fix_names_a_missing_skill():
    result = sample_result()
    assert result.fixes
    assert "forecasting" in result.fixes[0]
