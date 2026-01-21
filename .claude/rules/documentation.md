---
paths:
  - "docs/**/*.md"
  - "stacks/**/README.md"
---

# Documentation Conventions

## File Naming
- Use lowercase-with-hyphens: `landing-zone-concepts.md`, `platform-deployment.md`

## Structure by Type

**Architecture docs** (`docs/architecture/`):
1. Overview / What is X?
2. Why use X? (benefits table)
3. Core concepts with mermaid diagrams
4. Related documentation links

**Implementation docs** (`docs/implementation/`):
1. Prerequisites
2. Step-by-step instructions
3. Configuration reference (tables)
4. Verification / troubleshooting

**Development docs** (`docs/development/`):
1. Overview
2. Key files and structure
3. How to extend
4. Code examples

## Formatting
- Use mermaid diagrams for architecture and flows (```mermaid)
- Use tables for configs, comparisons, summaries
- Code blocks: always include language hint (```typescript, ```bash, ```yaml)
- Link to related docs at bottom of each file

## Index Files
- Each folder has `index.md` with overview and links to sub-documents
- Update `docs/index.md` when adding new top-level documents
