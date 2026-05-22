# Jira Intake Module

## Purpose

Retrieve the Jira defect using the configured Jira token, then produce a clear working summary.

This module only handles Jira loading and summarization.
It must not perform code investigation or propose fixes.

## Token rules

Preferred environment variables:

```bash
JIRA_DOMAIN
JIRA_API_TOKEN
JIRA_AC_FIELD
```

Never ask the developer to paste a token directly in chat.

Never print:

- Jira token
- Authorization header
- cookies
- private session IDs
- full confidential URLs unless necessary

If the token is missing, ask the developer to configure it outside the chat.

Suggested message:

```text
Je n’ai pas accès au token Jira. Configure-le dans une variable d’environnement comme JIRA_API_TOKEN, puis relance la récupération du defect. Ne colle pas le token ici.
```

## Retrieval

Given a defect key, retrieve the issue using the company Jira domain and token.

Default command:

```bash
curl \
  -H "Authorization: Bearer $JIRA_API_TOKEN" \
  -H "Accept: application/json" \
  "https://$JIRA_DOMAIN/rest/api/2/issue/$DEFECT_KEY?expand=renderedFields,changelog"
```

If the company setup uses another authentication method, adapt locally without exposing secrets.

## Required extracted fields

Try to extract:

- key
- title / summary
- status
- priority / severity
- assignee
- reporter
- creation date
- last update date
- affected version
- fix version
- labels
- components
- description
- reproduction steps
- expected result
- actual result
- environment
- attachments
- comments
- linked issues
- related pull requests if visible

Do not invent missing fields.

## Jira summary output

After retrieving the ticket, display this summary before any code analysis:

```text
Defect loaded: {DEFECT_KEY}

Title:
{title}

Status / Priority:
{status} / {priority}

Affected version:
{affected_version}

Fix version:
{fix_version}

Environment:
{environment}

Reported problem:
{short_summary}

Reported reproduction steps:
1. {step_1}
2. {step_2}
3. {step_3}

Expected result:
{expected_result}

Actual result:
{actual_result}

Important comments / updates:
- {comment_summary_1}
- {comment_summary_2}

Attachments:
- {attachment_summary_1}
- {attachment_summary_2}

Linked issues / PRs:
- {linked_item_1}
- {linked_item_2}

Missing or unclear from Jira:
- {missing_field_1}
- {missing_field_2}

Initial uncertainty:
- {uncertainty_1}
- {uncertainty_2}

Next inferred action:
{next_action}
```

If there are no comments, attachments, linked issues, or PRs, state it explicitly.

## After Jira loading

Do not start coding.

Infer the next action:

- If reproduction status is unknown, ask about reproduction.
- If the ticket is UI-related, move to `investigation.md` and determine whether the API response is correct.
- If the ticket is backend/data-related, move to `investigation.md` and look for logs, payloads, environment details, and existing domain patterns.
- If the ticket is missing critical data, ask only for the missing information that blocks progress.

## Minimal reproduction question

If reproduction status is unclear, ask:

```text
Est-ce que le bug a déjà été reproduit ?

1. Oui, exactement comme décrit dans Jira.
2. Oui, mais pas exactement avec les mêmes données ou étapes.
3. Non, pas encore reproduit.
4. Je ne sais pas.
```

## Working context update

After loading Jira, update the working context:

```yaml
jira_defect:
  key: "{DEFECT_KEY}"
  title: "{title}"
  status: "{status}"
  priority: "{priority}"
  affected_version: "{affected_version}"
  fix_version: "{fix_version}"
  labels: []
  components: []
  environment: "{environment}"
  description_summary: "{short_summary}"
  reproduction_steps: []
  expected_result: "{expected_result}"
  actual_result: "{actual_result}"
  important_comments: []
  attachments: []
  linked_issues: []
  missing_fields: []
```
