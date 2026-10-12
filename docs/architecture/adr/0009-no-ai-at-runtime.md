# ADR 0009: No AI at runtime

- **Status:** Accepted
- **Date:** 2026-10-08
- **PRD reference:** D9, §15

## Context
This is a hackathon about building with AI, which makes it tempting to put AI inside the product. But EnvDrift is a CI gate, and CI gates must be deterministic, offline, and free of data egress. Sending code or config names to a model would also break the "no network unless SSM" promise.

## Decision
The product contains no AI or LLM calls. AI is used only to **build** EnvDrift, through Claude Code, `CLAUDE.md`, and the custom commands. That use is documented in `docs/ai-development.md` and [ai-log.md](../../ai-log.md).

## Consequences
- Positive:
  - Byte-identical output for identical input.
  - Works offline.
  - No API keys.
  - Nothing is sent to third parties.
- Negative: there are no AI-written explanations of findings. Those stay on the roadmap as optional and opt-in.

## Alternatives considered
| Option | Why not |
|---|---|
| Optional AI explanations | Scope creep. Network and privacy concerns. Non-deterministic output in PR comments |

## Evidence / validation plan
- The dependency list ([dependencies.md](../dependencies.md)) has no AI SDKs.
- The no-network rule is covered in [system/security.md](../../system/security.md).
- The determinism golden tests compare JSON byte for byte.
