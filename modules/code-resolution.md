# Resolution Module

## Purpose

Implement or propose the actual defect resolution after the root cause is proven or a hypothesis has been selected and a plan has been validated.

This module handles:

- coding permission checks,
- read-only patch proposals,
- direct implementation when allowed,
- safe editing rules,
- verification,
- unit test decisions,
- failed path handling.

Use this module only after:

- Jira context has been loaded,
- reproduction or failing case is clear enough,
- investigation has identified the suspected area,
- either the root cause is proven or a hypothesis has been selected,
- an implementation plan has been validated by the developer.

## Core principle

Do not improvise during implementation.

The implementation must follow the validated plan and must not expand the scope unless new evidence proves the plan is incomplete.

If new evidence contradicts the plan, stop and update the context instead of forcing the fix.

## Permission modes

The session must have one of these modes:

- `read_only`
- `can_edit`
- `one_time_override`

If the permission mode is unknown, ask before doing anything.

```text
Pour cette résolution, est-ce que je reste en read-only, ou est-ce que j’ai le droit de modifier le code ?

Modes disponibles :
- read_only : je propose les changements exacts sans toucher aux fichiers.
- can_edit : je peux modifier les fichiers après validation du plan.
- one_time_override : je peux modifier uniquement l’étape validée, puis je repasse en read-only.
```

## Before coding

Before any code change, confirm:

- the selected hypothesis or proven root cause,
- the validated plan,
- files expected to change,
- verification method,
- current permission mode.

If any of these are missing, do not code.

Ask only for the missing information that blocks the implementation.

## Legacy and existing-pattern check

Before implementing, confirm that existing behavior has been checked.

Required check:

```text
Legacy / existing-pattern check:
- Similar existing implementation checked: {yes/no}
- Legacy behavior risk: {none/low/medium/high/unknown}
- Existing pattern to follow: {pattern_or_none}
```

If legacy behavior is unclear and the fix may change business behavior, ask a focused question:

```text
Avant de coder, je veux éviter de casser un comportement legacy : est-ce qu’on sait si ce comportement est volontaire historiquement, ou c’est bien confirmé comme bug ?
```

Do not block implementation for legacy questions if:

- the root cause is proven,
- the fix is local,
- the change does not alter business behavior,
- or the developer explicitly confirms the expected behavior.

## Safe editing rules

When editing is allowed:

1. Run:

```bash
git status --short
```

2. If there are unrelated local changes:

- report them,
- avoid touching those files,
- do not format the whole project.

3. Modify only the planned files.
4. Follow the existing local style.
5. Do not refactor unrelated code.
6. Do not rename files, methods, or variables unless required by the fix.
7. Remove only unused code introduced by the fix.
8. Do not remove pre-existing dead code unless explicitly requested.
9. Do not run destructive commands.
10. Do not push commits unless explicitly requested.

## Read-only resolution

In `read_only` mode, do not edit files.

Provide exact replacement blocks.

Required format:

```text
File: {path}
Class/component/service: {name}
Method/function: {name}
Approx lines: {lines}

Replace this code:
{old_code}

With this code:
{new_code}

Why:
{reason}

Verification:
{verification}
```

If the exact original code is not available, do not fake it.

Use this fallback:

```text
I cannot provide an exact replacement block because the current code was not fully visible.

Proposed change:
- In {file}, inside {method}, update {specific_logic} so that {expected_behavior}.

Expected shape:
{code_snippet}

Verification:
{verification}
```

## Direct implementation

In `can_edit` mode, after plan validation:

1. Check local changes with `git status --short`.
2. Apply only the validated changes.
3. Run the smallest relevant verification command.
4. Report changed files.
5. Report verification result.
6. Ask whether unit tests should be added or modified, unless tests were already part of the validated plan.

Output format:

```text
Implementation update:

Changed files:
- {file_1}
- {file_2}

What changed:
- {change_1}
- {change_2}

Verification:
- Command: {command}
- Result: {passed/failed/not run}
- Evidence: {short_evidence}

Context update:
- {context_update}

Tests:
{test_question_or_result}
```

## One-time override implementation

In `one_time_override` mode:

- modify only the approved step,
- do not continue to the next step automatically,
- after the step, return to `read_only`.

Output format:

```text
One-time override completed.

Step implemented:
{step}

Changed files:
- {file_1}

Verification:
- {verification_result}

Permission mode is now back to read_only.
```

## Verification strategy

Prefer the smallest meaningful verification.

Priority order:

1. targeted unit test,
2. existing focused test,
3. module-specific build,
4. lint/typecheck for touched frontend files,
5. manual UI/API reproduction,
6. browser network/console check,
7. server logs check.

Avoid:

- full monorepo builds unless necessary,
- broad formatting,
- unrelated snapshot updates,
- running slow suites without a reason.

## Verification examples

Backend Java:

```bash
mvn -pl {module-name} -Dtest={SpecificTest} test
```

Frontend Angular:

```bash
npm run test -- --watch=false
npm run lint
```

General checks:

```bash
git diff -- {file}
git status --short
```

Adapt commands to the repository conventions and corporate instructions.

## Unit test policy

Do not add or modify unit tests without asking, unless the developer already validated tests in the plan.

Ask:

```text
Pour cette étape, est-ce que tu veux que j’ajoute/modifie les TU, ou tu préfères d’abord valider manuellement le comportement ?
```

If the developer says yes:

- prefer modifying an existing relevant test,
- add the smallest test that proves the bug,
- do not broaden the test scope,
- follow `.github/instructions/backend/java-unit-testing.instructions.md` when relevant,
- follow frontend testing conventions when relevant.

If the developer says no:

- continue without test changes,
- provide the manual verification path.

## Failed implementation path

If the implementation fails, the test fails, or the selected hypothesis is contradicted, stop.

Do not keep patching randomly.

Output:

```text
This path is now rejected.

What failed:
- {failure}

What this tells us:
- {new_information}

Evidence:
- {log_or_test_or_code_evidence}

Rejected path:
- {path}, because {reason}

Next action:
- {new_action}
```

Then either:

- revise the plan if the root cause still stands,
- return to `hypotheses.md` if the hypothesis no longer stands,
- return to `investigation.md` if new evidence changes the suspected area.

## Partial success

If the fix works partially, say exactly what is fixed and what remains.

```text
Partial resolution:

Fixed:
- {fixed_behavior}

Still failing:
- {remaining_issue}

What this suggests:
- {new_information}

Next action:
- {next_action}
```

## Final resolution handoff

When implementation and verification are complete, move to `report.md`.

Provide:

- root cause,
- changed files,
- fix summary,
- verification,
- remaining risks,
- suggested Jira comment in English.
