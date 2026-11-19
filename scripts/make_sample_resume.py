"""Generate the fictional sample resume (DOCX + PDF).

Fictional person — no real person's data. Requires reportlab (dev-only,
not a runtime dependency). Run: python scripts/make_sample_resume.py
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sample_data"

RESUME_LINES = [
    ("Alex Carter", "h1"),
    ("alex.carter@example.com  |  07700 900123  |  Leeds, UK  |  linkedin.com/in/alexcarter", "contact"),
    ("", "blank"),
    ("Summary", "h2"),
    ("Data analyst with 2 years of experience turning retail sales data into clear, "
     "actionable reports for buyers and store managers. Skilled in Python, SQL and Excel, "
     "with a strong focus on communication, teamwork and problem solving. Looking for a "
     "junior data analyst role where I can grow my dashboard and reporting skills.", "p"),
    ("", "blank"),
    ("Experience", "h2"),
    ("Junior Data Analyst — BrightMart Supermarkets, Leeds  |  2023 – Present", "h3"),
    ("- Analyse weekly sales data across 60 stores and produce reports for buyers.", "b"),
    ("- Built dashboards in Power BI to track sales and stock availability, used daily by 12 buyers.", "b"),
    ("- Write SQL queries to extract data from the company data warehouse.", "b"),
    ("- Increased reporting speed by 30% by automating Excel reports with Python.", "b"),
    ("- Cut manual reporting time by 6 hours a week by automating repetitive checks with Python and pandas.", "b"),
    ("- Cleaned and validated sales data each week, resolving data quality issues with store teams.", "b"),
    ("- Presented findings to store managers and improved promotion planning.", "b"),
    ("", "blank"),
    ("Data Analyst Intern — City Council Analytics Team, Leeds  |  2022 – 2023", "h3"),
    ("- Cleaned survey data with Python and pandas for a public transport study.", "b"),
    ("- Produced charts and summaries for council officers.", "b"),
    ("- Managed a survey dataset of 4,000 responses and delivered the final report 2 weeks early.", "b"),
    ("", "blank"),
    ("Education", "h2"),
    ("BSc Mathematics — University of Leeds, 2019 – 2022", "p"),
    ("", "blank"),
    ("Skills", "h2"),
    ("Python, SQL, Excel, Power BI, pandas, data analysis, communication, teamwork, "
     "problem solving, time management", "p"),
]


def make_docx(path: Path) -> None:
    import docx

    doc = docx.Document()
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = docx.shared.Pt(11)
    for text, kind in RESUME_LINES:
        if kind == "h1":
            p = doc.add_heading(text, level=0)
        elif kind == "h2":
            p = doc.add_heading(text, level=1)
        elif kind == "h3":
            p = doc.add_heading(text, level=2)
        elif kind == "blank":
            p = doc.add_paragraph()
        elif kind == "b":
            p = doc.add_paragraph(text.lstrip("- "), style="List Bullet")
        else:
            p = doc.add_paragraph(text)
        for run in p.runs:
            run.font.name = "Calibri"
    doc.save(path)


def make_pdf(path: Path) -> None:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    styles = {
        "h1": ParagraphStyle("h1", fontSize=20, leading=24, spaceAfter=4, fontName="Helvetica-Bold"),
        "contact": ParagraphStyle("contact", fontSize=10, leading=13, spaceAfter=8),
        "h2": ParagraphStyle("h2", fontSize=13, leading=16, spaceAfter=4, fontName="Helvetica-Bold"),
        "h3": ParagraphStyle("h3", fontSize=11, leading=14, spaceAfter=2, fontName="Helvetica-Bold"),
        "p": ParagraphStyle("p", fontSize=11, leading=15, spaceAfter=4),
        "b": ParagraphStyle("b", fontSize=11, leading=15, leftIndent=10, bulletIndent=0, spaceAfter=2),
    }
    doc = SimpleDocTemplate(
        str(path), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm,
    )
    story = []
    for text, kind in RESUME_LINES:
        if kind == "blank":
            story.append(Spacer(1, 4 * mm))
        elif kind == "b":
            story.append(Paragraph(text.lstrip("- "), styles["b"], bulletText="•"))
        else:
            story.append(Paragraph(text, styles[kind]))
    doc.build(story)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    make_docx(OUT / "resume.docx")
    make_pdf(OUT / "resume.pdf")
    print("Wrote", OUT / "resume.docx")
    print("Wrote", OUT / "resume.pdf")
