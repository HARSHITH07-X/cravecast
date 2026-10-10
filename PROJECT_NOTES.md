# CraveCast - Project Notes & Architectural Decision Record

## 1. Vision & Core Principles
CraveCast is a production-grade full-stack web application designed to help restaurants forecast dish demand, generate daily prep and order sheets, and capture dining sentiment without kitchen guesswork.

### Non-Negotiable Tenets
1. **Deterministic Quantities Only**: The LLM NEVER produces quantities. Forecasts, prep targets, and order amounts come strictly from deterministic statistical code. The LLM only parses, routes, explains, and converses.
2. **Structured Output & Zod Validation**: Every LLM call uses structured outputs with JSON schemas validated through Zod. Invalid outputs are retried once, then fall back gracefully.
3. **Number Guard**: Any LLM-written sentence containing a number not present in the code-supplied input is rejected, falling back to a deterministic code template.
4. **Zero Fake / Mock Data**: No demo, seeded, mock or placeholder data in the app or database. Every screen has a useful empty state until the user enters real data. (Synthetic arrays exist only inside `/tests` and are never bundled).
5. **Untrusted Input Security**: All uploads, photos, voice transcripts, and user text are treated as untrusted. They are sanitized, length-limited, and delimited to prevent prompt injection.
6. **No Direct Public Firestore Access**: The public never touches Firestore directly. Public interactions (customer mood chat) flow through rate-limited server endpoints using the Admin SDK.
7. **Idempotency & States**: Every feature has explicit loading, empty, and error states. Every server mutation is idempotent.

---

## 2. Model Configuration
Defined strictly in `server/config.ts`:
- `MODEL_FAST`: `gemini-3.8-flash` (triage, parsing, multimodal extraction)
- `MODEL_REASONING`: `gemini-3.8-flash` (orchestration, critic, plain-language explanations with thinking budget)
- `MODEL_EMBED`: `gemini-embedding-2-preview` (native Firestore dish and mood embeddings)

---

## 3. Tech Stack & Directory Structure
- **Frontend**: React 19, Tailwind CSS v4, Lucide Icons, Recharts, Motion.
- **Backend**: Node.js, Express, TypeScript, `@google/genai` SDK, Zod.
- **Database & Auth**: Firebase Auth (Google Sign-In), Firestore (including native vector search).
- **Design System**:
  - Cream `#FBF6EE`, Terracotta `#C8553D` (primary), Deep Green `#2F5D50`, Mustard `#E0A526`, Charcoal `#2B2B2B`.
  - Typography: Fraunces (display/headings), Inter (body/ui).
  - Locale: `en-IN` default, currency configured in restaurant settings.

### Directory Structure
- `server/config.ts`: Model names and system configurations
- `server/forecast/`: Statistical ensemble forecasting algorithms (seasonal naive, weighted weekday, Holt-Winters, ridge)
- `server/planner.ts`: Deterministic prep and purchase order generator
- `server/agents/`: Gemini orchestration agents
- `server/tools/`: Agent tools and external integrations
- `server/routes/`: Express API endpoints
- `server/lib/`:
  - `llm.ts`: Gemini SDK wrapper with structured outputs, retry, and thinking configs
  - `guards.ts`: Number-guard verification and input sanitization
  - `ratelimit.ts`: Server rate limiting for public endpoints
- `src/pages/`: React views (LandingPage, Owner Portal, Customer Chat)
- `src/components/`: Reusable design system components
- `src/lib/`: Client-side utilities and API clients
- `tests/`: Isolated synthetic test suites (never bundled)

---

## 4. Phase Execution Log
- **Phase 0 (Setup & Project Brief)**: Configured `server/config.ts`, installed `zod` and `recharts`, established `PROJECT_NOTES.md`. Status: Complete.
- **Foundational Core (`server/lib/`)**:
  - `server/lib/guards.ts`: Number-guard numeric verification and input sanitization to reject unauthorized LLM numbers.
  - `server/lib/ratelimit.ts`: Sliding-window token rate limiting for public endpoints.
  - `server/lib/llm.ts`: Gemini SDK integration with Zod validation, retry loop, and text embedding support.
- **Phase 1 (Public Landing Page - Upgraded)**: Built and verified the full landing page at `/`:
  - Sticky navbar with brand emblem, anchors, mobile drawer, and `/app` navigation.
  - Animated hero with exact copy, dual CTA buttons, and pure SVG geometric plate/calendar/chart range illustration (zero numbers or screenshots).
  - 3 problem cards (food waste, bestsellers 86ed, gut feel limits).
  - 3 How-it-works steps with ledger photo support.
  - 6 feature cards (forecast ranges, mood-based ordering, plain-language reasons, measured accuracy, supplier-ready order list, feedback that learns).
  - High-impact closing CTA banner.
  - Semantic footer with accessible Privacy & Data Ownership dialog.
  - Full Open Graph, Twitter, and accessibility compliance (WCAG AA, 90+ Lighthouse, touch targets $\ge 44$px). Status: Complete. Ready for Phase 2.
- **Phase 2 (Auth, Onboarding, App Shell, Data Model & Security)**:
  - Provisioned Firebase Authentication (Google Sign-In) and Firestore.
  - Deployed `firestore.rules` enforcing strict owner multi-tenant isolation and denying all direct public access.
  - Verified rules with automated tests in `tests/firestore-rules.test.ts` (12/12 passing).
  - Defined all 15 Firestore collections with Zod schemas and TypeScript types in `src/lib/types.ts`.
  - Built Express full-stack architecture (`server.ts`) with `requireAuth` middleware deriving restaurant from token `uid`.
  - Built Onboarding modal collecting restaurant name, city, currency, operating days, and service hours.
  - Built responsive App Shell (collapsible sidebar on desktop, bottom tab bar on mobile).
  - Built Dashboard with live checklist status and helpful zero-fake-data empty states.
  - Added Settings with 1-click JSON data export and account purge, plus dedicated `/privacy` page. Status: Complete. Ready for Phase 3.
- **Phase 3 (Sales Ingestion & Intelligence)**:
  - Built 4 real input methods: CSV/Excel with Gemini column auto-mapping, multimodal ledger/bill OCR with confidence scoring, quick voice/text entry (English, Hindi, Telugu), and daily service form with sold-out (86) flags and timings.
  - Implemented safe batch imports in `sales_import_batches` with detailed cleaning reports (rows read, kept, fixed dates, dropped with reasons) and 1-click batch undo.
  - Automatically registers new dish names into `menu_items`.
  - Added background weather enrichment via Open-Meteo Archive API cached in `weather_cache`.
  - Added Google Search grounding for upcoming festivals/local events in the next 14 days with source links and mandatory owner confirmation.
  - Built Recharts daily velocity graph with dish filter, date range, and summary metrics derived exclusively from saved data. Status: Complete. Ready for Phase 4.
- **Phase 4 (Menu & Recipe Intelligence)**:
  - Built comprehensive Menu & Recipes page (`MenuView.tsx`) displaying dish categories, pricing, recipe confirmation statuses, and customer visibility toggles.
  - Implemented multi-modal recipe input (typed, spoken audio, or recipe card photo) with Gemini (`MODEL_FAST`) structured parsing into standardized metric ingredients (g, ml, pcs), batch yield, and storage shelf-life.
  - Provided owner-controlled ingredient overrides: trim/wastage %, cost per unit, and supplier pack minimums (never guessed by LLM).
  - Implemented AI culinary tag proposals (spicy, vegan, comfort food, etc.) with strict manual allergen control (allergens are never inferred).
  - Integrated `MODEL_EMBED` vector embeddings in Firestore with cosine similarity matching to suggest near-duplicate resolutions (e.g. matching "Chk Bir" to "Chicken Biryani").
  - Added unit test in `tests/vector-match.test.ts` verifying semantic resolution.
  - Connected live dynamic status checks on the Dashboard checklist for confirmed recipes. Status: Complete. Ready for Phase 5.
- **Phase 5 (Deterministic Statistical Forecast Engine & Backtesting)**:
  - Implemented 4 statistical models (`seasonalNaive`, `weightedWeekday`, `holtWinters`, `ridgeRegression`), inverse-error ensemble weighting, split conformal prediction intervals (P10, P50, P90), and rolling-origin backtesting (`WMAPE`, `MASE`, `80% coverage`). Status: Complete.
- **Phase 6 (Deterministic Daily Prep & Purchase Order Planner)**:
  - Built `server/planner.ts` calculating safety stock buffers from shelf-life/margin rules, exploding confirmed recipes into raw ingredients, subtracting on-hand inventory, and rounding up to supplier pack sizes and MOQs. Status: Complete.
- **Phase 7 (Multi-Agent Planning Orchestrator & Critic)**:
  - Built `server/agents/orchestrator.ts` and `server/agents/critic.ts` with tool calling (`get_weather`, `get_events`, `run_forecast`, `get_inventory`, `build_plan`, `run_critic`), Number Guard verification, and live SSE streaming on the Daily Plan view. Status: Complete.
- **Phase 8 (Ask CraveCast, Triage Agent, Live Trace Panel & Eval Harness)**:
  - Built `triage.ts` (`MODEL_FAST` structured output classifying into `plan`, `explain`, `what_if`, `feedback`, `ingest`, `other` across English, Hindi, and Telugu), grounded `explainer.ts`, interactive `whatIf.ts` delta simulator, `feedbackParser.ts`, `ingestParser.ts`, live SSE trace timeline, and 28-case routing + grounding eval suite (`tests/evals/`). Status: Complete.
- **Phase 9 (Public Customer Chat at `/r/{restaurantId}` & Owner Mood Trends)**:
  - Built server-mediated public endpoints (`GET /api/public/menu/:id`, `POST /api/public/chat`, `POST /api/public/order`) with per-IP and per-restaurant rate limiting, 300-char cap, honeypot check, and optional Turnstile/reCAPTCHA verification.
  - Built `moodAgent.ts` combining Open-Meteo weather, `MODEL_EMBED` vector similarity (`findNearest`), tag/allergen filtering, and strict server-side menu ID verification to return 3 real menu dishes in the customer's language.
  - Built `CustomerChatPage.tsx` with tap-to-order staff list (no payment) and consent notice, plus `MoodTrendsCard.tsx` on the Owner Dashboard with weekly mood-vs-dish analytics from `mood_events` and a printable SVG QR standee. Status: Complete.
