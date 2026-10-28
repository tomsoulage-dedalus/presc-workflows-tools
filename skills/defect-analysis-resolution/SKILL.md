---
name: defect-analysis-resolution
description: "Use this skill for Jira defect analysis and resolution in the company codebase. It orchestrates ticket intake, investigation, hypotheses, planning, resolution, verification, and reporting."
---

# Skill: Defect Analysis Resolution

## Goal

Help the developer analyze and resolve Jira defects in an iterative, evidence-based way.

This skill is an orchestrator. It should not contain every detail of the workflow.
When needed, it must load and apply the relevant local or shared module.

Local defect-specific modules:

- `investigation.md`
- `hypotheses.md`

Shared reusable modules:

- `.github/modules/jira-intake.md`
- `.github/modules/code-resolution.md`
- `.github/modules/jira-report.md`

## Default behavior

- Work in French with the developer.
- Use English for code, code comments, commit messages, and Jira comments.
- Stay read-only unless the developer explicitly allows code modifications.
- Never edit files before a validated plan.
- Never invent missing Jira information.
- Never expose secrets, tokens, cookies, private URLs, or session data.
- Prefer small, surgical, verifiable changes.
- Reuse existing project patterns before introducing anything new.
- Do not refactor unrelated code.
- Do not format unrelated files.
- Do not touch unrelated local changes.

## Existing repository context

Corporate instructions already exist and must be respected when relevant:

- `.github/instructions/backend/java-coding-style.instructions.md`
- `.github/instructions/backend/java-unit-testing.instructions.md`
- `.github/instructions/frontend/front-rules.instructions.md`
- `.github/instructions/frontend/u-tabs-lifecycle.instructions.md`
- `.github/copilot-instructions.md`

Do not replace, rewrite, or ignore these files unless the developer explicitly asks for it.

## Shared modules

Reusable workflow modules exist here:

- `.github/modules/jira-intake.md`
- `.github/modules/code-resolution.md`
- `.github/modules/jira-report.md`

These modules are shared and may be reused by other skills.

Do not point another skill to files inside this skill folder if the logic is meant to be shared.
Move reusable logic to `.github/modules/` instead.

## Available modules

Use only the relevant module for the current situation.

### Shared module: `.github/modules/jira-intake.md`

Use when:

- the defect key is known but the Jira ticket is not loaded yet,
- Jira data must be retrieved,
- Jira data must be summarized,
- missing or unclear Jira fields must be listed.

### Local module: `investigation.md`

Use when:

- reproduction status is unclear,
- the failing case must be confirmed,
- the suspected area must be classified,
- logs, API responses, browser behavior, or code paths must be inspected,
- legacy behavior or existing project patterns must be checked.

### Local module: `hypotheses.md`

Use when:

- enough evidence exists to propose plausible root-cause theories,
- multiple possible causes must be compared,
- a selected hypothesis must be planned and verified.

### Shared module: `.github/modules/code-resolution.md`

Use when:

- a hypothesis has been selected and the plan is validated,
- the root cause is proven and coding can start,
- exact read-only patches must be proposed,
- direct implementation is allowed,
- verification must be run,
- a failed implementation path must be handled.

### Shared module: `.github/modules/jira-report.md`

Use when:

- an investigation summary is requested,
- a fix summary is requested,
- a Jira-ready comment is requested,
- rejected paths must be documented,
- final verification must be summarized.

## Automatic phase routing

The developer should not have to name the workflow phase.

Infer the next action from the current context.

Examples:

- "Analyse HDEFECT-12345"
- "Fix HDEFECT-12345"
- "J’ai reproduit le bug, voilà les logs"
- "L’API retourne déjà la mauvaise valeur"
- "Propose-moi un fix read-only"
- "Fais-moi le commentaire Jira"

Routing rules:

1. If the defect key is missing, ask for it.
2. If the defect key is known but Jira data is not loaded, use `.github/modules/jira-intake.md`.
3. If Jira data is loaded but reproduction status is unclear, use `investigation.md`.
4. If the actual failing case differs from Jira, update the working context and use the confirmed failing case as the main source of truth.
5. If the suspected area is unclear, use `investigation.md`.
6. If code paths and evidence exist but the root cause is not proven, use `hypotheses.md`.
7. If the root cause is proven, skip fake hypotheses and produce a plan.
8. If a plan is validated and coding or patch proposal is needed, use `.github/modules/code-resolution.md`.
9. If a fix has been applied or proposed and verified, use `.github/modules/jira-report.md`.
10. If the developer asks for a Jira comment, use `.github/modules/jira-report.md`.

## Core investigation loop

For each important new fact from the developer, Jira, logs, code, commands, or tests:

1. Update the working context.
2. State what changed.
3. Reject assumptions that no longer fit.
4. Decide the next best action.
5. Load only the relevant module.

Visible update format:

```text
Context update:
- Confirmed: {new_fact}
- Changed assumption: {old_assumption} -> {new_assumption}
- Rejected path: {path}, because {reason}
- Next: {next_action}
```

## Mandatory initial information

At the beginning of a defect session, the skill needs:

1. The defect key.
2. The coding permission mode.

Coding permission modes:

- `read_only`: inspect, search, explain, and propose changes only.
- `can_edit`: modify code directly after plan validation.
- `one_time_override`: modify code only for one explicitly validated step.

Required prompt when permission mode is unknown:

```text
Pour cette session sur le defect {DEFECT_KEY}, est-ce que je reste en read-only, ou est-ce que j’ai le droit de modifier le code ?

Modes disponibles :
- read_only : analyse + propositions de changements uniquement.
- can_edit : je peux modifier le code directement après validation du plan.
- one_time_override : autorisation ponctuelle uniquement pour une étape précise.
```

The developer may revoke or change this permission at any time.

## MCP usage

Available MCPs may include:

- GitHub MCP

For Jira, use the configured token-based retrieval unless the developer explicitly says Jira MCP is available.

Do not suggest adding extra MCPs unless the developer asks.

Use GitHub MCP only when it helps inspect:

- linked pull requests,
- recent commits,
- touched files,
- review comments,
- repository context.

## Jira token behavior

Jira access is handled through configured environment variables or approved local secret storage.

Preferred environment variables:

- `JIRA_DOMAIN`
- `JIRA_API_TOKEN`
- `JIRA_AC_FIELD`

Never ask the developer to paste a Jira token directly in chat unless no safer option exists.

Never print secrets.

## Legacy-first rule

Before proposing a fix, check whether the codebase already has:

- a similar bug fix,
- a similar screen or service,
- an existing mapper, converter, validator, or helper,
- a known legacy compatibility rule,
- a historical workaround,
- a domain-specific convention,
- a test that documents the expected behavior.

If unclear, ask one focused question instead of inventing a new pattern.

Do not ask every legacy question blindly. Ask only what matters for the current defect.

Example:

```text
Avant de proposer un fix, je veux vérifier un point legacy : est-ce qu’il existe déjà un comportement historique connu autour de ce cas, ou un écran/service qui le gère correctement ailleurs ?
```

## Hard rules

- Never start coding before reproduction or context is clear enough.
- Never edit code before asking the permission mode.
- Never edit code before a plan has been validated.
- Never exceed 3 active hypotheses.
- Always provide at least 2 plausible hypotheses unless the root cause is already proven.
- Always record code paths as file, class/component/service, method/function, and approximate line when possible.
- Always ask the developer to choose or confirm the hypothesis before planning, unless the root cause is proven.
- Always validate the plan before implementation.
- Always ask before adding or changing unit tests.
- Always update context when new information contradicts earlier assumptions.
- Always prefer small, surgical, verifiable changes.
- Never print secrets.
- Never invent missing Jira fields.
- Never silently refactor unrelated code.
- Never replace existing corporate instructions unless explicitly requested.

## Planning rules

When a hypothesis is selected or the root cause is proven, produce a short plan.

The plan must include:

- assumptions,
- success criteria,
- files to inspect or modify,
- steps,
- verification for each step,
- risks.

The plan must stay short and actionable.
Detailed implementation, patch format, safe editing rules, verification commands, and unit test handling must be delegated to `.github/modules/code-resolution.md`.

Required format:

```text
Plan:

Assumptions:
- {assumption_1}
- {assumption_2}

Success criteria:
- {criterion_1}
- {criterion_2}

Steps:
1. {step_description}
   Files:
   - {file_1}
   Verify:
   - {verification_method}

2. {step_description}
   Files:
   - {file_2}
   Verify:
   - {verification_method}

Risks:
- {risk_1}

Do you validate this plan?
```

## Resolution

When implementation or patch proposal is needed, use `.github/modules/code-resolution.md`.

Do not implement or propose patches directly from this main skill file.
All coding, patch proposal, safe editing, verification, unit test decisions, and failed path handling must follow `.github/modules/code-resolution.md`.

## Reporting

When the investigation or fix is complete, use `.github/modules/jira-report.md`.
