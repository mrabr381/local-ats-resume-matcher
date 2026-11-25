"""Streamlit front-end for Local ATS Resume Matcher.

Run:  streamlit run app.py
Everything runs locally — uploaded files are processed in memory and
never leave this machine.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import streamlit as st

from ats_match.parser import SUPPORTED_EXTENSIONS, extract_text
from ats_match.report import render_html, render_markdown
from ats_match.scorer import score_resume

st.set_page_config(
    page_title="Local ATS Resume Matcher",
    page_icon="📄",
    layout="centered",
)

st.sidebar.markdown("---")
st.sidebar.link_button("⭐ Star on GitHub", "https://github.com/mrabr381/local-ats-resume-matcher")
st.sidebar.link_button("☕ Buy me a coffee", "https://www.buymeacoffee.com/muhammadabubakar")

st.title("📄 Local ATS Resume Matcher")
st.markdown(
    "Free, local, privacy-first resume scoring. Paste a job description, "
    "upload your resume (PDF / DOCX / TXT) — nothing leaves your machine."
)

job_text = st.text_area(
    "Job description",
    height=200,
    placeholder="Paste the full job description here…",
    help="The keywords and skills are extracted from this text.",
)

resume_file = st.file_uploader(
    "Resume",
    type=[ext.lstrip(".") for ext in SUPPORTED_EXTENSIONS],
    help="PDF, DOCX or TXT. Processed locally, never uploaded anywhere.",
)

if st.button("Score my resume", type="primary"):
    if not job_text.strip():
        st.error("Paste a job description first.")
    elif resume_file is None:
        st.error("Upload your resume first.")
    else:
        suffix = Path(resume_file.name).suffix
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(resume_file.getbuffer())
            tmp_path = tmp.name
        try:
            resume_text = extract_text(tmp_path)
            result = score_resume(resume_text, job_text)
        except Exception as exc:  # ParseError / ValueError → user-facing message
            st.error(str(exc))
        else:
            st.metric("Match score", f"{result.score}/100")
            st.progress(result.score / 100)
            st.write(
                {
                    "Keyword coverage": f"{result.breakdown['keyword_coverage']}/50",
                    "Skills match": f"{result.breakdown['skills_match']}/20",
                    "Experience & education": f"{result.breakdown['experience_education']}/15",
                    "Formatting": f"{result.breakdown['formatting']}/15",
                }
            )

            st.subheader(f"Matched keywords ({len(result.matched_keywords)}/{len(result.keywords)})")
            st.write(", ".join(result.matched_keywords) or "—")

            st.subheader(f"Missing keywords ({len(result.missing_keywords)})")
            st.write(", ".join(result.missing_keywords) or "—")

            st.subheader("Skills")
            col1, col2 = st.columns(2)
            with col1:
                st.markdown("**Matched**")
                st.write("\n".join(f"- {s}" for s in result.matched_skills) or "—")
            with col2:
                st.markdown("**Missing**")
                st.write("\n".join(f"- {s}" for s in result.missing_skills) or "—")

            st.subheader("Prioritised fixes")
            for i, fix in enumerate(result.fixes, 1):
                st.write(f"{i}. {fix}")

            st.download_button(
                "Download Markdown report",
                render_markdown(result, resume_file.name, "job description"),
                file_name="ats-report.md",
                mime="text/markdown",
            )
            st.download_button(
                "Download HTML report",
                render_html(result, resume_file.name, "job description"),
                file_name="ats-report.html",
                mime="text/html",
            )
        finally:
            Path(tmp_path).unlink(missing_ok=True)

st.divider()
st.caption(
    "100% local — no account, no upload, no API key. "
    "Built with spaCy (en_core_web_sm) + pdfplumber + python-docx."
)
