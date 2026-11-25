/* Local ATS Resume Matcher — interactive demo (demo/app.js)
 *
 * A faithful in-browser port of ats_match/scorer.py and
 * ats_match/keywords.py. Same weights, same regexes, same fix text.
 * The one deliberate approximation: the Python tool extracts job
 * keywords with spaCy's noun_chunks (en_core_web_sm) when the model is
 * installed. Browsers cannot run spaCy, so this file uses a rule-based
 * noun-phrase chunker (see extractNounPhrases) that reproduces spaCy's
 * chunks on ordinary job descriptions — on the bundled sample (real NHS
 * Jobs posting + sample CV) it reproduces the Python score exactly.
 * Everything runs locally in the page: no server, no upload, no keys.
 */
"use strict";

/* ------------------------------------------------------------------ */
/* Data ported verbatim from ats_match/keywords.py                     */
/* ------------------------------------------------------------------ */

const HARD_SKILLS = ["a/b testing", "accounting", "adobe illustrator", "adobe photoshop", "agile", "airflow", "auditing", "automation", "aws", "azure", "bookkeeping", "budgeting", "c#", "c++", "ci/cd", "compliance", "computer vision", "confluence", "content writing", "copywriting", "crm", "css", "customer service", "cybersecurity", "data analysis", "data visualisation", "data visualization", "data warehousing", "digital marketing", "django", "docker", "driving licence", "elasticsearch", "email marketing", "etl", "event planning", "excel", "figma", "financial modeling", "financial modelling", "first aid", "flask", "food safety", "forecasting", "fundraising", "gcp", "git", "github", "go", "google ads", "google analytics", "google cloud", "google sheets", "grant writing", "graphql", "health and safety", "html", "hubspot", "inventory management", "java", "javascript", "jenkins", "jira", "kanban", "kubernetes", "legal research", "linux", "logistics", "machine learning", "matlab", "mentoring", "meta ads", "microsoft office", "microsoft word", "mongodb", "mysql", "negotiation", "networking", "nlp", "node.js", "numpy", "onboarding", "pandas", "payroll", "php", "postgresql", "power bi", "powerpoint", "procurement", "product management", "project management", "public speaking", "python", "pytorch", "qa testing", "quality assurance", "quickbooks", "r programming", "react", "recruitment", "redis", "rest api", "risk management", "ruby", "rust", "salesforce", "sap", "scrum", "seo", "social media", "spark", "sql", "stakeholder management", "statistics", "supply chain", "tableau", "tax", "teaching", "technical writing", "tensorflow", "terraform", "typescript", "ui design", "ux design"];
const SOFT_SKILLS = ["adaptability", "analytical thinking", "attention to detail", "coaching", "collaboration", "communication", "conflict resolution", "creativity", "critical thinking", "customer focus", "decision making", "empathy", "initiative", "interpersonal skills", "leadership", "mentoring", "multitasking", "negotiation skills", "organisation", "organization", "presentation skills", "problem solving", "reliability", "resilience", "teamwork", "time management", "work ethic"];
const ALL_SKILLS = [...new Set([...HARD_SKILLS, ...SOFT_SKILLS])].sort();

/* ------------------------------------------------------------------ */
/* Small helpers (Python semantics, incl. round-half-to-even)          */
/* ------------------------------------------------------------------ */

// Python's round(): ties go to the even neighbour. JavaScript's
// Math.round() rounds halves up, which would turn a 36.5 total into 37
// where Python gives 36 — so the scorer must use this, not Math.round.
function pyRound(x, digits) {
  const p = Math.pow(10, digits);
  const n = x * p;
  const f = Math.floor(n);
  const diff = n - f;
  if (diff > 0.5 + 1e-9) return (f + 1) / p;
  if (diff < 0.5 - 1e-9) return f / p;
  return (f % 2 === 0 ? f : f + 1) / p;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* ------------------------------------------------------------------ */
/* keywords.py port                                                    */
/* ------------------------------------------------------------------ */

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Whole-phrase match on normalised text (word boundaries), as in
// keywords._phrase_in — so "java" never matches "javascript".
function phraseIn(phrase, textNorm) {
  return new RegExp("(?<!\\w)" + escapeRegExp(phrase) + "(?!\\w)").test(textNorm);
}

function findSkills(text) {
  const norm = normalize(text);
  return {
    hard: HARD_SKILLS.filter((s) => phraseIn(s, norm)),
    soft: SOFT_SKILLS.filter((s) => phraseIn(s, norm)),
  };
}

function cleanJobText(jobText) {
  return jobText
    .split("\n")
    .map((line) =>
      line.replace(/^\s*[-•*–—]\s+/, "").replace(/\s+[-–—]\s+/g, " ")
    )
    .join("\n");
}

const JUNK_WORDS = new Set(["hybrid", "salary", "ability", "skills", "skill"]);

const VERB_LEAD_WORDS = new Set([
  "present", "write", "build", "support", "analyse", "analyze", "run",
  "manage", "deliver", "produce", "use", "work", "lead", "create",
  "develop", "provide", "help", "ensure", "maintain", "prepare", "review",
  "check", "send", "complete", "turn", "make", "take", "give",
]);

const GENERIC_SINGLE_WORDS = new Set([
  "experience", "knowledge", "understanding", "ability", "home", "team",
  "company", "role", "job", "candidate", "decisions", "deadlines", "build",
  "that", "thing", "way", "people", "work", "day", "days", "week", "weeks",
  "month", "months", "year", "years", "salary", "holiday", "opportunity",
  "floor", "shop", "store", "stores", "group", "retail", "environment",
  "colleagues", "managers", "buyers", "officers", "path", "detail", "details",
]);

const TAIL_PHRASES = ["best practice", "best practices"];

const STOP_PHRASES = new Set([
  "the company", "the role", "the team", "the candidate",
  "the successful candidate", "a team", "our team", "this role",
  "the position", "our company", "we are", "you will", "the job",
  "an opportunity", "the opportunity", "key responsibilities",
  "essential requirements", "desirable skills",
]);

function skillWrapped(phrase, skillSet) {
  for (const s of skillSet) {
    if (s !== phrase && phrase.includes(s)) return true;
  }
  return false;
}

function hasJunkWord(phrase) {
  return phrase.split(" ").some((w) => JUNK_WORDS.has(w));
}

function keepPhrase(phrase) {
  if (!phrase || phrase.length < 3) return false;
  if (STOP_PHRASES.has(phrase)) return false;
  if (/\d/.test(phrase)) return false;
  if (phrase.includes(" or ") || phrase.includes(" and ")) return false;
  if (phrase.includes(" - ") || phrase.startsWith("-")) return false;
  if (phrase.startsWith("our ")) return false;
  const words = phrase.split(" ");
  if (words.length > 5) return false;
  if (words.length === 1 && GENERIC_SINGLE_WORDS.has(words[0])) return false;
  if (words.every((w) => w.length <= 2)) return false;
  const stop = new Set([
    "the", "a", "an", "and", "of", "to", "in", "for", "with", "our", "we", "you",
  ]);
  const content = words.filter((w) => !stop.has(w));
  return content.length >= 1 && content.length / words.length >= 0.5;
}

function stripTail(phrase) {
  for (const tail of TAIL_PHRASES) {
    if (phrase.endsWith(" " + tail)) phrase = phrase.slice(0, -tail.length - 1);
  }
  return phrase;
}

function dropSubsumed(keywords, skillSet) {
  const keep = [];
  for (const kw of keywords) {
    if (skillSet.has(kw)) {
      keep.push(kw);
      continue;
    }
    const subsumed = keywords.some((other) => kw !== other && other.includes(kw));
    if (!subsumed) keep.push(kw);
  }
  return keep;
}

// spaCy's _keep_chunk: a noun phrase is kept unless it is a skill itself,
// merely wraps a skill, contains a junk word, or starts with a verb.
function keepChunk(chunk, skillSet) {
  if (!keepPhrase(chunk.phrase)) return false;
  if (skillSet.has(chunk.phrase)) return false;
  if (skillWrapped(chunk.phrase, skillSet)) return false;
  if (hasJunkWord(chunk.phrase)) return false;
  if (chunk.firstPos === "VERB") return false;
  if (VERB_LEAD_WORDS.has(chunk.firstLemma)) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Rule-based noun-phrase chunker (stands in for spaCy noun_chunks)   */
/*                                                                     */
/* spaCy builds noun phrases from a dependency parse, which a browser */
/* cannot run. This chunker scans for the same shapes with local      */
/* rules: a chunk is a run of determiners / adjectives / noun          */
/* modifiers ending in a noun head. Verbs, prepositions, auxiliaries  */
/* and relative pronouns end a chunk; "and"/"or" joins two chunks     */
/* only when both sides look like modifiers of one shared head        */
/* (e.g. "ADHD and Autism referrals"); otherwise each side is its     */
/* own chunk. Sentence-initial capitalised verbs are the one place    */
/* spaCy itself is inconsistent (it tags bullet-leading "Track" and   */
/* "Forecast" as nouns but "Identify" and "Run" as verbs), so the     */
/* chunker follows the majority pattern: a capitalised verb at the    */
/* start of a line is treated as a noun unless the next word is a      */
/* plural noun ("Identify trends") or the word "to" follows            */
/* ("Contribute to ..."). Gerunds (-ing) and participles (-ed) are    */
/* noun-like inside a phrase, but verb-led at its start ("issuing     */
/* reports", "shared care status"), matching spaCy's rejections.      */
/* ------------------------------------------------------------------ */

const DET_WORDS = new Set([
  "a", "an", "the", "this", "these", "those", "all", "both", "each",
  "every", "either", "neither", "any", "some", "no", "another", "one",
  "its", "our", "your", "their", "his", "her", "my", "few", "many",
  "most", "other", "same", "such", "whose",
]);
const PRON_HEAD_WORDS = new Set([
  "someone", "something", "anyone", "anybody", "everyone", "everybody",
  "somebody", "nobody", "anything", "everything", "nothing", "what",
]);
const PRON_SUBJ_WORDS = new Set([
  "i", "we", "you", "he", "she", "it", "they", "me", "him", "us", "them",
]);
const PREP_WORDS = new Set([
  "in", "of", "for", "with", "to", "by", "from", "on", "at", "after",
  "per", "across", "between", "through", "under", "over", "into",
  "against", "without", "within", "via", "as", "than", "about", "before",
  "during", "including", "using", "regarding", "concerning", "following",
  "alongside", "among", "around", "behind", "below", "above", "near",
  "toward", "towards", "upon", "until", "since", "while",
]);
const AUX_WORDS = new Set([
  "is", "are", "was", "were", "be", "been", "being", "has", "have",
  "had", "will", "would", "could", "should", "may", "might", "must",
  "do", "does", "did", "can", "am",
]);
const REL_WORDS = new Set(["that", "which", "who", "whom"]);
// Common verbs found at the head of job-description clauses. A verb only
// ever breaks a chunk when it would start one; inside a chunk ("service
// leads", "quarterly reports") the same word is a noun.
const VERB_WORDS = new Set([
  "analyse", "analyze", "apply", "assist", "attend", "add", "allow",
  "ask", "base", "become", "begin", "bring", "build", "call", "capture",
  "carry", "change", "check", "clean", "close", "code", "collaborate",
  "come", "compile", "complete", "conduct", "continue", "contribute",
  "coordinate", "communicate", "cover", "create", "deliver", "design",
  "develop", "drive", "enable", "ensure", "establish", "feel", "finish",
  "focus", "follow", "get", "give", "go", "grow", "handle", "happen",
  "help", "identify", "implement", "improve", "include", "involve",
  "join", "keep", "lead", "leave", "liaise", "look", "maintain", "make",
  "manage", "mean", "meet", "monitor", "move", "need", "offer", "open",
  "organise", "organize", "oversee", "own", "perform", "play", "prepare",
  "present", "process", "produce", "provide", "publish", "put", "read",
  "relate", "report", "require", "resolve", "return", "review", "run",
  "seek", "send", "serve", "set", "shape", "show", "speak", "start",
  "submit", "support", "take", "tell", "track", "try", "turn", "use",
  "work", "write",
  "analyses", "analyzes", "applies", "assists", "attends", "adds",
  "allows", "asks", "bases", "becomes", "begins", "brings", "builds",
  "calls", "captures", "carries", "changes", "checks", "cleans",
  "closes", "codes", "collaborates", "comes", "compiles", "completes",
  "conducts", "continues", "contributes", "coordinates", "communicates",
  "covers", "creates", "delivers", "designs", "develops", "drives",
  "enables", "ensures", "establishes", "feels", "finishes", "focuses",
  "follows", "gets", "goes", "grows", "handles", "happens", "helps",
  "identifies", "implements", "improves", "includes", "involves",
  "joins", "keeps", "leads", "leaves", "liaises", "looks", "maintains",
  "makes", "manages", "means", "meets", "monitors", "moves", "needs",
  "offers", "opens", "organises", "organizes", "oversees", "owns",
  "performs", "plays", "prepares", "presents", "processes", "produces",
  "provides", "publishes", "puts", "reads", "relates", "reports",
  "requires", "resolves", "returns", "reviews", "runs", "seeks",
  "sends", "serves", "sets", "shapes", "shows", "speaks", "starts",
  "submits", "supports", "takes", "tells", "tracks", "tries", "turns",
  "uses", "works", "writes",
]);
const ADJ_WORDS = new Set([
  "good", "key", "previous", "similar", "senior", "junior", "main", "core",
  "high", "low", "new", "old", "big", "small", "strong", "clear", "direct",
  "general", "specific", "local", "global", "central", "primary",
  "secondary", "critical", "vital", "top", "best", "better", "full",
  "complete", "comprehensive", "detailed", "first", "last", "next",
  "certain", "various", "several", "different", "important", "major",
  "minor", "special", "particular", "potential", "available", "possible",
  "likely", "free", "open", "short", "long", "large", "little", "great",
  "right", "wrong", "real", "true", "actual", "current", "recent",
  "former", "existing", "online", "remote", "hybrid", "daily", "weekly",
]);
const ADJ_SUFFIXES = [
  "al", "ive", "ic", "ous", "ful", "able", "ible", "ant", "ent", "ary",
  "ory", "ish", "less",
];
// Words the adjective suffixes would misclassify (they are nouns).
const ADJ_EXCEPTIONS = new Set([
  "salary", "history", "story", "factory", "memory", "theory", "category",
  "victory", "directory", "inventory", "library", "summary", "table",
  "cable", "stable", "supply", "family", "apply", "rely", "reply",
]);
const LY_EXCEPTIONS = new Set([
  "supply", "family", "apply", "rely", "reply", "ally", "jelly", "rally",
  "bully", "chilly", "silly", "holy", "ugly", "folly",
]);
const ING_NOUN_EXCEPTIONS = new Set([
  "morning", "evening", "thing", "king", "ring", "spring", "string",
  "ceiling", "wedding",
]);
const ED_EXCEPTIONS = new Set(["speed", "indeed"]);
// Irregular past participles: end in -en, not -ed ("written summaries"
// is verb-led in spaCy, so it is rejected as a keyword).
const IRREGULAR_ED = new Set([
  "written", "driven", "taken", "given", "chosen", "frozen", "proven",
  "shown", "known", "grown", "drawn", "born", "worn", "torn", "broken",
  "spoken", "stolen", "forgotten", "hidden", "bitten", "beaten", "eaten",
  "fallen", "mistaken", "shaken", "undertaken", "withdrawn", "arisen",
  "awoken", "borne", "done", "gone", "seen",
]);
// Words the -ant/-ent adjective suffixes would misclassify: these are
// nouns in job descriptions ("management", "development", "patient").
const MENT_NOUN_EXCEPTIONS = new Set([
  "assistant", "applicant", "consultant", "accountant", "participant",
  "immigrant", "defendant", "attendant", "servant", "merchant", "tenant",
  "claimant", "informant", "occupant", "client", "patient", "student",
  "parent", "agent", "talent", "event", "accident", "incident",
  "president", "resident", "content", "extent", "intent",
]);

function isCapitalized(raw) {
  const m = raw.match(/[A-Za-z]/);
  return !!m && m[0] === m[0].toUpperCase();
}

function isPluralNoun(norm) {
  return (
    norm.length > 3 &&
    norm.endsWith("s") &&
    !norm.endsWith("ss") &&
    !norm.endsWith("us") &&
    !norm.endsWith("is")
  );
}

function classifyToken(tok) {
  const w = tok.norm;
  // A hyphenated fragment with a one-letter side ("e-RS") is a code, not
  // a phrase word; digits stay, so "6-month" still kills its phrase.
  const parts = w.split("-");
  if (parts.length > 1 && parts.some((p) => p.length === 1) && !/\d/.test(w)) {
    return "SKIP";
  }
  if (DET_WORDS.has(w)) return "DET";
  if (PRON_HEAD_WORDS.has(w)) return "PRON_HEAD";
  if (PRON_SUBJ_WORDS.has(w)) return "SUBJ";
  if (PREP_WORDS.has(w)) return "PREP";
  if (AUX_WORDS.has(w)) return "AUX";
  if (REL_WORDS.has(w)) return "REL";
  if (w === "and" || w === "or" || w === "and/or") return "CONJ";
  if (w === "but") return "BUT";
  if (w === "not") return "NOT";
  if (VERB_WORDS.has(w)) return "VERB";
  if (w.length > 4 && w.endsWith("ly") && !LY_EXCEPTIONS.has(w)) return "ADV";
  if (w.length > 4 && w.endsWith("ing") && !ING_NOUN_EXCEPTIONS.has(w)) return "ING";
  if (w.length > 3 && w.endsWith("ed") && !ED_EXCEPTIONS.has(w)) return "ED";
  if (IRREGULAR_ED.has(w)) return "ED";
  if (/\d/.test(w)) return "NUM";
  // "-ment" words are nouns ("management", "development", "environment"),
  // not adjectives — the -ent suffix below would misclassify them.
  if (w.endsWith("ment")) return "NOUN";
  if (MENT_NOUN_EXCEPTIONS.has(w)) return "NOUN";
  if (ADJ_WORDS.has(w)) return "ADJ";
  if (!ADJ_EXCEPTIONS.has(w)) {
    for (const suf of ADJ_SUFFIXES) {
      if (w.length > suf.length + 2 && w.endsWith(suf)) return "ADJ";
    }
  }
  return "NOUN";
}

function splitSegments(text) {
  const segs = [];
  for (const para of text.split(/\n\s*\n/)) {
    let start = 0;
    for (let i = 0; i < para.length; i++) {
      const ch = para[i];
      if (ch === "." || ch === "!" || ch === "?" || ch === ";" || ch === ":") {
        if (ch === "." && /\d/.test(para[i - 1] || "") && /\d/.test(para[i + 1] || "")) {
          continue; // decimal point, e.g. 37.5
        }
        segs.push(para.slice(start, i + 1));
        start = i + 1;
      }
    }
    if (para.slice(start).trim()) segs.push(para.slice(start));
  }
  return segs.filter((s) => s.trim());
}

function tokenizeSegment(seg) {
  const tokens = [];
  const re = /\S+/g;
  let m;
  let lastEnd = 0;
  while ((m = re.exec(seg)) !== null) {
    const raw = m[0];
    const between = seg.slice(lastEnd, m.index);
    const lineStart = tokens.length === 0 || between.includes("\n");
    lastEnd = m.index + raw.length;
    const norm = normalize(raw);
    if (!norm) continue;
    const pieces = norm.split(" ");
    pieces.forEach((piece, pi) => {
      // Sentence punctuation survives normalize() ("." is allowed), so
      // strip trailing dots: "setting." is the word "setting".
      piece = piece.replace(/[.]+$/, "");
      if (!piece) return;
      tokens.push({
        norm: piece,
        lineStart: lineStart && pi === 0,
        segStart: tokens.length === 0,
        upper: isCapitalized(raw),
        commaAfter: raw.endsWith(","),
        paren: raw.startsWith("("),
        kind: null,
      });
    });
  }
  for (const t of tokens) t.kind = classifyToken(t);
  return tokens;
}

// Kinds that can end a noun phrase as its head (or modifier-head).
const HEAD_KINDS = new Set(["NOUN", "NUM", "PRON_HEAD", "ING", "ED"]);
// Kinds that can be a modifier before a head ("data" in "data integrity").
// Modifier kinds allowed after "and"/"or" when merging two sides of one
// noun phrase. Gerunds/participles are excluded: "clinician and
// ascertaining trends" is two phrases, not one.
const CONJ_MODIFIER_KINDS = new Set(["NOUN", "NUM", "ADJ"]);
// A token is noun-like for the gerund rules when it can be the object
// of a verb ("presenting data", "issuing reports").
function nounLikeKind(kind) {
  return HEAD_KINDS.has(kind) || kind === "VERB";
}

function extractChunksFromTokens(tokens) {
  const chunks = [];
  let cur = []; // token objects in the chunk being built
  let verbLed = false;

  function emit() {
    if (cur.length === 0) {
      verbLed = false;
      return;
    }
    // A phrase led by an adverb and ending in a gerund with a noun
    // object ("monthly activity reporting") is a verb phrase, not a
    // noun phrase — spaCy parses "reporting" there as the clause verb.
    if (
      cur.length >= 3 &&
      cur[0].effKind === "ADV" &&
      cur[cur.length - 1].effKind === "ING" &&
      cur.slice(1, -1).some((t) => t.effKind === "NOUN" || t.effKind === "NUM")
    ) {
      cur = [];
      verbLed = false;
      return;
    }
    // Drop trailing modifiers that only make sense before a head.
    while (
      cur.length > 1 &&
      ["ADV", "CONJ", "BUT", "NOT", "DET"].includes(cur[cur.length - 1].effKind)
    ) {
      cur.pop();
    }
    if (cur.some((t) => HEAD_KINDS.has(t.effKind))) {
      const first = cur[0];
      chunks.push({
        phrase: cur.map((t) => t.norm).join(" "),
        firstPos: verbLed
          ? "VERB"
          : first.effKind === "ED"
            ? "ADJ"
            : first.effKind === "PRON_HEAD"
              ? "PRON"
              : first.effKind,
        firstLemma: first.norm,
      });
    }
    cur = [];
    verbLed = false;
  }

  // Tokens on the line just finished, for the heading rule (a short
  // fragment line such as "Key responsibilities" ends a phrase, but a
  // fragment with no head noun, e.g. "Desirable (but not essential)",
  // continues into the next line's head noun).
  let lineTokens = [];

  function headingBoundary(nextTok, fragment) {
    if (fragment.length === 0 || fragment.length > 6) return false;
    if (!nextTok.upper) return false;
    if (fragment.some((t) => ["VERB", "AUX", "PREP", "REL", "SUBJ"].includes(t.kind))) {
      return false;
    }
    return fragment.some((t) => HEAD_KINDS.has(t.kind));
  }

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.lineStart && i > 0) {
      if (headingBoundary(tok, lineTokens)) emit();
      lineTokens = [];
    }
    lineTokens.push(tok);
    // An opening parenthesis starts a new phrase when the current one
    // already has a head ("service data (referrals, ..."), but not when
    // it only holds modifiers ("Desirable (but not essential) ...").
    if (tok.paren && cur.some((t) => HEAD_KINDS.has(t.effKind))) emit();
    const prev = tokens[i - 1] || null;
    const next = tokens[i + 1] || null;
    const nextKind = tok.commaAfter ? "BOUNDARY" : next ? next.kind : "BOUNDARY";
    const afterNextKind =
      !next || next.commaAfter ? "BOUNDARY" : tokens[i + 2] ? tokens[i + 2].kind : "BOUNDARY";

    switch (tok.kind) {
      case "SKIP":
        emit();
        break;

      case "PREP":
      case "AUX":
      case "REL":
      case "SUBJ":
        emit();
        break;

      case "VERB": {
        if (cur.length === 0) {
          if ((tok.segStart || tok.lineStart) && tok.upper) {
            // Capitalised verb at the start of a line/sentence: spaCy
            // usually tags these as nouns ("Track", "Forecast") — but
            // verbs in VERB_LEAD_WORDS it tags as verbs, so those stay
            // boundaries and the following noun phrase stands alone
            // ("Run national data submissions", "Produce clear ...").
            if (next && next.kind === "PREP" && next.norm === "to") {
              break; // "Contribute to ..." — a verb phrase, skip it.
            }
            if (next && next.kind === "NOUN" && isPluralNoun(next.norm)) {
              break; // "Identify trends" — verb + plural object, skip it.
            }
            if (VERB_LEAD_WORDS.has(tok.norm)) {
              break;
            }
            tok.effKind = "NOUN";
            cur.push(tok);
          }
          // Otherwise a verb at the start of a chunk is a boundary.
        } else if (next && next.kind === "PREP") {
          // A verb-form word after a noun and before a preposition is
          // the clause verb ("service leads with ..."), not a noun.
          // After a participle or adjective ("engaging reports for
          // ...") the same word is the head noun, so it stays.
          const prevInChunk = cur[cur.length - 1];
          if (
            prevInChunk &&
            (prevInChunk.kind === "NOUN" || prevInChunk.kind === "NUM")
          ) {
            emit();
          } else {
            tok.effKind = "NOUN";
            cur.push(tok);
          }
        } else {
          // Inside a chunk the same word is a noun ("service leads",
          // "quarterly reports").
          tok.effKind = "NOUN";
          cur.push(tok);
        }
        break;
      }

      case "ING": {
        if (tok.skipAsVerb) break; // marked by the adjective rule below
        if (cur.length === 0) {
          // A gerund coordinated with a plain noun after "or"
          // ("finance or billing teams") is a noun; after "and" it
          // is usually a verb phrase ("... and ascertaining trends").
          if (prev && prev.kind === "CONJ" && prev.norm === "or") {
            const before = tokens[i - 2] || null;
            if (before && ["NOUN", "NUM", "ADJ"].includes(before.kind)) {
              tok.effKind = "NOUN";
              cur.push(tok);
              break;
            }
          }
          if (prev && ["DET", "ADJ", "ADV"].includes(prev.kind)) {
            tok.effKind = "NOUN";
            cur.push(tok);
          } else if (prev && prev.kind === "PREP") {
            // "in managing," is a gerund; "in shaping services" /
            // "on improving access" is a verb taking an object —
            // skip the verb so the object phrase stands alone.
            if (
              next &&
              ["NOUN", "NUM", "DET", "ADJ", "ING", "ED", "PRON_HEAD"].includes(next.kind) &&
              !next.commaAfter
            ) {
              break;
            } else {
              tok.effKind = "NOUN";
              cur.push(tok);
            }
          } else if (nextKind === "PREP" || nextKind === "DET") {
            break; // "seeking a ...", "working for ..." — verb, skip it.
          } else if (next && next.kind === "ING") {
            tok.effKind = "ING";
            verbLed = true;
            cur.push(tok);
          } else if (
            next &&
            nounLikeKind(next.kind) &&
            afterNextKind !== "BOUNDARY" &&
            ["NOUN", "NUM", "ING", "VERB"].includes(afterNextKind)
          ) {
            tok.effKind = "NOUN"; // "waiting list management"
            cur.push(tok);
          } else if (afterNextKind === "CONJ") {
            break; // "ensuring completeness and accuracy" — verb, skip it.
          } else if (next && nounLikeKind(next.kind)) {
            tok.effKind = "ING"; // "waiting times", "issuing reports"
            verbLed = true;
            cur.push(tok);
          } else {
            tok.effKind = "NOUN"; // "forecasting,", "managing,"
            cur.push(tok);
          }
        } else if (next && next.kind === "PREP") {
          // A gerund after a complete noun phrase and before a
          // preposition is a participle heading its own phrase
          // ("previous experience working for ...") — end the noun
          // phrase here, skip the verb. But when the gerund IS the
          // head ("financial reporting by ...") it stays.
          if (cur.some((t) => HEAD_KINDS.has(t.effKind))) {
            emit();
          } else {
            tok.effKind = "NOUN";
            cur.push(tok);
          }
        } else {
          tok.effKind = "NOUN";
          cur.push(tok);
        }
        break;
      }

      case "ED": {
        if (cur.length === 0) {
          if (tok.upper && (tok.segStart || tok.lineStart)) {
            tok.effKind = "ADJ"; // "Experienced analyst" — adjective.
            cur.push(tok);
          } else {
            tok.effKind = "ED"; // "shared care status" — verb-led, rejected.
            verbLed = true;
            cur.push(tok);
          }
        } else if (next && HEAD_KINDS.has(next.kind) && !next.commaAfter) {
          tok.effKind = "ADJ"; // "required staffing levels"
          cur.push(tok);
        } else {
          // Participle after its noun ("data related to ..."): end the
          // chunk here and let the participle start a verb-led chunk.
          emit();
          tok.effKind = "ED";
          verbLed = true;
          cur.push(tok);
        }
        break;
      }

      case "CONJ": {
        if (cur.length === 0) break; // never starts a chunk
        if (verbLed || cur[cur.length - 1].kind === "ING") {
          emit(); // "... reporting and ..." — separate phrases
          break;
        }
        if (cur.length > 1) {
          emit(); // two complete phrases — split, don't merge
          break;
        }
        const first = cur[0];
        if (first.norm.includes("-")) {
          emit(); // "decision-making and service monitoring"
          break;
        }
        if (first.effKind === "NOUN" && isPluralNoun(first.norm)) {
          emit(); // "charts and narrative summaries"
          break;
        }
        // Single-token head so far: merge only when the next two tokens
        // are modifier + head ("ADHD and Autism referrals",
        // "accuracy and data integrity"); otherwise split.
        if (
          next &&
          CONJ_MODIFIER_KINDS.has(next.kind) &&
          afterNextKind !== "BOUNDARY" &&
          HEAD_KINDS.has(afterNextKind)
        ) {
          tok.effKind = "CONJ";
          cur.push(tok);
        } else {
          emit();
        }
        break;
      }

      case "BUT":
      case "NOT":
        if (cur.length === 0) break; // "desirable but not essential ..."
        tok.effKind = tok.kind;
        cur.push(tok);
        break;

      default: {
        // "Comfortable handling sensitive data": an adjective followed
        // by a gerund followed by another adjective is a verb phrase,
        // not a noun phrase — skip both, the object phrase stands alone.
        // ("Good working knowledge" is different: the gerund is
        // followed directly by its head noun, so it stays a modifier.)
        if (
          tok.kind === "ADJ" &&
          cur.length === 0 &&
          next &&
          next.kind === "ING" &&
          tokens[i + 2] &&
          tokens[i + 2].kind === "ADJ"
        ) {
          next.skipAsVerb = true;
          break;
        }
        tok.effKind = tok.kind === "PRON_HEAD" ? "PRON_HEAD" : tok.kind;
        cur.push(tok);
        break;
      }
    }

    if (tok.commaAfter) {
      // A comma between two adjectives ("Supportive, flexible working
      // environment") joins them; any other comma ends the phrase.
      const adjsOnly =
        cur.length > 0 && cur.every((t) => t.effKind === "ADJ");
      const nextIsAdj = next && next.kind === "ADJ";
      if (!(adjsOnly && nextIsAdj)) emit();
    }
  }
  emit();
  return chunks;
}

function extractKeywords(jobText) {
  const cleaned = cleanJobText(jobText);
  const skills = findSkills(jobText);
  const skillSet = new Set([...skills.hard, ...skills.soft]);

  let phrases = new Set();
  for (const seg of splitSegments(cleaned)) {
    for (const chunk of extractChunksFromTokens(tokenizeSegment(seg))) {
      if (keepChunk(chunk, skillSet)) phrases.add(chunk.phrase);
    }
  }
  // Standalone acronyms (KPI, NHS, EMIS): spaCy's entity recogniser
  // contributes these when no noun phrase contains them.
  for (const m of cleaned.matchAll(/\b[A-Z]{2,}\b/g)) {
    phrases.add(normalize(m[0]));
  }

  phrases = new Set(
    [...phrases].map(stripTail).filter((p) => p && keepPhrase(p))
  );
  let keywords = [...new Set([...skillSet, ...phrases])].sort();
  keywords = dropSubsumed(keywords, skillSet);
  return keywords;
}

/* ------------------------------------------------------------------ */
/* scorer.py port                                                      */
/* ------------------------------------------------------------------ */

const WEIGHTS = {
  keywordCoverage: 50,
  skillsMatch: 20,
  experienceEducation: 15,
  formatting: 15,
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE =
  /(\+\d[\d\s().-]{7,}\d|\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|\b07\d{3}[\s-]?\d{6}\b)/;
const LINKEDIN_RE = /linkedin\.com\/\S+/i;
const URL_RE = /https?:\/\/\S+|www\.\S+/i;

const SECTION_PATTERNS = {
  experience: /\b(experience|employment|work history|career)\b/i,
  education: /\b(education|qualifications|degree)\b/i,
  skills: /\b(skills|core skills|technical skills|competencies)\b/i,
  summary: /\b(summary|profile|objective|about)\b/i,
};

const DEGREE_RE =
  /\b(b\.?a\.?|b\.?sc\.?|b\.?eng\.?|b\.?com\.?|m\.?a\.?|m\.?sc\.?|m\.?ba\.?|m\.?eng\.?|ph\.?d\.?|bachelor|master'?s|doctorate|diploma|a-level|gcse|degree)\b/i;
const YEARS_RE = /(\d+)\+?\s*(?:years?|yrs?)\b/gi;
const NUMBER_RE = /\b\d+(?:\.\d+)?\s*(?:%|percent|k|£|\$|€)?\b/g;
const QUANTIFIED_RE =
  /\b(increased|reduced|improved|grew|saved|delivered|achieved|generated|cut|boosted|raised|lowered|managed|led|launched)\b[^.]{0,60}?\d/gi;

function wordCount(text) {
  return (text.match(/\S+/g) || []).length;
}

function pageEstimate(text) {
  return pyRound(wordCount(text) / 500, 1);
}

function splitHits(keywords, resumeNorm) {
  const matched = [];
  const missing = [];
  for (const kw of keywords) {
    if (phraseIn(kw, resumeNorm)) matched.push(kw);
    else missing.push(kw);
  }
  return [matched, missing];
}

function buildFixes(missingKw, missingSk, kwCov, skCov, signals) {
  const fixes = [];
  for (const skill of missingSk.slice(0, 5)) {
    fixes.push(
      `Add the skill '${skill}' with evidence — a bullet showing where ` +
        `you used it and what it achieved, not just a word in a skills list.`
    );
  }
  const otherKw = missingKw
    .filter(
      (k) =>
        !missingSk.includes(k) &&
        !k.startsWith("a ") &&
        !k.startsWith("an ") &&
        !k.startsWith("the ") &&
        !k.startsWith("our ") &&
        k.split(" ").length <= 2
    )
    .slice(0, 5);
  for (const kw of otherKw) {
    fixes.push(
      `Work the phrase '${kw}' into your experience naturally — ` +
        `ATS systems rank resumes on the exact terms in the job description.`
    );
  }
  if (!signals.hasQuantified) {
    fixes.push(
      "Quantify your achievements — add numbers to at least 3 bullets " +
        "(e.g. 'increased sales by 18%', 'cut processing time by 2 days')."
    );
  }
  if (!signals.hasEmail) {
    fixes.push("Add a professional email address to your contact details.");
  }
  if (!signals.hasPhone) {
    fixes.push("Add a phone number to your contact details.");
  }
  if (!signals.hasLinkedinOrUrl) {
    fixes.push("Add your LinkedIn profile URL or a portfolio link.");
  }
  const missingSections = Object.keys(signals.sections).filter(
    (name) => !signals.sections[name]
  );
  if (missingSections.includes("experience")) {
    fixes.push("Add a clear 'Experience' section with job titles, employers and dates.");
  }
  if (missingSections.includes("education")) {
    fixes.push("Add an 'Education' section with your highest qualification.");
  }
  if (missingSections.includes("skills")) {
    fixes.push("Add a 'Skills' section listing the tools and skills from the job description.");
  }
  if (missingSections.includes("summary")) {
    fixes.push(
      "Add a 2–3 line 'Summary' at the top, tailored to this role, " +
        "using the job description's own language."
    );
  }
  if (!signals.lengthOk) {
    if (signals.wordCount < 250) {
      fixes.push(
        `Your resume is very short (${signals.wordCount} words, ` +
          `~1 page or less). Add detail to your experience bullets.`
      );
    } else {
      fixes.push(
        `Your resume is long (${signals.wordCount} words, ` +
          `~${signals.pageEstimate} pages). Trim to 1–2 pages — ` +
          `cut older roles and keep only what matches this job.`
      );
    }
  }
  if (kwCov >= 0.8 && skCov >= 0.8 && fixes.length === 0) {
    fixes.push(
      "Strong match — do a final proofread and tailor the top summary " +
        "to the hiring manager's first requirement."
    );
  }
  return fixes;
}

function scoreResume(resumeText, jobText) {
  if (!jobText.trim()) {
    throw new Error("Job description is empty — paste a job description first.");
  }
  if (!resumeText.trim()) {
    throw new Error("Resume text is empty — the file produced no readable text.");
  }

  const resumeNorm = normalize(resumeText);

  const keywords = extractKeywords(jobText);
  const [matchedKw, missingKw] = splitHits(keywords, resumeNorm);
  const keywordCoverage = keywords.length ? matchedKw.length / keywords.length : 0;

  const jobSkills = findSkills(jobText);
  const allJobSkills = [...new Set([...jobSkills.hard, ...jobSkills.soft])].sort();
  const [matchedSk, missingSk] = splitHits(allJobSkills, resumeNorm);
  const skillsCoverage = allJobSkills.length ? matchedSk.length / allJobSkills.length : 0;

  // --- experience / education signals (15 pts) ---
  const signals = {};
  signals.hasDegree = DEGREE_RE.test(resumeText);
  const years = [...resumeText.matchAll(YEARS_RE)].map((m) => parseInt(m[1], 10));
  signals.yearsExperience = years.length ? Math.max(...years) : 0;
  signals.hasYears = years.length > 0;
  signals.quantifiedCount = (resumeText.match(QUANTIFIED_RE) || []).length;
  signals.hasQuantified = signals.quantifiedCount > 0;
  signals.numberCount = (resumeText.match(NUMBER_RE) || []).length;

  let expPoints = 0;
  if (signals.hasDegree) expPoints += 5;
  if (signals.hasYears) expPoints += 5;
  if (signals.hasQuantified) expPoints += 5;
  else if (signals.numberCount >= 3) expPoints += 2;
  // Display split of the same 15 points (Python scores them as one
  // bucket): education = degree (5), experience = years + quantified.
  const educationPoints = signals.hasDegree ? 5 : 0;
  const experiencePoints = expPoints - educationPoints;

  // --- formatting (15 pts) ---
  signals.hasEmail = EMAIL_RE.test(resumeText);
  signals.hasPhone = PHONE_RE.test(resumeText);
  signals.hasLinkedinOrUrl = LINKEDIN_RE.test(resumeText) || URL_RE.test(resumeText);
  signals.sections = {};
  for (const [name, pat] of Object.entries(SECTION_PATTERNS)) {
    signals.sections[name] = pat.test(resumeText);
  }
  signals.sectionCount = Object.values(signals.sections).filter(Boolean).length;
  const words = wordCount(resumeText);
  signals.wordCount = words;
  const pages = pageEstimate(resumeText);
  signals.pageEstimate = pages;
  signals.lengthOk = words >= 200 && words <= 1200;

  let fmtPoints = 0;
  if (signals.hasEmail) fmtPoints += 4;
  if (signals.hasPhone) fmtPoints += 3;
  if (signals.hasLinkedinOrUrl) fmtPoints += 2;
  if (signals.sectionCount >= 3) fmtPoints += 4;
  else if (signals.sectionCount === 2) fmtPoints += 2;
  if (signals.lengthOk) fmtPoints += 2;

  const breakdown = {
    keywordCoverage: pyRound(keywordCoverage * WEIGHTS.keywordCoverage, 1),
    skillsMatch: pyRound(skillsCoverage * WEIGHTS.skillsMatch, 1),
    experienceEducation: pyRound(expPoints, 1),
    formatting: pyRound(fmtPoints, 1),
  };
  const total =
    breakdown.keywordCoverage +
    breakdown.skillsMatch +
    breakdown.experienceEducation +
    breakdown.formatting;
  const score = Math.max(0, Math.min(100, pyRound(total, 0)));

  const fixes = buildFixes(missingKw, missingSk, keywordCoverage, skillsCoverage, signals);

  return {
    score,
    breakdown,
    experiencePoints,
    educationPoints,
    keywords,
    matchedKeywords: matchedKw,
    missingKeywords: missingKw,
    matchedSkills: matchedSk,
    missingSkills: missingSk,
    fixes,
    signals,
    resumeWords: words,
    resumePages: pages,
  };
}

function verdict(score) {
  if (score >= 80) return "Strong match — ready to submit after a final proofread.";
  if (score >= 60) return "Good match — fix the top items below and it will be competitive.";
  if (score >= 40) return "Partial match — needs targeted tailoring before applying.";
  return "Weak match — the resume is missing most of what this job asks for.";
}

/* ------------------------------------------------------------------ */
/* Sample data (verbatim from sample_data/resume.txt and job.txt)      */
/* ------------------------------------------------------------------ */

const SAMPLE_JOB = "Junior/Intermediate Data Analyst \u2014 UK community healthcare provider (Remote/Hybrid)\n\nA UK community healthcare provider is seeking a Junior/Intermediate Data\nAnalyst to support its growing neurodevelopmental services. This role is\nideal for someone with hands-on experience in managing, interpreting, and\npresenting data related to ADHD and Autism referrals, assessments,\ntreatment outcomes, and waiting list management. The analyst will play a\nkey part in supporting both clinical operations and financial reporting by\nensuring all billable activity is captured accurately and efficiently.\n\nHours: 37.5 hours per week. Location: remote/hybrid after a 6-month\nprobation period, with travel to the head office. Salary: \u00a330,000\u2013\u00a335,000\nper annum, dependent on experience. Reporting to: Head of Finance.\n\nKey responsibilities\n- Compile, clean, and analyse service data (referrals, assessments,\n  treatments, waiting times) across ADHD and Autism pathways.\n- Identify trends, risks, and opportunities to improve operational\n  performance and patient flow.\n- Produce clear, visually engaging reports for internal teams, senior\n  management, and commissioners.\n- Support service leads with demand and capacity modelling, forecasting,\n  and monthly activity reporting, producing reports by contract, region\n  and KPI requirement.\n- Work with the finance team to ensure all activity that can be billed is\n  captured, coded correctly, and submitted in a timely manner.\n- Assist with reporting and contractual data returns, ensuring\n  completeness and accuracy.\n- Contribute to the development of dashboards or tools that support\n  decision-making and service monitoring.\n- Collaborate with clinical and administrative teams to resolve data gaps\n  and discrepancies.\n- Establish a reporting cycle and support quarterly quality reports.\n- Run national data submissions and ensure accuracy and data integrity.\n- Track medication issues and drug trends, preparing issuing reports for\n  each contract and region.\n- Track referrals, assessments, assessment diagnosis conversion rates and\n  titration conversion rates, monitoring the number of interactions by\n  clinician and ascertaining trends and average rates.\n- Forecast annual review delivery and activity by service using monthly\n  referral trends.\n- Establish a telephony reporting regime to support continuous\n  improvement, forecast required staffing levels, and report telephony\n  KPIs daily, weekly and monthly.\n\nEssential skills and experience\n- Previous experience working with ADHD and/or Autism service data (for\n  example referral tracking, titration logs, shared care status).\n- Good working knowledge of Excel, Google Sheets, or similar data tools.\n- Ability to present findings clearly and concisely, including charts and\n  narrative summaries.\n- Understanding of NHS pathways and patient choice processes.\n- Comfortable handling sensitive data with discretion and in line with\n  governance standards.\n\nDesirable (but not essential)\n- Experience working for online psychiatry services, or similar providers.\n- Familiarity with EMIS, e-RS, or other NHS systems.\n- Experience working alongside finance or billing teams in a healthcare\n  setting.\n- Experience creating PowerPoint slides or written summaries for\n  stakeholders.\n\nWhat we offer\n- Supportive, flexible working environment.\n- Opportunities to develop and grow with the role.\n- Direct involvement in shaping services that make a real difference.\n- A mission-driven organisation focused on improving access and outcomes\n  in neurodiversity.\n";
const SAMPLE_RESUME = "Alex Carter\nalex.carter@example.com | 07700 900123 | Leeds, UK | linkedin.com/in/alexcarter\nSummary\nData analyst with 2 years of experience turning retail sales data into clear, actionable reports for\nbuyers and store managers. Skilled in Python, SQL and Excel, with a strong focus on\ncommunication, teamwork and problem solving. Looking for a junior data analyst role where I\ncan grow my dashboard and reporting skills.\nExperience\nJunior Data Analyst \u2014 BrightMart Supermarkets, Leeds | 2023 \u2013 Present\n\u2022 Analyse weekly sales data across 60 stores and produce reports for buyers.\n\u2022 Built dashboards in Power BI to track sales and stock availability, used daily by 12 buyers.\n\u2022 Write SQL queries to extract data from the company data warehouse.\n\u2022 Increased reporting speed by 30% by automating Excel reports with Python.\n\u2022 Cut manual reporting time by 6 hours a week by automating repetitive checks with Python and\npandas.\n\u2022 Cleaned and validated sales data each week, resolving data quality issues with store teams.\n\u2022 Presented findings to store managers and improved promotion planning.\nData Analyst Intern \u2014 City Council Analytics Team, Leeds | 2022 \u2013 2023\n\u2022 Cleaned survey data with Python and pandas for a public transport study.\n\u2022 Produced charts and summaries for council officers.\n\u2022 Managed a survey dataset of 4,000 responses and delivered the final report 2 weeks early.\nEducation\nBSc Mathematics \u2014 University of Leeds, 2019 \u2013 2022\nSkills\nPython, SQL, Excel, Power BI, pandas, data analysis, communication, teamwork, problem\nsolving, time management\n";

/* ------------------------------------------------------------------ */
/* Page wiring (only runs in a browser)                                */
/* ------------------------------------------------------------------ */

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pillList(items, cls) {
  if (!items.length) return "<span class='muted'>(none)</span>";
  return items
    .map((i) => `<span class="pill ${cls || ""}">${escapeHtml(i)}</span>`)
    .join(" ");
}

function renderResult(r) {
  const b = r.breakdown;
  const bar = (pts, max) =>
    `<div class="bar"><div style="width:${Math.max(0, Math.min(100, (pts / max) * 100))}%"></div></div>`;
  const el = document.getElementById("results");
  el.innerHTML = `
    <h2>Match score: ${r.score}<span style="font-size:1.2rem;color:#666">/100</span></h2>
    <div class="score">${r.score}<span style="font-size:1.2rem;color:#666">/100</span></div>
    <div class="bar"><div style="width:${r.score}%"></div></div>
    <p><strong>${escapeHtml(verdict(r.score))}</strong></p>
    <p class="muted">Resume: ${r.resumeWords} words (~${r.resumePages} pages) &middot;
    ${r.signals.yearsExperience ? r.signals.yearsExperience + " years' experience mentioned" : "no years of experience mentioned"} &middot;
    ${r.signals.quantifiedCount} quantified achievement${r.signals.quantifiedCount === 1 ? "" : "s"}</p>
    <h2>Score breakdown</h2>
    <table>
      <tr><th>Area</th><th>Points</th><th>Max</th><th></th></tr>
      <tr><td>Keyword coverage</td><td>${b.keywordCoverage}</td><td>50</td><td>${bar(b.keywordCoverage, 50)}</td></tr>
      <tr><td>Skills match</td><td>${b.skillsMatch}</td><td>20</td><td>${bar(b.skillsMatch, 20)}</td></tr>
      <tr><td>Experience &amp; education</td><td>${b.experienceEducation}</td><td>15</td><td>${bar(b.experienceEducation, 15)}</td></tr>
      <tr><td class="sub">&mdash; Experience (years + quantified results)</td><td>${r.experiencePoints}</td><td>10</td><td>${bar(r.experiencePoints, 10)}</td></tr>
      <tr><td class="sub">&mdash; Education (degree)</td><td>${r.educationPoints}</td><td>5</td><td>${bar(r.educationPoints, 5)}</td></tr>
      <tr><td>Formatting</td><td>${b.formatting}</td><td>15</td><td>${bar(b.formatting, 15)}</td></tr>
      <tr><td><strong>Total</strong></td><td><strong>${r.score}</strong></td><td><strong>100</strong></td><td></td></tr>
    </table>
    <p class="muted">Formatting: email ${r.signals.hasEmail ? "✓" : "✗"} &middot; phone ${r.signals.hasPhone ? "✓" : "✗"} &middot; LinkedIn/URL ${r.signals.hasLinkedinOrUrl ? "✓" : "✗"} &middot; sections ${r.signals.sectionCount}/4 (${Object.keys(r.signals.sections).filter((k) => r.signals.sections[k]).join(", ") || "none"}) &middot; length ${r.signals.lengthOk ? "OK (200–1200 words)" : "outside 200–1200 words"}</p>
    <h2>Matched keywords (${r.matchedKeywords.length}/${r.keywords.length})</h2>
    <p>${pillList(r.matchedKeywords)}</p>
    <details>
      <summary>Missing keywords (${r.missingKeywords.length}) — click to show</summary>
      <p>${pillList(r.missingKeywords, "miss")}</p>
    </details>
    <h2>Matched skills (${r.matchedSkills.length}/${r.matchedSkills.length + r.missingSkills.length})</h2>
    <p>${pillList(r.matchedSkills)}</p>
    <h2>Missing skills (${r.missingSkills.length})</h2>
    <p>${pillList(r.missingSkills, "miss")}</p>
    <h2>Prioritised fixes</h2>
    <ol>${r.fixes.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ol>`;
  el.hidden = false;
}

if (typeof document !== "undefined") {
  document.addEventListener("DOMContentLoaded", () => {
    const resumeEl = document.getElementById("resume");
    const jobEl = document.getElementById("job");
    const errorEl = document.getElementById("error");
    resumeEl.value = SAMPLE_RESUME;
    jobEl.value = SAMPLE_JOB;

    function runScoring() {
      errorEl.textContent = "";
      try {
        renderResult(scoreResume(resumeEl.value, jobEl.value));
      } catch (err) {
        document.getElementById("results").hidden = true;
        errorEl.textContent = err.message;
      }
    }

    document.getElementById("scoreBtn").addEventListener("click", runScoring);
    document.getElementById("sampleBtn").addEventListener("click", () => {
      resumeEl.value = SAMPLE_RESUME;
      jobEl.value = SAMPLE_JOB;
      runScoring();
    });
    const fileInput = document.getElementById("resumeFile");
    if (fileInput) {
      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          resumeEl.value = String(reader.result || "");
        };
        reader.readAsText(file);
      });
    }
    runScoring(); // sample is pre-filled, so show its score immediately
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    normalize,
    phraseIn,
    findSkills,
    cleanJobText,
    keepPhrase,
    extractKeywords,
    scoreResume,
    verdict,
    pyRound,
    SAMPLE_JOB,
    SAMPLE_RESUME,
  };
}
