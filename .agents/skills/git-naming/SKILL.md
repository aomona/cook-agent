---
name: git-naming
description: Helps generate clear Git naming for branches, commits, and pull requests. Use this skill whenever the user asks how to name a branch, write a commit message, title a PR, clean up Git wording, or wants naming conventions for Git workflows in either English or Japanese. Also use it when the user shows a diff and needs concise Git-friendly wording.
---

# Git Naming

Use this skill to turn code changes into short, searchable, consistent Git names.

## What This Skill Covers

- Branch names
- Commit messages
- Pull request titles
- Short Git naming conventions for a repository or team

## Goals

- Reflect the intent of the change, not just the file edits
- Make names easy to scan in `git log`, branch lists, and PR views
- Keep wording specific, compact, and consistent
- Prefer predictable patterns over clever phrasing

## Working Style

1. Infer the change type from the user's request, diff, or summary.
2. Identify the main subject area such as auth, planner, timeline, recipe import, or tests.
3. Choose the smallest wording that still explains why the change exists.
4. If multiple names are useful, give 3 options and mark the strongest default first.

If the change is ambiguous, prefer a conservative label like `update`, `refactor`, or `adjust` instead of overstating it as `add` or `fix`.

## GitHub MCP Usage

When GitHub repository context is available, use GitHub MCP first to ground naming in real project history instead of guessing.

Use GitHub MCP to:

- inspect recent commit titles before proposing commit message style
- inspect open or recent pull request titles before proposing PR title style
- inspect branch names or issue titles when the repository already follows a team convention
- read diff, PR, or issue context when the user gives a GitHub URL or references an issue or PR number

If GitHub MCP results conflict with the default guidance in this skill, prefer the repository's existing naming style.

## Branch Naming

Use lowercase kebab-case.

Recommended format:

```text
<type>/<scope>-<summary>
```

Good branch types:

- `feat` for new user-facing behavior
- `fix` for bug fixes
- `refactor` for code restructuring without behavior change
- `chore` for maintenance work
- `docs` for documentation-only changes
- `test` for test-focused changes

Guidelines:

- Keep it under about 4 to 6 words after the slash
- Prefer one clear scope: `planner`, `auth`, `timeline`, `db`, `ui`
- Avoid ticket-only names unless the repo already uses them
- Avoid vague summaries like `misc-updates` or `final-changes`

Examples:

- `feat/planner-support-multi-recipe-input`
- `fix/timeline-handle-delayed-steps`
- `refactor/auth-extract-session-helper`
- `test/plan-parser-edge-cases`

## Commit Message Naming

Prefer a short subject line that reads naturally in `git log`.

Recommended format:

```text
<type>(<scope>): <why-focused summary>
```

If the repository does not use scoped conventional commits, fall back to:

```text
<verb> <concise summary>
```

Type guidance:

- `feat`: introduces a new capability
- `fix`: corrects incorrect behavior
- `refactor`: restructures code without intended behavior change
- `chore`: maintenance, tooling, or cleanup
- `docs`: documentation only
- `test`: adds or updates tests
- `perf`: improves performance

Verb guidance:

- Prefer `add`, `fix`, `update`, `refactor`, `improve`, `remove`
- Avoid filler like `some`, `various`, `stuff`, `things`
- Focus on the reason or outcome when possible

Good examples:

- `feat(planner): support multiple recipe urls in plan input`
- `fix(timeline): keep delayed tasks in chronological order`
- `refactor(auth): centralize session lookup for server routes`
- `test(parser): cover missing ingredient and timer edge cases`

Weaker examples:

- `update files`
- `fix bug`
- `changes`

## Pull Request Title Naming

PR titles can be slightly broader than commit messages.

Recommended formats:

```text
<type>: <outcome-focused summary>
```

or, if the repository prefers conventional style:

```text
<type>(<scope>): <outcome-focused summary>
```

Guidelines:

- Describe the combined outcome of the branch
- Mention the user-visible or team-visible effect
- Do not repeat low-level implementation details unless they matter

Examples:

- `feat: add multi-recipe planning flow`
- `fix: prevent runtime plan updates from reordering active steps`
- `refactor(auth): simplify session handling in route handlers`

## Mapping Change Types

Choose words carefully:

- Use `add` when something new exists that did not before
- Use `update` or `improve` when enhancing existing behavior
- Use `fix` only when correcting a bug or wrong behavior
- Use `refactor` when the main change is structural
- Use `remove` when deleting behavior or dead code

## Output Format

When the user asks for naming help, respond with this structure unless they ask for just one answer:

```text
Branch: <best option>
Commit: <best option>
PR: <best option>

Alternatives:
- ...
- ...
```

If the user asks for only one Git artifact, return only that artifact.

## Japanese Requests

If the user asks in Japanese, you can explain briefly in Japanese, but keep the actual Git names in concise English unless the repository already uses Japanese Git names.

## Repository Adaptation

When commit history or branch history is available, match the existing house style before applying these defaults.

Prefer this order of evidence:

1. GitHub MCP data from the current repository
2. Local git history from the current checkout
3. The defaults in this skill
