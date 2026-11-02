# Domain Docs

## Layout

This repository uses a single-context domain model:

- `GLOSSARY.md` at the repository root: domain terminology.
- `docs/adr/`: architecture decision records.

## Before exploring

Read the root `GLOSSARY.md` and ADRs relevant to the area being explored.

If these files do not exist, proceed silently. Create them lazily through
domain modeling when terms or decisions are actually resolved.

## Use the glossary's vocabulary

Use the glossary's terms in issue titles, proposals, hypotheses, tests,
and other output. Respect any synonyms it explicitly avoids.

If a needed concept is absent, reconsider whether the term belongs in the
project or note the gap for domain modeling.

## Flag ADR conflicts

Explicitly surface any proposal or output that contradicts an existing ADR.
Identify the ADR and explain why its decision may be worth reopening.
