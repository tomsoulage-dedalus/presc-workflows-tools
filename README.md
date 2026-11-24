# presc-workflows-tools

Outils de développement pour ORME Prescription : skills GitHub Copilot CLI,
scripts utilitaires et extensions Chrome.

| Documentation | Description |
|---|---|
| [Skills](skills/README.md) | Skills GitHub Copilot CLI et workflow de développement |
| [Scripts](scripts/README.md) | Scripts utilitaires et documentation d'utilisation |
| [Extensions](extensions/README.md) | Extensions Chrome : reviewers GitHub, liens Jira, root causes et debug EDP |

## Workflow de développement

Cinq skills couvrent le parcours principal :
`task-analyze` → validation humaine → `task-implement` → `task-test` →
`code-review` → publication explicite avec `pr-create`.

`task-start`, `test-check`, `test-implement` et `code-lint` sont retirés :
la préparation de branche rejoint l'implémentation, les tests sont regroupés,
et le formatage/lint est intégré aux étapes qui modifient les fichiers.
Les skills spécialisés sont conservés.
Voir le [catalogue et la migration](skills/README.md#migration-des-anciennes-commandes).

## Extensions disponibles

| Extension | Fonctionnalités |
|---|---|
| [GitHub PR Reviewers](extensions/github-pr-reviewers/README.md) | Sélection ou tirage au sort d'un reviewer / assignee, gestion des indisponibilités et liens vers les tickets Jira |
| [Jira Root Cause](extensions/jira_root_cause/README.md) | Ajout et retrait des étiquettes de root cause sur les tickets Jira Cloud |
| [EDP PostMessage Debugger](extensions/edp-postmessage-extension/README.md) | Envoi des messages de debug EDP depuis une popup, sans passer par la console |

L'installation se fait en mode développeur, sans build. Voir le
[guide des extensions](extensions/README.md#installation).
