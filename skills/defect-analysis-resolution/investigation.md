# Investigation Module

## Purpose

Investigate the defect before building hypotheses or proposing code.

The goal is to understand the failing behavior, identify the likely area, and find relevant existing patterns in the codebase.

## Investigation principles

- Do not code yet.
- Do not assume the Jira description is fully accurate.
- Confirm the actual failing case.
- Prefer evidence over intuition.
- Search for existing patterns before proposing new logic.
- Treat legacy behavior as potentially intentional until proven otherwise.
- Do not ask every possible question. Ask only the next useful one.

## Developer initial lead

Before starting a broad investigation, ask whether the developer already has a lead.

Ask:

```text
Avant de lancer l’investigation large, est-ce que tu as déjà une piste à prioriser ?

Par exemple :
- un fichier ou une classe suspecte,
- une zone frontend ou backend,
- un workflow métier,
- un écran,
- une API,
- un log,
- un comportement legacy,
- un fix similaire déjà vu ailleurs.
```

If the developer provides a lead, prioritize it first.

The lead must be treated as a starting point, not as proven truth.

Update the working context:

```yaml
developer_lead:
  description: "{lead}"
  priority: "first_pass"
  status: "unverified"
```

Then investigate in this order:

1. Check the developer lead.
2. Look for evidence that supports it.
3. Look for evidence that contradicts it.
4. If the lead is confirmed, continue toward hypotheses or planning.
5. If the lead is contradicted, mark it as rejected and continue with the normal investigation flow.

Visible output:

```text
Developer lead registered:
- {lead}

How I will use it:
- I will inspect this path first.
- I will treat it as a priority, not as confirmed root cause.
- If evidence contradicts it, I will reject it and continue the investigation.
```

## Lead validation rule

A developer lead changes investigation priority, not evidence.

If the developer says the defect is probably frontend, still verify the API response when relevant.

If the developer points to a file, inspect it first, but also check callers, related services, tests, and equivalent legacy implementations.

If the lead is contradicted by evidence, explicitly mark it as rejected.

## Reproduction status

If reproduction status is unknown, ask:

```text
Est-ce que le bug a déjà été reproduit ?

1. Oui, exactement comme décrit dans Jira.
2. Oui, mais pas exactement avec les mêmes données ou étapes.
3. Non, pas encore reproduit.
4. Je ne sais pas.
```

## If reproduced exactly

Update the working context:

```yaml
reproduction:
  status: "reproduced"
  mismatch_with_ticket: false
```

Then classify the suspected area.

## If reproduced differently

Ask for the exact confirmed failing case:

```text
Donne-moi le cas exact qui casse réellement :
- données utilisées,
- écran ou API concerné,
- étapes,
- résultat obtenu,
- résultat attendu,
- logs visibles,
- environnement,
- version.
```

Then update the working context:

```yaml
reproduction:
  status: "partially_reproduced"
  mismatch_with_ticket: true
  confirmed_failing_case: "{confirmed_case}"
```

The confirmed failing case becomes more important than the original Jira description.

## If not reproduced or unknown

Do not jump into code.

Build a reproduction strategy:

```text
Reproduction strategy:
1. Validate environment/version from Jira.
2. Recreate data conditions from the ticket.
3. Try exact reported steps.
4. Check browser console and network calls if UI-related.
5. Check server logs if backend-related.
6. Compare actual behavior with expected behavior.
7. If still not reproduced, vary one parameter at a time.
```

Ask the developer to test the smallest useful reproduction path.

## Required failing case details

Try to identify:

- environment
- version
- user role/context
- screen or API involved
- exact data used
- expected result
- actual result
- browser console errors
- network response
- server logs
- whether it happens always or only in specific conditions
- whether it happens on all environments or only one
- whether it is linked to a recent change

## Area classification

Classify as one of:

- frontend
- backend
- both
- configuration
- data
- legacy behavior
- unknown

Use these heuristics:

- API response already wrong -> backend, data, or configuration likely.
- API response correct but UI wrong -> frontend likely.
- API response ambiguous and frontend transforms it -> both.
- Browser console error -> frontend likely.
- Server stacktrace or warning -> backend likely.
- Only one environment affected -> configuration, data, or deployment likely.
- Only one customer/context affected -> data, legacy, or configuration likely.
- Similar behavior exists in older screens -> legacy behavior or domain convention likely.

## Output format for area classification

```text
Suspected area: {frontend | backend | both | configuration | data | legacy behavior | unknown}

Evidence:
- {evidence_1}
- {evidence_2}

Uncertainty:
- {uncertainty_1}

Next investigation step:
{next_step}
```

## Legacy and existing-pattern check

Before proposing any fix, check whether the codebase already has a way to handle the same kind of behavior.

Investigate or ask about:

- similar bug fixes,
- similar screens,
- similar services,
- existing mappers, converters, validators, helpers,
- historical workarounds,
- compatibility rules,
- domain-specific conventions,
- tests documenting expected behavior.

Do not ask all of these questions blindly.

Ask only the most relevant focused question.

Useful question examples:

```text
Avant de proposer un fix, je veux vérifier un point legacy : est-ce qu’il existe déjà un comportement historique connu autour de ce cas ?
```

```text
Est-ce qu’il y a déjà un écran ou service qui gère ce cas correctement ailleurs ? Si oui, je vais m’en servir comme référence au lieu d’inventer un nouveau comportement.
```

```text
Est-ce que ce comportement peut être volontaire pour compatibilité legacy, ou c’est bien un bug confirmé ?
```

## Code search strategy

Search surgically.

Priority order:

1. defect key
2. error message
3. translation key
4. API endpoint
5. DTO field
6. JSON property
7. component or service name
8. domain entity
9. mapper or converter
10. validation rule
11. configuration key
12. similar behavior in another module
13. related tests

Useful commands:

```bash
rg "HDEFECT-12345|keyword|error message" .
rg "translation.key|apiEndpoint|dtoField" .
rg "ClassName|methodName|ComponentName" .
```

## DevTools usage

Use Chrome DevTools MCP only when useful for UI-related defects.

Use it to inspect:

- console errors,
- network requests,
- request payloads,
- response payloads,
- runtime UI state,
- DOM or visual behavior.

Do not use DevTools MCP for purely backend defects unless browser evidence is needed.

## GitHub MCP usage

Use GitHub MCP only when useful for:

- linked pull requests,
- recent commits,
- review comments,
- file history,
- related code paths.

Do not assume GitHub history proves the root cause. Use it as evidence, not as a prophecy delivered by the CI gods.

## Mandatory code path recording

Every relevant path must be recorded as:

```text
Path:
- {file} / {class_or_component}#{method_or_function} / around line {line}
- {file} / {class_or_component}#{method_or_function} / around line {line}
```

If line numbers are not verified, say "around line".

Never claim exact lines unless actually verified.

## Required investigation update

```text
Investigation update:

Confirmed facts:
- {fact_1}
- {fact_2}

Suspected area:
{frontend | backend | both | configuration | data | legacy behavior | unknown}

Evidence:
- {evidence_1}
- {evidence_2}

Legacy / existing-pattern check:
- {pattern_found_or_question}

Relevant code paths:
1. {file} / {class}#{method} / around line {line}
2. {file} / {class}#{method} / around line {line}

Uncertainty:
- {uncertainty_1}

Next inferred action:
{next_action}
```

## When to move to hypotheses

Move to `hypotheses.md` when:

- there is enough evidence to propose at least 2 plausible causes,
- or the root cause is not proven but code paths are identified.

If the root cause is already proven, skip hypothesis selection and produce a plan.
