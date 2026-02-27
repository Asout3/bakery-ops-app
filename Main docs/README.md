# Main Docs - Bakery Operations Platform

This folder contains the operational documentation set intended for the next developer maintaining and scaling this codebase safely.

**Owner / Lead Developer:** Asotu3

## Documentation Index

- `developer-workflow-and-guardrails.md`
  - Day-to-day coding workflow
  - API and database change safety
  - Required validation and test routine

- `offline-refresh-sync-protection.md`
  - Critical non-negotiable rules to preserve offline refresh and sync behavior
  - Failure modes and prevention checklist

- `deployment-and-infrastructure.md`
  - Production deployment flow
  - Backend hosting + Supabase guidance
  - Environment, scaling, and observability recommendations

- `system-diagrams.md`
  - Cross-cutting architecture and runtime diagrams in Mermaid

## How to Use These Docs

1. Read `developer-workflow-and-guardrails.md` first.
2. Read `offline-refresh-sync-protection.md` before touching sync, routing, caching, or service worker logic.
3. Use `deployment-and-infrastructure.md` when preparing production releases.
4. Keep diagrams in `system-diagrams.md` updated when architecture changes.

## Minimum Change Policy

Any PR that modifies offline flow, routing behavior, or API error handling should include:

- updated docs in this folder,
- test evidence,
- explicit risk notes for offline replay/refresh behavior.
