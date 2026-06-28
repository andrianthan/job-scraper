<!-- GSD:project-start source:PROJECT.md -->
## Project

**job-board-aggregator**

A **CLI daemon** that aggregates finance / business / HR **internship** listings
from public ATS APIs (Greenhouse, Lever, Ashby, Workday) and notifies students
when new postings appear. Targeted at incoming sophomores/juniors hunting
next-summer internships — a niche the existing CS-heavy GitHub internship repos
underserve.

Not a web app, not a multi-user SaaS. A single-tenant tool the operator runs
(locally or via cron/CI) that pushes new matches to a notification channel.

**Core Value:** **The one thing that must work:** new, relevant internship postings reach the
user reliably and without duplicates. Everything else (sources, scheduling,
channels) serves that.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->
## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
