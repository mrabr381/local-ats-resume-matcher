"""Keyword + skill extraction from a job description.

Uses spaCy (en_core_web_sm) noun phrases when the model is available and
falls back to a regex-based extractor so the tool still works offline
without the model. Skills come from a curated, deterministic list.
"""

from __future__ import annotations

import re

# Curated skill vocabulary. Keep sorted; matching is case-insensitive and
# whole-phrase based so "java" never matches "javascript".
HARD_SKILLS = sorted(
    {
        "python", "java", "javascript", "typescript", "sql", "excel", "power bi",
        "tableau", "git", "github", "docker", "kubernetes", "aws", "azure",
        "google cloud", "gcp", "linux", "html", "css", "react", "node.js",
        "django", "flask", "pandas", "numpy", "machine learning", "data analysis",
        "data visualisation", "data visualization", "statistics", "a/b testing",
        "seo", "google analytics", "crm", "salesforce", "hubspot", "sap",
        "quickbooks", "project management", "agile", "scrum", "kanban", "jira",
        "confluence", "figma", "adobe photoshop", "adobe illustrator",
        "content writing", "copywriting", "email marketing", "social media",
        "digital marketing", "google ads", "meta ads", "budgeting", "forecasting",
        "financial modelling", "financial modeling", "accounting", "bookkeeping",
        "payroll", "recruitment", "onboarding", "customer service", "negotiation",
        "procurement", "supply chain", "logistics", "inventory management",
        "quality assurance", "qa testing", "automation", "etl", "data warehousing",
        "powerpoint", "microsoft office", "microsoft word", "google sheets",
        "r programming", "matlab", "c++", "c#", "go", "rust", "php", "ruby",
        "terraform", "jenkins", "ci/cd", "rest api", "graphql", "mongodb",
        "postgresql", "mysql", "redis", "elasticsearch", "airflow", "spark",
        "tensorflow", "pytorch", "nlp", "computer vision", "cybersecurity",
        "networking", "technical writing", "ux design", "ui design",
        "product management", "stakeholder management", "risk management",
        "compliance", "auditing", "tax", "legal research", "public speaking",
        "event planning", "fundraising", "grant writing", "teaching", "mentoring",
        "first aid", "health and safety", "food safety", "driving licence",
    }
)

SOFT_SKILLS = sorted(
    {
        "communication", "teamwork", "leadership", "problem solving",
        "critical thinking", "time management", "adaptability", "creativity",
        "attention to detail", "organisation", "organization", "collaboration",
        "empathy", "conflict resolution", "decision making", "multitasking",
        "work ethic", "reliability", "initiative", "resilience",
        "customer focus", "analytical thinking", "mentoring", "coaching",
        "presentation skills", "negotiation skills", "interpersonal skills",
    }
)

ALL_SKILLS = sorted(set(HARD_SKILLS) | set(SOFT_SKILLS))

_NLP = None
_NLP_TRIED = False


def _load_nlp():
    """Load spaCy en_core_web_sm once; return None if unavailable."""
    global _NLP, _NLP_TRIED
    if _NLP_TRIED:
        return _NLP
    _NLP_TRIED = True
    try:
        import spacy

        _NLP = spacy.load("en_core_web_sm")
    except Exception:
        _NLP = None
    return _NLP


def normalize(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation edges."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9+#./\- ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _phrase_in(phrase: str, text_norm: str) -> bool:
    """Whole-phrase match on normalised text (word boundaries)."""
    return re.search(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", text_norm) is not None


def find_skills(text: str) -> dict[str, list[str]]:
    """Return {'hard': [...], 'soft': [...]} skills present in the text."""
    norm = normalize(text)
    return {
        "hard": [s for s in HARD_SKILLS if _phrase_in(s, norm)],
        "soft": [s for s in SOFT_SKILLS if _phrase_in(s, norm)],
    }


def _clean_job_text(job_text: str) -> str:
    """Strip bullet markers / list dashes so they never leak into phrases."""
    cleaned = []
    for line in job_text.splitlines():
        line = re.sub(r"^\s*[-•*–—]\s+", "", line)
        line = re.sub(r"\s+[-–—]\s+", " ", line)
        cleaned.append(line)
    return "\n".join(cleaned)


_JUNK_WORDS = {"hybrid", "salary", "ability", "skills", "skill"}

_VERB_LEAD_WORDS = {
    "present", "write", "build", "support", "analyse", "analyze", "run",
    "manage", "deliver", "produce", "use", "work", "lead", "create",
    "develop", "provide", "help", "ensure", "maintain", "prepare", "review",
    "check", "send", "complete", "turn", "make", "take", "give",
}


def _skill_wrapped(phrase: str, skill_set: set[str]) -> bool:
    """True if the phrase merely wraps a known skill ("strong excel skills")."""
    return any(s != phrase and s in phrase for s in skill_set)


def _has_junk_word(phrase: str) -> bool:
    return any(w in _JUNK_WORDS for w in phrase.split())


_GENERIC_SINGLE_WORDS = {
    "experience", "knowledge", "understanding", "ability", "home", "team",
    "company", "role", "job", "candidate", "decisions", "deadlines", "build",
    "that", "thing", "way", "people", "work", "day", "days", "week", "weeks",
    "month", "months", "year", "years", "salary", "holiday", "opportunity",
    "floor", "shop", "store", "stores", "group", "retail", "environment",
    "colleagues", "managers", "buyers", "officers", "path", "detail", "details",
}

_TAIL_PHRASES = ("best practice", "best practices")


def extract_keywords(job_text: str) -> list[str]:
    """Job-description keywords: matched skills + spaCy noun phrases.

    Deduplicated, sorted, deterministic. Skill terms are removed from the
    noun-phrase set so a skill is never counted twice, and generic /
    artefactual phrases (bullets, numbers, verb phrases, conjunction joins)
    are filtered out.
    """
    job_text = _clean_job_text(job_text)
    skills = find_skills(job_text)
    skill_set = set(skills["hard"]) | set(skills["soft"])

    phrases: set[str] = set()
    nlp = _load_nlp()
    if nlp is not None:
        doc = nlp(job_text)
        for chunk in doc.noun_chunks:
            phrase = normalize(chunk.text)
            if _keep_chunk(phrase, chunk, skill_set):
                phrases.add(phrase)
        for ent in doc.ents:
            if ent.label_ in {"ORG", "PRODUCT", "GPE", "WORK_OF_ART"}:
                phrase = normalize(ent.text)
                if (
                    _keep_phrase(phrase)
                    and phrase not in skill_set
                    and not _skill_wrapped(phrase, skill_set)
                    and not _has_junk_word(phrase)
                ):
                    phrases.add(phrase)
    else:
        # Fallback: capitalised multi-word sequences + hyphenated terms.
        for m in re.finditer(
            r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", job_text
        ):
            phrase = normalize(m.group(0))
            if _keep_phrase(phrase) and phrase not in skill_set:
                phrases.add(phrase)

    # Strip generic trailing tails, then drop a non-skill phrase when it is
    # a proper substring of a longer keyword (e.g. "junior data" inside
    # "junior data analyst", "sales" inside "sales data").
    phrases = {_strip_tail(p) for p in phrases}
    phrases = {p for p in phrases if p and _keep_phrase(p)}
    keywords = sorted(skill_set | phrases)
    keywords = _drop_subsumed(keywords, skill_set)
    return keywords


def _strip_tail(phrase: str) -> str:
    for tail in _TAIL_PHRASES:
        if phrase.endswith(" " + tail):
            phrase = phrase[: -len(tail) - 1]
    return phrase


def _drop_subsumed(keywords: list[str], skill_set: set[str]) -> list[str]:
    keep = []
    for kw in keywords:
        if kw in skill_set:
            keep.append(kw)
            continue
        subsumed = any(
            kw != other and kw in other for other in keywords
        )
        if not subsumed:
            keep.append(kw)
    return keep


def _keep_chunk(phrase: str, chunk, skill_set: set[str]) -> bool:
    if not _keep_phrase(phrase):
        return False
    if phrase in skill_set:
        return False
    # A phrase that merely wraps a known skill ("strong excel skills")
    # adds no signal beyond the skill itself.
    if _skill_wrapped(phrase, skill_set):
        return False
    if _has_junk_word(phrase):
        return False
    # Verb-led phrases ("write sql", "present insights") are actions,
    # not keywords.
    first = chunk[0]
    if first.pos_ == "VERB" or first.tag_.startswith("VB"):
        return False
    if first.lemma_.lower() in _VERB_LEAD_WORDS:
        return False
    return True


_STOP_PHRASES = {
    "the company", "the role", "the team", "the candidate", "the successful candidate",
    "a team", "our team", "this role", "the position", "our company",
    "we are", "you will", "the job", "an opportunity", "the opportunity",
    "key responsibilities", "essential requirements", "desirable skills",
}


def _keep_phrase(phrase: str) -> bool:
    if not phrase or len(phrase) < 3:
        return False
    if phrase in _STOP_PHRASES:
        return False
    if any(ch.isdigit() for ch in phrase):
        return False
    if " or " in phrase or " and " in phrase:
        return False
    if " - " in phrase or phrase.startswith("-"):
        return False
    if phrase.startswith("our "):
        return False  # company-internal references no resume would contain
    words = phrase.split()
    if len(words) > 5:
        return False
    if len(words) == 1 and words[0] in _GENERIC_SINGLE_WORDS:
        return False
    if all(len(w) <= 2 for w in words):
        return False
    # Drop phrases that are mostly stopwords / pronouns.
    stop = {"the", "a", "an", "and", "of", "to", "in", "for", "with", "our", "we", "you"}
    content = [w for w in words if w not in stop]
    return len(content) >= 1 and len(content) / len(words) >= 0.5
