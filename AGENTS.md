# Git Commit & PR Automator

## Project Briefing

This project scaffolds an agent-style workflow that converts local git staged diffs into semantic commit and pull request artifacts.

## Objective

Automate semantic commit messages and PR generation from local git diffs.

## Tools

- **Filesystem**: write markdown artifacts such as `PR_DESCRIPTION.md`.
- **Git**: read staged changes using `git diff --cached`.

## Agent Loop

1. **Read diff**: Collect staged changes from git.
2. **Categorize**: Infer change type and impact from diff semantics.
3. **Generate**: Build semantic commit/PR draft text (placeholder logic now, LLM-ready later).
4. **Write PR file**: Persist output to `PR_DESCRIPTION.md` at the repository root.
