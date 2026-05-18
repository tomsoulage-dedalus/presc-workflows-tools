# presc-workflows-tools

Prescription workflow repository with IA tools, methods, scripts.

## Installation des Copilot Skills

### Première fois (ou après perte des skills)

```bash
# Depuis la racine de votre projet (ex: orme-prescription)
git clone git@github.com:tomsoulage-dedalus/presc-workflows-tools.git /tmp/presc-workflows-tools
bash /tmp/presc-workflows-tools/install-skills.sh
```

### Skills disponibles

| Skill | Description |
|-------|-------------|
| `start-task` | Initialise le contexte de travail pour un ticket Jira |
| `jira-analyze` | Analyse approfondie d'un ticket Jira |
| `implement-task` | Implémente le code en s'appuyant sur les règles et le plan |
| `test-check` | Lance les specs impactées par les changements |
| `lint-check` | Lance ESLint sur les fichiers modifiés, puis git push |
| `review-code` | Review IA du diff basée sur les règles front |
| `create-pr` | Crée la Pull Request GitHub |

> **Note** : Le dossier `.copilot/` est ignoré par git (`.git/info/exclude`).
> Les skills sont stockés ici pour pouvoir les restaurer facilement.
