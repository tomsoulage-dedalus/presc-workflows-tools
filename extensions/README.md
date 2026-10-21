# Extensions Chrome

Extensions locales pour les revues GitHub, la qualification des tickets Jira et
le debug de l'Externally Driven Prescription (EDP).

## Catalogue

| Extension | Utilisation | Configuration |
|---|---|---|
| [GitHub PR Reviewers](github-pr-reviewers/README.md) | Ajouter un reviewer / assignee manuellement ou au hasard, gérer les indisponibilités et ouvrir le ticket Jira depuis le titre d'une PR | Token GitHub et membres de l'équipe dans les options |
| [Jira Root Cause](jira_root_cause/README.md) | Ajouter ou retirer des étiquettes `rc_` sur Jira Cloud, avec un maximum de deux root causes par ticket | Session Jira ouverte, aucun token à renseigner |
| [EDP PostMessage Debugger](edp-postmessage-extension/README.md) | Envoyer les messages `orme.*` de debug sur la page EDP active | Champs de la popup, aucun token à renseigner |

## Installation

Aucun build ni gestionnaire de paquets n'est nécessaire.

1. Cloner ce dépôt dans un dossier permanent.
2. Ouvrir `chrome://extensions` et activer le **Mode développeur**.
3. Cliquer sur **Charger l'extension non empaquetée**.
4. Sélectionner le dossier de l'extension souhaitée : `extensions/github-pr-reviewers`,
   `extensions/jira_root_cause` ou `extensions/edp-postmessage-extension`.
   Ne pas sélectionner le dossier parent `extensions`.
5. Suivre les instructions de configuration du README de l'extension, puis
   recharger la page concernée. Épingler les extensions avec popup si nécessaire.

Ne pas déplacer ni supprimer le dossier du dépôt après l'installation : le
navigateur charge les extensions depuis ces fichiers.

## Mise à jour

Récupérer la dernière version du dépôt, puis cliquer sur **Recharger** pour
l'extension dans `chrome://extensions`. Recharger également la page GitHub,
Jira ou EDP concernée.
