# Report template

Save as `docs/reviews/YYYY-MM-DD-<scope>.md`. Use this skeleton and these tier names exactly.

## Severity tiers

- **BLOCKER**: breaks a hard rule in CLAUDE.md, leaks or could leak a configuration value, wrong rule semantics (PRD §11), or the pre-flight shows failing tests or typecheck.
- **HIGH**: a bug, or a missing test, that would let a real defect through. Also behaviour that is not in the PRD or catalogue ("unrequested scope").
- **MEDIUM**: maintainability, unclear code, docs out of sync with behaviour.
- **NIT**: style or naming; optional.

## Skeleton

```markdown
# Review: <scope>

## 1. Scope and verdict
- Scope: <what was reviewed: diff against <base>, files, range, task ID>
- Staged-diff-sha256: <hex from the pre-flight STAGED_HASH line, or none>
- Date: YYYY-MM-DD
- Verdict: APPROVE | APPROVE WITH FIXES | CHANGES REQUIRED
- Reason: <one sentence>

## 2. Pre-flight results
<the CHECK and SUMMARY lines from the script, verbatim, in a code block>

## 3. Findings
### BLOCKER
1. **<short title>** — `path/to/file.ts:LINE`
   - Problem: <what is wrong, fact>
   - Why it matters: <PRD § or CLAUDE.md rule>
   - Fix: <concrete suggested change>
### HIGH
### MEDIUM
### NIT
(write "none" under a tier with no findings)

## 4. Checked and passed
- <short list; only things actually checked>

## 5. Uncertainties
- <anything not verified, every SKIP, assumptions about scope>
```

## Verdict rule
- Any BLOCKER → CHANGES REQUIRED.
- No BLOCKER but at least one HIGH → APPROVE WITH FIXES (or CHANGES REQUIRED if the HIGH is a missing test for a rule).
- Only MEDIUM and NIT → APPROVE.

## Quality bar
- Each finding has a real `file:line`. A finding about something that is absent (a missing test file) points at the file that should have had it (the rule file, or the catalogue row).
- Mark judgement: write "Judgement:" at the start of a line that is opinion, not observation.
