# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `jmleedotdev/nuxt-note-taking`.
Use the `gh` CLI, running from this clone so it infers the repository.

## Conventions

- Create: `gh issue create --title "..." --body "..."`.
  For multiline bodies, use `--body-file -` with a heredoc.
- Read: `gh issue view <number> --json number,title,body,labels,comments`.
- List: `gh issue list --state open --json number,title,body,labels`.
  Add label and state filters as needed; use `--limit` or pagination for larger queues.
- Comment: `gh issue comment <number> --body "..."`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."`
  or `--remove-label "..."`.
- Close: `gh issue close <number> --comment "..."`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When it says "fetch the relevant ticket", read the GitHub issue.

## Parent issues and dependencies

- Prefer native GitHub sub-issues. With gh 2.94+, use
  `gh issue create --parent <parent> ...` or
  `gh issue edit <parent> --add-sub-issue <child>`.
- If sub-issues are unavailable, put `Part of #<parent>` at the top
  of the child body and add the child to a task list in the parent.
- Prefer native issue dependencies:
  `gh api --method POST repos/{owner}/{repo}/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Obtain the numeric database ID with
  `gh api repos/{owner}/{repo}/issues/<blocker> --jq .id`.
- If native dependencies are unavailable, use a `Blocked by: #<n>, #<n>`
  line at the top of the child body.
- A ticket is unblocked when all its blockers are closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares issue and PR numbers. If a reference is ambiguous, try
`gh pr view <number>` and fall back to `gh issue view <number>`.

## Wayfinding operations

- The map is one issue labelled `wayfinder:map`, containing Notes,
  Decisions-so-far, and Fog.
- Child tickets are sub-issues of the map, with labels
  `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`,
  or `wayfinder:task`.
- The frontier is the first open child in map order with no assignee
  and no open blockers.
- Claim before working: `gh issue edit <number> --add-assignee @me`.
- Resolve by commenting with the answer, closing the child, and adding
  a summary and link to the map's Decisions-so-far.
