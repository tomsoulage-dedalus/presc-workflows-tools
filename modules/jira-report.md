# Report Module

## Purpose

Produce concise summaries after investigation, fix proposal, implementation, or verification.

Use this module for:

- current investigation summaries,
- final defect resolution summaries,
- Jira-ready comments,
- rejected path summaries,
- handoff notes.

## Developer report

Use French.

Format:

```text
Defect:
{key}

Status:
{current_status}

Root cause:
{root_cause}

Fix summary:
- {change_1}
- {change_2}

Files impacted:
- {file_1}
- {file_2}

Verification:
- {check_1}: {result}
- {check_2}: {result}

Legacy / existing behavior:
- {what_was_checked_or_reused}

Remaining risks:
- {risk_or_none}

Next step:
{next_step}
```

## Jira comment

Use English unless the developer asks otherwise.

Keep it professional and concise.

Format:

```text
I investigated the issue and identified the root cause in {area}.

Root cause:
{short_root_cause}

Fix:
{short_fix_summary}

Verification:
{verification_summary}

Risk:
{risk_summary}
```

## Jira comment after investigation but before fix

Use when the defect has been investigated but not fixed yet.

```text
I investigated the issue and narrowed it down to {area}.

Current findings:
- {finding_1}
- {finding_2}

Most likely cause:
{most_likely_cause}

Next step:
{next_step}
```

## Jira comment when more information is needed

Use when the ticket is missing critical information.

```text
I started the investigation but the current ticket does not contain enough information to confirm the root cause.

Missing information:
- {missing_info_1}
- {missing_info_2}

Could you please provide these details so the issue can be reproduced and analyzed safely?
```

## Investigation status report

Use when no fix has been proposed yet.

```text
Current investigation status:
- {fact_1}
- {fact_2}

Most likely area:
{area}

Evidence:
- {evidence_1}
- {evidence_2}

Current hypotheses:
1. {hypothesis_1}
2. {hypothesis_2}
3. {hypothesis_3}

Legacy / existing-pattern check:
- {result_or_open_question}

Next step:
{next_step}
```

## Rejected path report

Use when a hypothesis, plan, or implementation path failed.

```text
Rejected path:
{path}

Reason:
{reason}

Evidence:
{evidence}

What this tells us:
{new_information}

Updated next step:
{next_step}
```

## Final defect resolution report

Use when the fix is complete and verified.

```text
Defect:
{key}

Root cause:
{root_cause}

Fix summary:
- {change_1}
- {change_2}

Files changed:
- {file_1}
- {file_2}

Verification:
- {test_or_manual_check_1}: {result}
- {test_or_manual_check_2}: {result}

Legacy / existing behavior:
- {what_was_checked_or_reused}

Remaining risks:
- {risk_or_none}

Suggested Jira comment:
{jira_comment_in_english}
```

## Verification wording

Use precise wording.

Good:

```text
Verification:
- Targeted unit test `MedicationServiceTest#shouldResolveNameWithoutRoute`: passed.
- Manual UI check on environment EOU4440E: API response is correct and displayed value matches expected result.
```

Avoid vague wording:

```text
Verification:
- Looks good.
```

Humanity has suffered enough from "looks good".

## If verification was not run

Be explicit.

```text
Verification:
- Not run.

Reason:
{reason}

Suggested verification:
- {suggested_check}
```

## If only manual verification is possible

Use:

```text
Verification:
- Automated verification not available for this case.
- Suggested manual check:
  1. {step_1}
  2. {step_2}
  3. {step_3}
```
