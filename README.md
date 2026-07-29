# VEIL

**An AI-scored debate platform where your arguments have a permanent track record.**

Most places you argue online, what you said evaporates. VEIL stores every claim you
advance in a debate, lets anyone challenge it in any later debate, and tracks how well
it held up. Over time that becomes an *argument reputation* — a record of what you have
claimed and what survived scrutiny.

---

## The core idea

```
You make a claim in a debate
        ↓
It is extracted, embedded, and stored in the claim graph — attributed to you
        ↓
Weeks later, someone argues against it in a different debate
        ↓
That rebuttal is matched to your claim semantically, and judged for effectiveness
        ↓
Your claim's resilience score moves — and so does your track record
```

A claim nobody has ever challenged says nothing about you. A claim that has survived
forty challenges says a great deal. The scoring weights attempt count as *confidence*,
not as a penalty.

---

## Quick start

**Requirements:** Node 20+, MongoDB Atlas (vector search is Atlas-only), a
[Groq](https://console.groq.com) API key, a [HuggingFace](https://huggingface.co/settings/tokens)
token. Redis is optional.

```bash
# Backend
cd backend
npm install
cp .env.example .env          # then fill in the values below
node scripts/createVectorIndexes.js   # one-time: Atlas vector indexes
npm run dev                            # :5001

# Frontend
cd frontend
npm install
npm start                              # :3000
```

### Environment

| Variable | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | yes | Atlas connection string (vector search needs Atlas, not local Mongo) |
| `JWT_SECRET` / `JWT_EXPIRE` | yes | Auth token signing |
| `GROK_API_KEY` | yes | Groq — `llama-3.1-8b-instant` and `llama-3.3-70b-versatile` |
| `HUGGINGFACE_API_KEY` | yes | `all-MiniLM-L6-v2` embeddings (384-d) |
| `FRONTEND_URL` | prod | Extra CORS origins, comma-separated |
| `REDIS_HOST` / `REDIS_PORT` | no | Caching and cross-instance rate limits; degrades gracefully |
| `PERSPECTIVE_API_KEY` | no | Toxicity scoring; falls back to LLM then keywords |
| `ALLOW_PLATFORM_WIDE_SLICKS` | no | `true` allows anonymous feedback outside shared communities |

### Verify the install

```bash
npm test     # 49 unit tests, no network required
npm run smoke  # 18 integration checks against your database + live models
```

---

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  React 19 · Zustand · Tailwind · Socket.io-client             │
└───────────────────────────┬───────────────────────────────────┘
                            │  REST + WebSocket
┌───────────────────────────▼───────────────────────────────────┐
│  Express                                                       │
│  rateLimit → cors → validate → controller → asyncHandler       │
│                                    │                           │
│                                    ▼                           │
│  services/            ← business logic, no HTTP concerns       │
│  services/graph/      ← 9 multi-node AI pipelines              │
└───────────────────────────┬───────────────────────────────────┘
                            │
     ┌──────────────────────┼──────────────────────┐
     ▼                      ▼                      ▼
 MongoDB Atlas          Groq LLM            HuggingFace
 (+ vector search)   (fast / smart)      (embeddings, cached)
```

### The graph layer

The distinctive part. Nine pipelines under `services/graph/`, each a class whose
`_node_*` methods thread a mutable `state` object and append to a `decisionTrace`,
so every score can be explained back to the user.

| Graph | Does |
|---|---|
| `debateTurnGraph` | 13 nodes: context → persona → RAG → fallacies → claims → rebuttals → rubric → quality |
| `fallacyGraph` | Regex pre-filter → LLM reasoning → quote-grounding |
| `feedRankingGraph` | 8 nodes producing a personalised, explainable feed |
| `performanceGraph` | Longitudinal skill profile, blind spots, peer percentiles |
| `perceptionGraph` | How others perceive you, from anonymous feedback |
| `communityHealthGraph` | Toxicity trend, participation imbalance, escalation |
| `communityMemoryGraph` | Onboarding summaries, recurring themes |
| `threadEvolutionGraph` | Sentiment arc, topic drift, turning points |
| `achievementInsightGraph` | Weekly highlights, skill milestones |

### Retrieval

Three tiers, each degrading to the next:

```
vector search (Atlas $vectorSearch)
    → BM25 rerank (natural, in-process — Atlas Search needs M10+)
        → LLM rerank
```

Query embeddings are cached by content hash (`cachedEmbeddings.js`), so repeated
retrieval costs no network round-trip.

---

## How a turn is scored

Four dimensions, graded by model with heuristic fallbacks:

| Dimension | Weight | Measures |
|---|---|---|
| **Substance** | 40% | Does it argue, or merely assert? |
| **Evidence** | 18% | Real support. Saying "studies show" without a finding scores *low* |
| **Clarity** | 15% | Can a reader follow it? Not sentence length or transition words |
| **Tone** | 12% | Civil *and* constructive. Merely avoiding insults is ~70, not 100 |
| Claims | 15% | Proportional to claims advanced |
| Fallacies | penalty | Confidence-gated, capped — detections still shown |

Measured against adversarial cases:

```
                                    quality  substance  evidence  clarity  tone
Bare assertion                          39         20         0       80    70
Evidence vocabulary, no evidence        39         21        21       80    80
Padded with transition words            15         10         0       20    60
Concrete mechanism, no citations        66         60        40       90    90
Civil but dismissive                    14         10         0       80    20
```

Winner determination weights argument quality 40%, rebuttals 30%, conduct 15%,
audience votes 15% — reasoning decides debates, not popularity.

---

## Layout

```
backend/
  server.js              app wiring, middleware order, graceful shutdown
  src/
    config/              database, cors (single origin list for HTTP + sockets)
    controllers/         thin HTTP handlers
    services/            business logic
      graph/             AI pipelines
    models/              Mongoose schemas
    middleware/          auth, validate, rateLimit, errorHandler
    validators/          express-validator chains
    routes/              route → validator → controller
    sockets/             debate, huddle (JWT-authenticated), assistant
  scripts/               one-off setup, backfills, smoke test, import checker
  tests/                 Jest unit tests

frontend/src/
  pages/                 route-level screens
  components/            grouped by domain
  store/                 Zustand stores
  services/              axios instance + socket clients
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Backend with nodemon |
| `npm test` | Unit tests |
| `npm run smoke` | Integration checks against your DB and live models |
| `node scripts/createVectorIndexes.js` | One-time Atlas vector index setup |
| `node scripts/checkImports.js` | Catch case-mismatched imports before Linux does |
| `node scripts/backfillClaimAuthors.js` | Attribute pre-existing claims |
| `node scripts/backfillPostKarma.js` | Recompute post karma |

---

## Known limitations

- **Atlas required.** `$vectorSearch` has no local-MongoDB equivalent; RAG degrades to
  disabled (the app still runs, and says so at boot).
- **No job queue.** Background AI work uses `setImmediate` — it is lost on restart and
  has no retries. BullMQ is the intended fix.
- **JWT in `localStorage`**, long-lived, no rotation.
- **Slicks** (anonymous feedback about a user) are authorization-gated but remain a
  design with real harassment potential.
- Scores come from language models and vary slightly between runs; borderline cases
  will not be identical every time.
