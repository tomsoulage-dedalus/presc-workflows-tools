# Installer et mettre à jour les skills

## Prérequis

- GitHub Copilot CLI installé ; `git` et `gh` authentifié pour les étapes GitHub.
- Les outils de build/test du dépôt cible : les skills lisent ses configurations,
  ils n'installent pas un runner de remplacement.
- Pour les cinq skills du parcours principal utilisant Jira Cloud :
  `JIRA_DOMAIN` (par exemple `dedalus.atlassian.net`), `JIRA_EMAIL` et
  `JIRA_API_TOKEN`. Charger ces variables dans l'environnement sans committer
  leur valeur. Pour Jira Server, utiliser le domaine et le PAT de cette instance.
- Le skill spécialisé `gsupport-analyze` conserve son contrat Jira Server/PAT ;
  sa migration d'authentification n'est pas couverte par cette consolidation.

## Installation par liens personnels

Avoir les deux dépôts dans le même dossier parent :

```text
work/
  orme-prescription/
  presc-workflows-tools/
```

Depuis la racine de `presc-workflows-tools` :

```bash
bash skills/setup.sh
```

Le script :

- crée `orme-prescription/skills` vers `skills/` et exclut ce lien via
  `orme-prescription/.git/info/exclude` ;
- lie les dossiers contenant un `SKILL.md` dans `~/.copilot/skills/`,
  source de découverte personnelle de Copilot CLI ;
- lie aussi le contrat partagé `WORKFLOW.md`, pour résoudre les références
  relatives depuis les skills ;
- retire les quatre anciens liens uniquement s'ils pointent exactement vers
  les anciens dossiers de ce dépôt.

Le lien `orme-prescription/skills` est un raccourci de navigation ; la découverte
CLI repose sur les liens personnels. Les skills deviennent donc disponibles
aussi depuis les autres projets.

Un chemin actif déjà occupé par une copie ou un lien différent provoque une
erreur explicite : le setup ne le supprime pas. Sauvegarder ou déplacer le
contenu concerné avant de relancer. Avec un worktree Git pour le dépôt cible,
le chemin de l'exclusion est résolu via Git, pas supposé être `.git/info/exclude`.

Garder les dépôts à leur emplacement. Les liens reflètent les modifications
du dépôt ; relancer le setup lorsqu'un skill est ajouté ou retiré.
Si nécessaire, recharger la découverte dans Copilot CLI avec `/skills reload`.

## Migration

Après mise à jour du dépôt, relancer `bash skills/setup.sh`.

| Ancienne commande | Nouvelle utilisation |
|---|---|
| `/task-start` | `/task-analyze <TICKET>`, validation, puis `/task-implement` |
| `/test-check`, `/test-implement` | `/task-test` |
| `/code-lint` | Lint/format intégrés à l'implémentation et aux tests, ou commandes du projet |

Le setup ne retire ni les copies manuelles de ces anciens skills ni les liens
provenant d'un autre checkout. Il les signale pour inspection manuelle.
Ne supprimer une ancienne copie qu'après avoir vérifié son contenu et sa provenance.
Une ancienne installation copiée dans `.copilot/skills/` ou un autre répertoire
personnalisé n'est pas migrée automatiquement.

## Vérification

Depuis la racine de `presc-workflows-tools` :

```bash
ls -l ~/.copilot/skills/
# Parcours : task-analyze, task-implement, task-test, code-review, pr-create
# Spécialisés : gsupport-analyze, pr-fix-build, story-architecture-diagram
# Contrat partagé : WORKFLOW.md
bash skills/tests/setup.test.sh
```

Les tests utilisent un HOME et des dépôts temporaires, sans modifier
l'installation active.

## Alternative : copie locale dans un projet

```bash
cd /chemin/vers/le/projet
bash /chemin/vers/presc-workflows-tools/install-skills.sh
```

Le script copie les dossiers de skills et `WORKFLOW.md` dans `.github/skills/`
du répertoire courant, un emplacement de découverte projet pris en charge.
Il n'écrase pas une installation existante : sauvegarder/déplacer les chemins
signalés avant de réinstaller.

Les copies ne suivent pas les mises à jour du dépôt et les anciennes commandes
copiées doivent être inspectées puis retirées manuellement lors d'une migration.
L'installation ne configure pas d'exclusion Git : vérifier le statut du projet
avant de committer. Les autres sources de skills, dont les liens personnels,
ne sont pas modifiées.

## Désinstallation

Depuis la racine du dépôt, vérifier puis retirer le raccourci :

```bash
readlink ../orme-prescription/skills
unlink ../orme-prescription/skills
```

Inspecter les liens personnels et retirer uniquement ceux de ce dépôt, par exemple :

```bash
readlink ~/.copilot/skills/task-test
unlink ~/.copilot/skills/task-test
```

Faire de même pour les autres skills de ce dépôt et le lien `WORKFLOW.md`.
Ne pas supprimer les skills provenant d'autres sources.
Retirer la ligne `skills` de l'exclusion locale si elle n'est plus utile.
Pour une installation copiée, inspecter chaque chemin avant de retirer uniquement
les fichiers installés dans le projet.
