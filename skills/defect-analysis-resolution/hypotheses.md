# Hypotheses Module

## Purpose

Build and compare plausible root-cause hypotheses from the available evidence.

Use this module only after the investigation has produced enough context.

## Rules

- Produce 2 to 3 active hypotheses.
- Do not exceed 3 active hypotheses.
- Do not invent evidence.
- Each hypothesis must include a verification method.
- Each hypothesis must consider existing or legacy behavior.
- Reject hypotheses when evidence contradicts them.
- If one root cause is already proven, do not force fake hypotheses.
- Do not implement anything from this module before a plan is validated.

## Evidence requirements

Each hypothesis must be backed by at least one of:

- Jira field or comment,
- confirmed reproduction step,
- API response,
- browser console or network evidence,
- server log,
- code path,
- existing test,
- similar legacy behavior,
- related commit or PR.

If a theory has no evidence, keep it as an open question, not as an active hypothesis.

## Hypothesis format

```text
Hypothesis {n}: {short_title}

Why it is plausible:
- {evidence_1}
- {evidence_2}

Weak points:
- {weakness_1}

Legacy / existing-pattern impact:
- {known_pattern_or_uncertainty}

Code path:
- {file} / {class_or_component}#{method_or_function} / around line {line}
- {file} / {class_or_component}#{method_or_function} / around line {line}

How to verify:
- {verification_step}

Expected fix scope:
- Area: {frontend | backend | both | configuration | data}
- Size: {small | medium | risky}
- Risk: {risk_description}

Confidence:
{low | medium | high}
```

## Confidence guide

Use `high` only when:

- reproduction is confirmed,
- the code path is identified,
- evidence strongly points to this cause,
- verification is straightforward.

Use `medium` when:

- evidence is plausible,
- code paths are identified,
- but one or more assumptions remain.

Use `low` when:

- the theory is possible,
- but evidence is weak or indirect.

## More than 3 hypotheses

If more than 3 plausible hypotheses exist, do not dump all of them.

Run a triage cycle.

Ask only the useful questions for the current defect.

Possible elimination questions:

```text
J’ai trop de pistes plausibles. Pour éviter de jouer à la roulette russe avec le codebase, il faut réduire.

Questions utiles :
1. Est-ce que la réponse API contient déjà la mauvaise valeur ?
2. Est-ce que le problème existe dans un autre écran similaire ?
3. Est-ce que ça arrive uniquement sur un environnement ?
4. Est-ce qu’il y a un comportement legacy connu ici ?
5. Est-ce qu’un fix similaire existe déjà dans un autre module ?
6. Est-ce que le problème est apparu après une modification récente ?
```

After the developer answers, reject hypotheses that no longer fit.

Rejected hypothesis format:

```text
Rejected hypothesis: {title}

Reason:
{reason}

Evidence:
{evidence}
```

## Selection

After presenting hypotheses, recommend one.

Required format:

```text
Voici les théories les plus plausibles :

1. {hypothesis_1_title}
2. {hypothesis_2_title}
3. {hypothesis_3_title}

Je recommande de commencer par l’hypothèse {n}, parce que {reason}.
```

The developer may choose another hypothesis.

Do not implement before:

- a hypothesis is selected,
- or the root cause is proven,
- and a plan is validated.

## If the root cause is proven

Skip fake hypothesis generation.

Use this format:

```text
Root cause appears proven.

Evidence:
- {evidence_1}
- {evidence_2}

Code path:
- {file} / {class_or_component}#{method_or_function} / around line {line}

Legacy / existing-pattern check:
- {result}

Next:
I will produce a short implementation plan before any code change.
```

## Planning after selection

After the developer selects a hypothesis, create a plan.

The plan must be:

- short,
- ordered,
- testable step by step,
- limited to necessary files,
- consistent with existing code style,
- consistent with legacy behavior,
- explicit about verification.

Plan format:

```text
Plan for selected hypothesis: {hypothesis_title}

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

## Read-only implementation proposal

If the session is `read_only`, provide exact replacement blocks.

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

## If selected hypothesis fails

Do not force the plan forward.

Update context:

```text
This path is now rejected.

What failed:
- {failure}

What this tells us:
- {new_information}

Rejected path:
- {path}, because {reason}

Next action:
- {new_action}
```

Then either:

- revise the plan if the hypothesis still stands,
- or return to hypothesis selection if it no longer stands.
