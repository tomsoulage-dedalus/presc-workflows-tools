---
name: "start-task"
description: "Initialise le contexte de travail pour un ticket Jira : création de branche, puis appel à /jira-analyze pour l'analyse approfondie"
---

# Start Task Skill

## Required configuration

Variables d'environnement requises (dans `~/.bashrc`) :
- `JIRA_DOMAIN`: domaine Jira (e.g. `jira.dedalus.com`)
- `JIRA_API_TOKEN`: Jira Server Personal Access Token (PAT)

> Toujours exécuter `source ~/.bashrc` avant toute action pour charger les variables.

## Available commands

### `/start-task <TICKET>`

Initialise le contexte de travail pour un ticket Jira donné.

---

## Detailed behaviour

### Step 0 — Validation des variables d'environnement

```bash
source ~/.bashrc
```

Vérifier que `JIRA_DOMAIN` et `JIRA_API_TOKEN` sont définis.

Si l'une est manquante, afficher :
```
❌ Variables d'environnement manquantes :
   - JIRA_DOMAIN    (ex: jira.dedalus.com)
   - JIRA_API_TOKEN (Jira Server PAT)
Définis-les dans ~/.bashrc puis relance source ~/.bashrc.
```
Et **stopper l'exécution**.

### Step 1 — Détection du type et récupération du summary

Détecter le type depuis le préfixe du ticket :

| Préfixe du ticket | Type    | Préfixe de branche       |
|-------------------|---------|--------------------------|
| `HORME-`          | Story   | `main/presc/feature/`    |
| `HDEFECT-`        | Defect  | `main/presc/bugfix/`     |

Si le préfixe est inconnu → afficher `❌ Préfixe inconnu. Attendu : HORME-XXXX ou HDEFECT-XXXX` et stopper.

Récupérer uniquement le summary du ticket :

```bash
source ~/.bashrc

curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" \
  -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<TICKET>?fields=summary"
```

Extraire `SUMMARY` = `fields.summary`.

### Step 2 — Créer la branche git

Convention de nommage :
- **HORME-** (Story)  → `main/presc/feature/<TICKET>`
- **HDEFECT-** (Defect) → `main/presc/bugfix/<TICKET>`

```bash
git checkout -b <branch_prefix><TICKET>
```

Afficher la branche créée :
```
✅ Branche créée : <branch_name>
```

### Step 3 — Appeler /jira-analyze

Exécuter le skill `/jira-analyze <TICKET>` pour effectuer l'analyse approfondie :
- Lecture complète du ticket (description, AC, liens, attachments)
- Fetch des linked issues et documentation Confluence
- Investigation du codebase
- Génération des hypothèses de fix / hints d'implémentation
- Sauvegarde de l'ANALYZE.md

### Step 4 — Demander validation humaine

Terminer par :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✋ Ce plan te convient-il ?
   → Réponds "ok" pour lancer /implement-task
   → Ou précise les ajustements à apporter
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Ne pas continuer avant validation explicite.**

---

## Error handling

| Situation | Comportement |
|-----------|-------------|
| Variable d'env manquante | Afficher les variables requises et stopper |
| Préfixe de ticket inconnu | Afficher l'erreur et stopper |
| Ticket introuvable (404) | Afficher `❌ Ticket <TICKET> introuvable sur ${JIRA_DOMAIN}` et stopper |
| `git checkout` échoue | Afficher l'erreur git et stopper |
| `/jira-analyze` échoue | Afficher l'erreur et stopper |
