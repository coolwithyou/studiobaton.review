# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start dev server on port 3020
npm run build        # Production build
npm run lint         # Run ESLint
npx prisma migrate dev    # Run database migrations
npx prisma generate       # Regenerate Prisma client after schema changes
npx prisma studio         # Open database GUI
```

## Architecture Overview

This is a **GitHub commit analysis system** that generates AI-powered yearly reports for developers. Users input an organization + year, and the system analyzes commits across all repositories to produce structured feedback.

### Core Flow

1. **Commit Sync** (`src/lib/jobs/sync-runner.ts`) - Collects commits from GitHub API by org+year
2. **WorkUnit Clustering** (`src/lib/analysis/clustering.ts`) - Groups related commits by time (8hr gaps) and path similarity (Jaccard)
3. **Impact Scoring** (`src/lib/analysis/scoring.ts`) - Calculates scores based on LoC, core modules, hotspots, test coverage
4. **AI Analysis** (`src/lib/ai/stages/`) - 4-stage LLM pipeline:
   - Stage 1: Code quality review of sampled work units
   - Stage 2: Work pattern analysis
   - Stage 3: Growth trajectory
   - Stage 4: Summary generation
5. **Report Generation** - YearlyReport with metrics, charts, and AI insights

### Key Directories

- `src/app/` - Next.js App Router pages and API routes
- `src/app/(dashboard)/` - Authenticated pages (organizations, reports, sync)
- `src/app/api/` - REST API endpoints for auth, analysis, sync jobs
- `src/lib/ai/` - Anthropic/OpenAI integration, prompt stages
- `src/lib/analysis/` - Clustering, scoring, diff processing
- `src/components/charts/` - Recharts-based visualizations
- `src/components/journal/` - Report viewing components
- `prisma/schema.prisma` - Database schema (PostgreSQL)

### Data Models

- **Organization** → **Repository** → **Commit** → **CommitFile**
- **AnalysisRun** → **WorkUnit** → **AiReview**
- **YearlyReport** - Final output with metrics and AI insights

### Tech Stack

- **Framework**: Next.js 16 (App Router, RSC)
- **Database**: PostgreSQL + Prisma
- **Auth**: iron-session + GitHub OAuth
- **UI**: shadcn/ui + Tailwind CSS v4
- **Queue**: Upstash QStash for background jobs
- **LLM**: Anthropic Claude / OpenAI GPT-4o

## Code Conventions

- **Path alias**: `@/*` maps to `src/*`
- **File naming**: kebab-case (`work-unit.ts`)
- **Components**: PascalCase (`ActivityChart`)
- **Functions**: camelCase (`getUserOctokit`)
- **Constants**: UPPER_SNAKE_CASE (`DEFAULT_CONFIG`)
- **Types**: Centralized in `src/types/index.ts`

## Important Patterns

### Background Jobs
Jobs use Upstash QStash and must be idempotent (use upsert). See `src/app/api/jobs/`.

### AI Sampling
To reduce LLM costs, only 10-12 work units are sampled per user (top 7 by impact + random 3 + 2 special). See `src/lib/ai/sampling.ts`.

### GitHub API
Uses both OAuth tokens (for user context) and GitHub App installation tokens (for org access). Rate limits are monitored.

## Environment Variables

Required: `DATABASE_URL`, `SESSION_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`