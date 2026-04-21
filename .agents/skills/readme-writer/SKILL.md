---
name: readme-writer
description: Write or rewrite `README.md` and adjacent repo docs from the actual codebase instead of paraphrasing stale documentation. Use this skill whenever the user asks to create, refresh, replace, expand, or clean up a README, contributor guide, onboarding doc, setup section, installation guide, project overview, or developer quickstart, especially if the current README is outdated, should be ignored, or the docs should be derived from the repository itself.
user-invocable: false
---

# README Writer

Use this skill to produce accurate README content grounded in the current repository state.

## Core Rule

Treat the codebase as the source of truth.

- Start from code, config, scripts, env usage, and entrypoints.
- Do not let an existing README anchor the structure or wording unless the user explicitly wants it preserved.
- If the user says to ignore the current README, ignore it.

## Goals

- Explain what the project is and how to run it.
- Give setup and development steps that actually match the repository.
- Keep the document concise, scannable, and useful for a new contributor or evaluator.
- Remove speculation, stale sections, and generic filler.

## When To Use This Skill

Use this skill whenever the user asks for any of the following, even if they do not explicitly say "README":

- write a project overview
- add installation or setup instructions
- create onboarding or quickstart docs
- rewrite outdated repository docs
- document local development commands
- summarize repo structure or architecture for contributors

## Working Style

1. Inspect the repository before drafting.
2. Infer the repository type.
3. Choose only the sections that the repo can support.
4. Write the README in the dominant language of the request or repository.
5. Validate commands, paths, package manager, and filenames before finishing.

Prefer a clean rewrite over incremental patching when the document is stale or the user asks for a fresh README.

## Evidence Order

Use evidence in this order:

1. Repository facts: `package.json`, lockfiles, source tree, configs, scripts, env access
2. Local docs that are closer to implementation, such as `AGENTS.md`, `docs/`, examples, migration notes
3. Existing README only if the user wants it considered
4. External docs only when third-party setup details are necessary and not obvious from the repo

When external library or framework behavior matters, use official documentation. Prefer Context7 for library and API docs. If Yamada UI details are needed, fetch the Yamada UI docs from `https://yamada-ui.com/llms.txt` and follow that sitemap.

## What To Inspect

Inspect the smallest set of files that can establish the README facts:

- package manager and scripts from `package.json` and lockfiles
- framework and runtime from config files
- entrypoints from `src/`, `app/`, `pages/`, `server/`, `cli/`, `bin/`, or exported library files
- workspace layout from monorepo configuration
- environment variables from config loaders and `process.env` usage
- database, auth, testing, linting, and formatting setup from nearby config files
- deployment or build expectations only if they are clearly configured in the repo

## Avoid Hallucinations

Do not invent:

- environment variables
- hosted URLs
- deployment steps
- CI workflows
- package scripts
- features that are not visible in the code or user instructions

If a detail seems likely but cannot be verified, either omit it or label it clearly as something the user should confirm.

## README Shape

Pick the smallest useful structure for the repository type.

### App or Product Repository

Common sections:

- Title and short description
- What the product does
- Tech stack
- Repository structure
- Prerequisites
- Setup
- Environment variables
- Development
- Quality checks
- Architecture notes or key paths

### Library or SDK Repository

Common sections:

- Title and short description
- What the package provides
- Installation
- Basic usage
- API surface overview
- Development
- Testing
- Publishing or release notes if clearly supported

### Internal Tool or Prototype

Common sections:

- Title and purpose
- Current scope and non-goals
- Setup
- Main workflows
- Commands
- Known limitations

## Writing Guidelines

- Lead with what the project is, not a vague mission statement.
- Prefer short paragraphs and tight bullet lists.
- Use executable command blocks.
- Use real paths from the repo.
- Keep headings conventional so contributors can scan quickly.
- Explain domain-specific constraints when they shape how the code should be changed.
- Avoid marketing tone unless the user explicitly wants it.

## Command Handling

Before writing commands:

- confirm the package manager
- confirm script names
- confirm whether commands run from the repo root or a subdirectory
- avoid showing commands that are not present or cannot work in this repo

If there is no dedicated script for something like type checking, say so and give the verified fallback command.

## Environment Variables

Document only variables that are actually referenced or explicitly required by the user.

For each variable, prefer one of these:

- what it is used for
- whether it is required
- where it is read from

Do not include secret values. Use placeholders only.

## Existing README Replacement

If the user asks for a rewrite or says the current README should be ignored:

- do not mirror the old section order by default
- rebuild the structure from current repository facts
- keep any still-valid project facts only if you can verify them elsewhere

## Output Format

If the user asks for content only, return Markdown ready to paste into `README.md`.

If the user asks for implementation, update `README.md` directly.

Default structure:

```markdown
# <project name>

<1-2 sentence description>

## Overview

## Tech Stack

## Repository Structure

## Setup

## Environment Variables

## Development

## Quality Checks

## Notes
```

Remove sections that are unsupported or empty. Add sections only when they are justified by the repository.

## Example Requests

Example 1:
Input: Rewrite this repo's README from scratch. The current one is stale.
Output: Inspect the repository first, ignore the current README unless the user asks otherwise, and produce a fresh `README.md` with verified setup and development instructions.

Example 2:
Input: Add a contributor quickstart for this Next.js app.
Output: Verify the package manager, scripts, env vars, and important paths, then add a focused quickstart section without inventing deployment details.

Example 3:
Input: Create a README for this prototype. Keep it practical, not marketing.
Output: Emphasize current scope, setup, commands, constraints, and known limitations using concise Markdown.
