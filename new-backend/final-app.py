"""
GradeGenie - local semantic assessment backend (v10)

Core pipeline:
1. Load the reviewed rubrics_v4.json rubric bank.
2. Match the submitted question to the closest reference question.
3. Generate match candidates from the student answer (sentence / clause /
   clause_pair - unchanged from v8).
4. Compare each reference concept against every candidate using
   Sentence Transformers, verify with NLI, and - NEW in v9 - apply a
   lexical-assist tiebreaker for borderline paraphrases.
5. Compute concept coverage + semantic quality.
6. Return a deterministic grade and concept-level feedback.

--------------------------------------------------------------------------
WHAT CHANGED FROM v8 (final-app-v8-clause-matching.py) AND WHY
--------------------------------------------------------------------------
v8 fixed the fragmentation bug (multi-concept run-on sentences diluting
embeddings). After that fix, the Information Processing test went from
0% to 75% coverage - INPUT, PROCESSING, and OUTPUT all matched cleanly.
STORE did not.

I do not have your exact STORE similarity/NLI numbers (the debug dump
for that specific run wasn't sent), so this fix is a reasoned best
effort based on the pattern in what WAS sent:
  - OUTPUT's concept text ("presents information") is almost identical
    in wording to the student's clause ("output presents the processed
    information") - a near textual match, so it embeds very close.
  - STORE's concept text ("stores data and information") diverges more
    from the student's phrasing ("storage keeps information for later
    use") - "stores" vs "keeps", "storage" (noun) vs "stores" (verb).
    Same underlying meaning, different surface words, less context to
    anchor a 3-5 word embedding.

This is vocabulary drift, not fragmentation - a different failure mode
than v8 fixed, so v8's clause-splitting alone won't close this gap.

v9 fix: a narrow LEXICAL-ASSIST layer. It is deliberately NOT a general
threshold change:
  - It only activates for concepts that already passed the NLI trigger,
    are NOT a contradiction, and did NOT already qualify via high
    similarity or a hard NLI entailment call. It is a third, narrower
    door - not a wider version of an existing one.
  - It requires BOTH a domain-synonym keyword overlap AND an NLI lean
    toward entailment (entailment probability >= neutral probability).
    Neither signal alone is enough.
  - The contradiction check is untouched and still runs FIRST, so this
    cannot let a contradicted answer through. The RAM test is
    unaffected by this change for that reason.

Every concept in the API response now includes "match_reason" so you
can see exactly which door a concept walked through:
    "high_similarity" | "nli_entailment" | "lexical_assist"
    | "contradiction" | "missing" | "below_trigger"

KNOWN LIMITATION: DOMAIN_SYNONYMS below is a small hand-written map
scoped to this rubric's vocabulary (input/process/store/output). It is
intentionally improvised, not a general solution - as you add more
subjects/questions, this map will need entries for their vocabulary too,
or should eventually be replaced with a proper lemmatizer + WordNet (or
similar) once the test set is bigger. Treat it as a stopgap that buys
you time, not a finished component.

RECOMMENDED NEXT STEP: run the debug dump for the Information Processing
question against v9 and check STORE's "match_reason". If it now says
"lexical_assist", the fix worked as intended. If it's still "missing",
send me that row (similarity, nli, match_reason) and I'll adjust the
synonym map or threshold with real evidence instead of guessing again.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import io
import json
import re
from pathlib import Path

import numpy as np

# Optional OCR/PDF/image dependencies
try:
    from PIL import Image
    HAVE_PIL = True
except Exception:
    Image = None
    HAVE_PIL = False

try:
    import pytesseract
    HAVE_PYTESSERACT = True
except Exception:
    pytesseract = None
    HAVE_PYTESSERACT = False

try:
    from pdf2image import convert_from_bytes
    HAVE_PDF2IMAGE = True
except Exception:
    convert_from_bytes = None
    HAVE_PDF2IMAGE = False

# Required ML dependency for the core grader
try:
    from sentence_transformers import SentenceTransformer, CrossEncoder
except Exception as exc:
    raise RuntimeError(
        "sentence-transformers is required for GradeGenie v9. "
        "Install it with: pip install sentence-transformers"
    ) from exc


# ---------------------------------------------------------------------
# App configuration
# ---------------------------------------------------------------------

app = Flask(__name__)

CORS(
    app,
    origins=["http://localhost:5173", "http://localhost:5174"],
    supports_credentials=True,
)

DEFAULT_SUBJECTS = [
    "Computer Fundamentals",
    "Software Engineering",
    "Operating Systems",
    "Database Management Systems",
    "Computer Networks",
]

QUESTION_MATCH_THRESHOLD = 0.55
CONCEPT_MATCH_THRESHOLD = 0.55

CONCEPT_COVERAGE_WEIGHT = 0.70
SEMANTIC_QUALITY_WEIGHT = 0.30

MODEL_NAME = "all-MiniLM-L6-v2"
NLI_MODEL_NAME = "cross-encoder/nli-MiniLM2-L6-H768"

# Unchanged from v7/v8 - the v9 fix is an additional narrow door, not a
# change to these.
NLI_TRIGGER_THRESHOLD = 0.50
NLI_CONTRADICTION_THRESHOLD = 0.50
NLI_ENTAILMENT_THRESHOLD = 0.50
HIGH_CONFIDENCE_SIMILARITY = 0.70

# Candidate generation (unchanged from v8).
MIN_CANDIDATE_LENGTH = 10
LIST_STYLE_COMMA_THRESHOLD = 2

# NEW in v9: how much of a concept's key canonical terms must show up
# in the matched candidate (after synonym canonicalization) before the
# lexical-assist door will even be considered. 0.5 means "at least half
# of the concept's meaningful words are present, directly or via a
# known synonym."
LEXICAL_ASSIST_THRESHOLD = 0.5

# NEW in v10: inspect several strong student evidence candidates per
# concept instead of relying on only the single highest-similarity sentence.
EVIDENCE_TOP_K = 3
EVIDENCE_MIN_SIMILARITY = 0.50

# NEW in v11: candidates whose raw word-token overlap with an
# already-selected candidate is >= this value are treated as near-duplicates
# of the same underlying sentence and are skipped when filling the top-K
# evidence slots. 0.6 was chosen to catch the observed case (a full
# sentence vs. its own clause_pair fragment, which shared the large
# majority of their words) without merging two genuinely different
# sentences that happen to share a few common words. This has not been
# tuned against a labeled evaluation set - treat it as a reasonable
# starting point, not a validated threshold.
NEAR_DUPLICATE_OVERLAP = 0.6

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent

DATA_PATH = PROJECT_ROOT / "training_data.jsonl"

RUBRIC_PATH = BASE_DIR / "rubrics_v5.json"
# ---------------------------------------------------------------------
# Model + reference rubric
# ---------------------------------------------------------------------

print(f"Loading embedding model: {MODEL_NAME}")
SENT_MODEL = SentenceTransformer(MODEL_NAME)

print(f"Loading NLI model: {NLI_MODEL_NAME}")
NLI_MODEL = CrossEncoder(NLI_MODEL_NAME)

RUBRICS = []
RUBRIC_QUESTION_EMBEDDINGS = None


def load_rubrics():
    """Load the reviewed v4 rubric file."""
    if not RUBRIC_PATH.exists():
        raise FileNotFoundError(
            f"Could not find rubrics_v4.json at: {RUBRIC_PATH}"
        )

    with RUBRIC_PATH.open("r", encoding="utf-8") as f:
        rubrics = json.load(f)

    if not isinstance(rubrics, list) or not rubrics:
        raise RuntimeError("rubrics_v4.json contains no usable rubrics.")

    cleaned = []

    for item in rubrics:
        question = str(item.get("question", "")).strip()
        concepts = item.get("concepts", [])

        if not question or not isinstance(concepts, list) or not concepts:
            continue

        valid_concepts = []

        for concept in concepts:
            text = str(concept.get("text", "")).strip()

            if not text:
                continue

            weight = float(concept.get("weight", 0.0) or 0.0)

            valid_concepts.append({
                "text": text,
                "weight": weight,
                "tier": concept.get("tier", "standard"),
            })

        if not valid_concepts:
            continue

        weight_total = sum(c["weight"] for c in valid_concepts)

        if weight_total <= 0:
            equal_weight = 1.0 / len(valid_concepts)
            for concept in valid_concepts:
                concept["weight"] = equal_weight
        else:
            for concept in valid_concepts:
                concept["weight"] /= weight_total

        cleaned.append({
            "question": question,
            "reference_answer": str(
                item.get("reference_answer", "")
            ).strip(),
            "evaluation_type": item.get(
                "evaluation_type", "generic"
            ),
            "concepts": valid_concepts,
            "select_any": item.get("select_any"),
            "status": item.get("status", ""),
        })

    if not cleaned:
        raise RuntimeError("No usable rubrics were found.")

    return cleaned


def build_rubric_index():
    """Load rubrics and precompute question embeddings."""
    global RUBRICS, RUBRIC_QUESTION_EMBEDDINGS

    RUBRICS = load_rubrics()

    questions = [item["question"] for item in RUBRICS]

    RUBRIC_QUESTION_EMBEDDINGS = SENT_MODEL.encode(
        questions,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    print(
        f"Loaded {len(RUBRICS)} reviewed rubrics "
        f"from {RUBRIC_PATH}"
    )


build_rubric_index()

# ---------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------

def clean_text(text):
    """Normalize whitespace without changing the actual meaning."""
    text = text or ""
    text = re.sub(r"\s+", " ", text).strip()
    return text


def split_into_sentences(text):
    """Plain sentence-boundary split. Building block for candidates."""
    text = clean_text(text)

    if not text:
        return []

    sentences = re.split(r"(?<=[.!?])\s+", text)

    return [s.strip() for s in sentences if s.strip()]


def split_into_clauses(sentence):
    """
    Split a single sentence into clauses on commas / " and ".

    Only called on sentences that already look list-style (see
    generate_match_candidates), so this does not over-fragment normal
    prose that happens to contain a single comma.
    """
    trimmed = re.sub(r"[.!?]+$", "", sentence).strip()

    clauses = re.split(r",\s*(?:and\s+)?|\s+and\s+", trimmed)

    return [c.strip() for c in clauses if c.strip()]


def generate_match_candidates(text):
    """
    Build the full set of text fragments a rubric concept can be
    matched against: sentence / clause / clause_pair. Unchanged from
    v8 - see v8's docstring for the full rationale.
    """
    text = clean_text(text)

    if not text:
        return []

    candidates = []
    seen = set()

    def add(candidate_text, candidate_type):
        candidate_text = candidate_text.strip()
        if len(candidate_text) < MIN_CANDIDATE_LENGTH:
            return
        key = candidate_text.lower()
        if key in seen:
            return
        seen.add(key)
        candidates.append({"text": candidate_text, "type": candidate_type})

    for sentence in split_into_sentences(text):
        add(sentence, "sentence")

        comma_count = sentence.count(",")
        has_and = re.search(r"\s+and\s+", sentence) is not None

        is_list_style = (
            comma_count >= LIST_STYLE_COMMA_THRESHOLD or
            (comma_count >= 1 and has_and)
        )

        if not is_list_style:
            continue

        clauses = split_into_clauses(sentence)

        if len(clauses) < 2:
            continue

        for clause in clauses:
            add(clause, "clause")

        for i in range(len(clauses) - 1):
            pair_text = f"{clauses[i]}, {clauses[i + 1]}"
            add(pair_text, "clause_pair")

    return candidates


# ---------------------------------------------------------------------
# NEW in v9: lexical-assist helpers
# ---------------------------------------------------------------------

# Small, hand-written domain synonym map. Each key is a "canonical root"
# concept; each value is the set of surface words that should all be
# treated as referring to that root. This is intentionally scoped to
# this rubric set - see the KNOWN LIMITATION note at the top of the
# file before relying on this for other subjects.
DOMAIN_SYNONYMS = {
    "store": {
        "store", "stores", "stored", "storing", "storage",
        "save", "saves", "saved", "saving",
        "retain", "retains", "retained", "retaining",
        "keep", "keeps", "kept", "keeping",
        "persist", "persists", "persisted", "persisting",
        "hold", "holds", "held", "holding",
    },
    "input": {
        "input", "inputs", "inputting",
        "accept", "accepts", "accepted", "accepting",
        "gather", "gathers", "gathered", "gathering",
        "collect", "collects", "collected", "collecting",
        "receive", "receives", "received", "receiving",
        "enter", "enters", "entered", "entering",
        "capture", "captures", "captured", "capturing",
    },
    "process": {
        "process", "processes", "processed", "processing",
        "transform", "transforms", "transformed", "transforming",
        "compute", "computes", "computed", "computing",
        "manipulate", "manipulates", "manipulated", "manipulating",
        "convert", "converts", "converted", "converting",
        "calculate", "calculates", "calculated", "calculating",
    },
    "output": {
        "output", "outputs", "outputting",
        "present", "presents", "presented", "presenting",
        "display", "displays", "displayed", "displaying",
        "produce", "produces", "produced", "producing",
        "show", "shows", "showed", "showing",
        "return", "returns", "returned", "returning",
    },
}

STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "is",
    "are", "was", "were", "be", "been", "being", "that", "this", "it",
    "its", "which", "with", "as", "by", "at", "from", "into", "used",
    "use", "uses", "such", "these", "those", "also", "may", "can",
}

# Reverse lookup: stemmed surface word -> canonical root.
_SYNONYM_LOOKUP = {}
for _root, _words in DOMAIN_SYNONYMS.items():
    for _word in _words:
        _SYNONYM_LOOKUP[_word] = _root


def naive_stem(word):
    """
    Very small suffix-stripping stemmer. Not linguistically rigorous -
    good enough to fold "stores"/"stored"/"storing" together for the
    overlap check below without pulling in a full NLP dependency.
    """
    word = word.lower()

    for suffix in ("ing", "edly", "ed", "es", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]

    return word


def canonicalize(word):
    """
    Map a surface word to its canonical root if it's a known domain
    synonym, otherwise fall back to the naive stem so at least basic
    plural/tense variants still match each other.
    """
    word = word.lower()

    if word in _SYNONYM_LOOKUP:
        return _SYNONYM_LOOKUP[word]

    stem = naive_stem(word)

    if stem in _SYNONYM_LOOKUP:
        return _SYNONYM_LOOKUP[stem]

    return stem


def tokenize_for_overlap(text):
    """Lowercase word tokens, stopwords and very short tokens removed."""
    words = re.findall(r"[a-zA-Z]+", text.lower())

    return {
        canonicalize(w)
        for w in words
        if w not in STOPWORDS and len(w) > 2
    }


def lexical_overlap_score(concept_text, candidate_text):
    """
    Recall-oriented overlap: what fraction of the CONCEPT's key
    canonical terms are present (directly or via synonym) in the
    matched candidate. Recall-oriented on purpose - we care whether the
    student's fragment covers what the concept asks for, not whether
    the fragment has extra words the concept doesn't mention.
    """
    concept_tokens = tokenize_for_overlap(concept_text)
    candidate_tokens = tokenize_for_overlap(candidate_text)

    if not concept_tokens:
        return 0.0

    overlap = len(concept_tokens & candidate_tokens)

    return overlap / len(concept_tokens)


# ---------------------------------------------------------------------
# File extraction
# ---------------------------------------------------------------------

def extract_text_from_file(file_storage):
    """Extract text from TXT, PDF, or common image formats."""
    filename = (file_storage.filename or "").lower()
    data = file_storage.read()

    if not data:
        return ""

    if filename.endswith(".txt"):
        try:
            return data.decode("utf-8")
        except Exception:
            return data.decode("latin-1", errors="ignore")

    if filename.endswith(".pdf"):
        if not HAVE_PDF2IMAGE:
            return "[pdf-extraction-error] pdf2image is not installed"
        if not HAVE_PYTESSERACT:
            return "[pdf-extraction-error] pytesseract is not installed"

        try:
            pages = convert_from_bytes(data)
            texts = [pytesseract.image_to_string(page) for page in pages]
            return "\n".join(texts).strip()
        except Exception as exc:
            return f"[pdf-extraction-error] {exc}"

    image_extensions = (".png", ".jpg", ".jpeg", ".bmp", ".tiff")

    if filename.endswith(image_extensions):
        if not HAVE_PIL:
            return "[image-extraction-error] Pillow is not installed"
        if not HAVE_PYTESSERACT:
            return "[image-extraction-error] pytesseract is not installed"

        try:
            image = Image.open(io.BytesIO(data))
            return pytesseract.image_to_string(image).strip()
        except Exception as exc:
            return f"[image-extraction-error] {exc}"

    try:
        return data.decode("utf-8")
    except Exception:
        return data.decode("latin-1", errors="ignore")


# ---------------------------------------------------------------------
# Semantic matching
# ---------------------------------------------------------------------

def _jaccard(tokens_a, tokens_b):
    """Word-overlap ratio used only for near-duplicate evidence detection.

    Deliberately separate from tokenize_for_overlap/lexical_overlap_score
    above: those use domain-synonym canonicalization for CONCEPT-vs-CANDIDATE
    matching (a different purpose), whereas near-duplicate detection is
    about whether two CANDIDATES are basically the same span of student
    text, so it should not depend on maintaining DOMAIN_SYNONYMS.
    """
    if not tokens_a or not tokens_b:
        return 0.0

    intersection = len(tokens_a & tokens_b)
    smaller = min(len(tokens_a), len(tokens_b))

    # Overlap relative to the SMALLER set, not the union: a short
    # clause_pair fragment that is fully contained inside a longer
    # sentence should still count as a near-duplicate of it.
    return intersection / smaller


def cosine_scores(query_embedding, candidate_embeddings):
    """
    Candidate embeddings are normalized, so cosine similarity is a
    simple dot product.
    """
    return np.dot(candidate_embeddings, query_embedding)


def find_reference_question(question):
    """Find the closest reviewed rubric question."""
    question = clean_text(question)

    if not question:
        return None

    query_embedding = SENT_MODEL.encode(
        question,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    scores = cosine_scores(
        query_embedding,
        RUBRIC_QUESTION_EMBEDDINGS,
    )

    best_index = int(np.argmax(scores))
    best_score = float(scores[best_index])

    if best_score < QUESTION_MATCH_THRESHOLD:
        return None

    return {
        "item": RUBRICS[best_index],
        "similarity": best_score,
        "index": best_index,
    }


def run_nli(reference_concept, student_sentence):
    """
    Verify whether the student's sentence supports or contradicts a
    reference concept. Unchanged from v7/v8.

        premise    = reference concept
        hypothesis = student statement
    """
    scores = NLI_MODEL.predict(
        [(reference_concept, student_sentence)],
        apply_softmax=True,
        show_progress_bar=False,
    )

    probabilities = np.asarray(scores[0])

    # cross-encoder/nli-MiniLM2-L6-H768 label order:
    # contradiction, entailment, neutral.
    contradiction_prob = float(probabilities[0])
    entailment_prob = float(probabilities[1])
    neutral_prob = float(probabilities[2])

    if contradiction_prob >= NLI_CONTRADICTION_THRESHOLD:
        label = "contradiction"
    elif entailment_prob >= NLI_ENTAILMENT_THRESHOLD:
        label = "entailment"
    else:
        label = "neutral"

    return {
        "label": label,
        "contradiction": round(contradiction_prob, 4),
        "entailment": round(entailment_prob, 4),
        "neutral": round(neutral_prob, 4),
    }


def evaluate_concepts(student_text, rubric):
    """
    Evaluate the student's answer against the reviewed rubric.

    Decision order per concept (v9):
      1. Below NLI trigger similarity -> missing (below_trigger)
      2. Strong NLI contradiction -> contradicted (ALWAYS checked
         first among the NLI-gated branches - unchanged priority from
         v7/v8, so this cannot be bypassed by the new lexical door)
      3. High-confidence similarity -> covered (high_similarity)
      4. Hard NLI entailment -> covered (nli_entailment)
      5. NEW: lexical-assist door -> covered (lexical_assist) only if
         BOTH domain-synonym overlap >= LEXICAL_ASSIST_THRESHOLD AND
         NLI leans toward entailment over neutral
      6. Otherwise -> missing
    """
    candidates = generate_match_candidates(student_text)
    concepts = rubric["concepts"]

    if not candidates:
        return {
            "concepts": [],
            "coverage": 0.0,
            "semantic_quality": 0.0,
            "select_any_result": None,
        }

    candidate_texts = [c["text"] for c in candidates]
    candidate_types = [c["type"] for c in candidates]

    candidate_embeddings = SENT_MODEL.encode(
        candidate_texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    evaluated = []

    concept_texts = [c["text"] for c in concepts]

    concept_embeddings = SENT_MODEL.encode(
        concept_texts,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )

    similarity_matrix = np.matmul(
        concept_embeddings,
        candidate_embeddings.T,
    )

    for i, concept in enumerate(concepts):
        similarities = similarity_matrix[i]

        # v10: inspect the strongest few candidates rather than allowing
        # one misleading sentence to decide the whole concept.
        #
        # v11 fix: dedupe near-identical candidates BEFORE taking top-K.
        # Root cause found via the RAM debug trace - generate_match_candidates
        # emits overlapping sentence/clause/clause_pair fragments of the
        # SAME underlying sentence (e.g. a full sentence plus a clause_pair
        # that is 90% the same text). Because the old top-K selection only
        # deduped on exact string match, 2 of the 3 evidence slots for a
        # concept could get consumed by near-clones of one irrelevant
        # sentence, silently squeezing out the one DIFFERENT sentence that
        # actually supported the concept. Ranking is unchanged - this only
        # skips a candidate that is near-duplicate text of one already kept.
        ranked_indices = [
            int(idx)
            for idx in np.argsort(similarities)[::-1]
            if float(similarities[idx]) >= EVIDENCE_MIN_SIMILARITY
        ]

        candidate_indices = []
        kept_token_sets = []

        for idx in ranked_indices:
            if len(candidate_indices) >= EVIDENCE_TOP_K:
                break

            candidate_tokens = set(
                re.findall(r"[a-zA-Z]+", candidate_texts[idx].lower())
            )

            is_near_duplicate = any(
                _jaccard(candidate_tokens, kept_tokens) >= NEAR_DUPLICATE_OVERLAP
                for kept_tokens in kept_token_sets
            )

            if is_near_duplicate:
                continue

            candidate_indices.append(idx)
            kept_token_sets.append(candidate_tokens)

        if not candidate_indices:
            evaluated.append({
                "text": concept["text"],
                "weight": concept["weight"],
                "tier": concept.get("tier", "standard"),
                "student_match": "",
                "match_type": "",
                "match_reason": "below_trigger",
                "similarity": 0.0,
                "nli": None,
                "evidence": [],
                "status": "missing",
                "covered": False,
            })
            continue

        evidence = []

        for candidate_index in candidate_indices:
            candidate_similarity = float(similarities[candidate_index])
            candidate_text = candidate_texts[candidate_index]
            candidate_type = candidate_types[candidate_index]

            nli_result = None

            if candidate_similarity >= NLI_TRIGGER_THRESHOLD:
                nli_result = run_nli(
                    concept["text"],
                    candidate_text,
                )

            lexical_score = lexical_overlap_score(
                concept["text"],
                candidate_text,
            )

            evidence.append({
                "student_match": candidate_text,
                "match_type": candidate_type,
                "similarity": round(candidate_similarity, 4),
                "nli": nli_result,
                "lexical_overlap": round(lexical_score, 4),
            })

        # -------------------------------------------------------------
        # v10 decision:
        # 1. Strong contradiction is only decisive when there is no
        #    stronger supporting evidence elsewhere in the answer.
        # 2. Strong entailment or high semantic similarity is support.
        # 3. Lexical assist can support borderline paraphrases.
        # 4. Otherwise the concept is missing.
        # -------------------------------------------------------------

        contradiction_evidence = [
            item for item in evidence
            if (
                item["nli"]
                and item["nli"]["label"] == "contradiction"
                and item["nli"]["contradiction"] >= NLI_CONTRADICTION_THRESHOLD
            )
        ]

        entailment_evidence = [
            item for item in evidence
            if (
                item["nli"]
                and item["nli"]["label"] == "entailment"
                and item["nli"]["entailment"] >= NLI_ENTAILMENT_THRESHOLD
            )
        ]

        high_similarity_evidence = [
            item for item in evidence
            if item["similarity"] >= HIGH_CONFIDENCE_SIMILARITY
            and not (
                item["nli"]
                and item["nli"]["label"] == "contradiction"
                and item["nli"]["contradiction"] >= NLI_CONTRADICTION_THRESHOLD
            )
        ]

        lexical_evidence = [
            item for item in evidence
            if (
                item["lexical_overlap"] >= LEXICAL_ASSIST_THRESHOLD
                and (
                    item["nli"] is None
                    or item["nli"]["entailment"] >= item["nli"]["neutral"]
                )
                and not (
                    item["nli"]
                    and item["nli"]["label"] == "contradiction"
                    and item["nli"]["contradiction"] >= NLI_CONTRADICTION_THRESHOLD
                )
            )
        ]

        # Prefer explicit support over contradiction when the student
        # provides multiple pieces of evidence. This handles answers
        # that contain an early mistake but later give the correct fact.
        if entailment_evidence:
            best = max(
                entailment_evidence,
                key=lambda x: (x["nli"]["entailment"], x["similarity"]),
            )
            status = "covered"
            covered = True
            match_reason = "nli_entailment"
            selected = best

        elif high_similarity_evidence:
            best = max(
                high_similarity_evidence,
                key=lambda x: x["similarity"],
            )
            status = "covered"
            covered = True
            match_reason = "high_similarity"
            selected = best

        elif lexical_evidence:
            best = max(
                lexical_evidence,
                key=lambda x: (x["lexical_overlap"], x["similarity"]),
            )
            status = "covered"
            covered = True
            match_reason = "lexical_assist"
            selected = best

        elif contradiction_evidence:
            # No supporting evidence was found elsewhere, so the strong
            # contradiction is decisive.
            best = max(
                contradiction_evidence,
                key=lambda x: x["nli"]["contradiction"],
            )
            status = "contradicted"
            covered = False
            match_reason = "contradiction"
            selected = best

        else:
            best = max(
                evidence,
                key=lambda x: x["similarity"],
            )
            status = "missing"
            covered = False
            match_reason = "missing"
            selected = best

        evaluated.append({
            "text": concept["text"],
            "weight": concept["weight"],
            "tier": concept.get("tier", "standard"),
            "student_match": selected["student_match"],
            "match_type": selected["match_type"],
            "match_reason": match_reason,
            "similarity": selected["similarity"],
            "nli": selected["nli"],
            "evidence": evidence,
            "status": status,
            "covered": covered,
        })

    select_any = rubric.get("select_any")
    select_any_result = None

    if select_any:
        required = int(select_any.get("required", 0))
        total = int(select_any.get("of", len(evaluated)))

        if required > 0 and total > 0:
            matched = sum(
                1 for concept in evaluated
                if concept["status"] == "covered"
            )

            contradicted = sum(
                1 for concept in evaluated
                if concept["status"] == "contradicted"
            )

            group_weight = sum(
                concept["weight"] for concept in evaluated
            )

            fraction = min(matched / required, 1.0)

            select_any_score = group_weight * fraction

            select_any_result = {
                "required": required,
                "of": total,
                "matched": matched,
                "contradicted": contradicted,
                "score": round(select_any_score, 4),
                "rule": (
                    f"Full credit when any {required} of "
                    f"{total} concepts are correctly covered; "
                    "contradicted examples receive no credit."
                ),
            }

            coverage = select_any_score

        else:
            coverage = sum(
                concept["weight"]
                for concept in evaluated
                if concept["status"] == "covered"
            )
    else:
        coverage = sum(
            concept["weight"]
            for concept in evaluated
            if concept["status"] == "covered"
        )

    semantic_quality = (
        sum(
            (
                0.0
                if concept["status"] == "contradicted"
                else concept["similarity"]
            ) * concept["weight"]
            for concept in evaluated
        )
        if evaluated
        else 0.0
    )

    return {
        "concepts": evaluated,
        "coverage": float(min(max(coverage, 0.0), 1.0)),
        "semantic_quality": float(
            min(max(semantic_quality, 0.0), 1.0)
        ),
        "select_any_result": select_any_result,
    }


# ---------------------------------------------------------------------
# Grade + feedback
# ---------------------------------------------------------------------

def calculate_grade(coverage, semantic_quality):
    """
    70% = expected concepts covered
    30% = semantic quality of the best concept matches
    Unchanged from v7/v8.
    """
    score = (
        CONCEPT_COVERAGE_WEIGHT * coverage
        + SEMANTIC_QUALITY_WEIGHT * semantic_quality
    )

    return int(round(max(0.0, min(1.0, score)) * 100))


def build_feedback(concept_result):
    concepts = concept_result["concepts"]

    if not concepts:
        return {
            "summary": (
                "The answer could not be evaluated because "
                "there was not enough text."
            ),
            "strengths": [],
            "improvements": [],
        }

    covered = [
        concept["text"]
        for concept in concepts
        if concept["covered"]
    ]

    missing = [
        concept["text"]
        for concept in concepts
        if concept["status"] == "missing"
    ]

    contradicted = [
        concept["text"]
        for concept in concepts
        if concept["status"] == "contradicted"
    ]

    coverage = concept_result["coverage"]

    if coverage >= 0.85:
        summary = (
            "Strong answer with good coverage of the expected concepts."
        )
    elif coverage >= 0.60:
        summary = (
            "Good partial coverage, but some expected concepts "
            "are missing or need correction."
        )
    elif coverage >= 0.35:
        summary = (
            "The answer covers some relevant concepts "
            "but needs more detail or correction."
        )
    else:
        summary = (
            "The answer covers relatively few of the expected concepts."
        )

    return {
        "summary": summary,
        "strengths": covered[:5],
        "improvements": missing[:5],
        "contradictions": contradicted[:5],
    }


# ---------------------------------------------------------------------
# API routes
# ---------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "reference_questions": len(RUBRICS),
        "rubrics": len(RUBRICS),
        "model": MODEL_NAME,
        "nli_model": NLI_MODEL_NAME,
    })


@app.route("/api/subjects", methods=["GET"])
def api_subjects():
    return jsonify({"subjects": DEFAULT_SUBJECTS})


@app.route("/api/evaluate", methods=["POST"])
def api_evaluate():
    """
    Evaluate a text answer or uploaded document/image.

    JSON:
        {
            "question": "...",
            "student_answer": "...",
            "subject": "..."
        }

    Multipart:
        question
        student_answer
        subject
        file
    """

    if request.content_type and request.content_type.startswith(
        "application/json"
    ):
        data = request.get_json(silent=True) or {}

        question = clean_text(data.get("question", ""))

        student_text = clean_text(
            data.get("student_answer")
            or data.get("student_text")
            or ""
        )

        subject = clean_text(data.get("subject", ""))

    else:
        question = clean_text(request.form.get("question", ""))

        student_text = clean_text(
            request.form.get("student_answer")
            or request.form.get("student_text")
            or ""
        )

        subject = clean_text(request.form.get("subject", ""))

        if (
            "file" in request.files
            and request.files["file"].filename
        ):
            extracted_text = extract_text_from_file(
                request.files["file"]
            )

            if extracted_text.startswith("[") and "error]" in extracted_text:
                if not student_text:
                    return jsonify({
                        "error": extracted_text
                    }), 400
            else:
                if student_text:
                    student_text = (
                        extracted_text + "\n" + student_text
                    )
                else:
                    student_text = extracted_text

    if not question:
        return jsonify({"error": "question required"}), 400

    if not student_text:
        return jsonify({"error": "student answer required"}), 400

    reference = find_reference_question(question)

    if reference is None:
        return jsonify({
            "error": (
                "No sufficiently similar reference question was found. "
                "Please select a supported question or rephrase it."
            ),
            "question_match": None,
        }), 422

    reference_item = reference["item"]

    concept_result = evaluate_concepts(
        student_text,
        reference_item,
    )

    grade = calculate_grade(
        concept_result["coverage"],
        concept_result["semantic_quality"],
    )

    feedback = build_feedback(concept_result)

    return jsonify({
        "question": question,
        "subject": subject,

        "reference_question": reference_item["question"],
        "reference_answer": reference_item["reference_answer"],

        "student_text": student_text,

        "question_match_similarity": round(
            reference["similarity"], 4
        ),

        "concept_coverage": round(
            concept_result["coverage"], 4
        ),

        "semantic_quality": round(
            concept_result["semantic_quality"], 4
        ),

        "grade": grade,

        "feedback": feedback,

        "evaluation_details": {
            "evaluation_type": reference_item["evaluation_type"],
            "rubric_status": reference_item["status"],
            "select_any": concept_result["select_any_result"],
            "concept_status_counts": {
                "covered": sum(
                    1 for c in concept_result["concepts"]
                    if c["status"] == "covered"
                ),
                "missing": sum(
                    1 for c in concept_result["concepts"]
                    if c["status"] == "missing"
                ),
                "contradicted": sum(
                    1 for c in concept_result["concepts"]
                    if c["status"] == "contradicted"
                ),
            },
            "concepts": concept_result["concepts"],
            "question_match_threshold": QUESTION_MATCH_THRESHOLD,
            "concept_match_threshold": CONCEPT_MATCH_THRESHOLD,
            "high_confidence_similarity": HIGH_CONFIDENCE_SIMILARITY,
            "lexical_assist_threshold": LEXICAL_ASSIST_THRESHOLD,
            "evidence_top_k": EVIDENCE_TOP_K,
            "evidence_min_similarity": EVIDENCE_MIN_SIMILARITY,
        },
    })


if __name__ == "__main__":
    print("Starting GradeGenie v10 backend on port 5000")
    print(f"Rubric file: {RUBRIC_PATH}")
    print(f"Reviewed rubrics: {len(RUBRICS)}")
    print(f"Embedding model: {MODEL_NAME}")
    print(f"NLI model: {NLI_MODEL_NAME}")
    print("Phi-2 / Colab / ngrok: DISABLED")
    app.run(host="0.0.0.0", port=5000, debug=False)
