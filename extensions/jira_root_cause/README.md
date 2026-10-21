# jira_root_cause

Extension Chrome qui ajoute un bloc **Root cause** au-dessus du champ *Étiquettes* des tickets Jira.
Un clic sur une root cause ajoute l'étiquette `rc_<root cause>` au ticket (un second clic la retire). Maximum 2 par ticket.

Root causes disponibles : `code`, `spec_notdefined`, `spec_ambiguity`, `regression`, `design`, `integration`, `dependency`, `not-a-bug`, `not_reproduced`.

## Installation

1. Cloner ce dépôt dans un dossier permanent — l'extension se trouve dans `extensions/jira_root_cause/`.
2. Ouvrir `chrome://extensions` (ou `edge://extensions`) et activer le **Mode développeur**.
3. Cliquer sur **Charger l'extension non empaquetée** et sélectionner le dossier `extensions/jira_root_cause/`.
4. Recharger la page Jira.

Ne pas supprimer ni déplacer le dossier ensuite : Chrome le lit à chaque démarrage.

## Utilisation

- Fonctionne sur la page d'un ticket (`/browse/CLÉ`) et dans le panneau de la vue liste.
- Après un clic, la page se recharge pour afficher l'étiquette dans *Étiquettes*.
- En cas d'erreur (Jira indisponible, droits insuffisants…), le message s'affiche sous les root causes et rien n'est modifié.
- Les ajouts passent par vos droits Jira et apparaissent dans l'historique du ticket comme une modification normale.

## Mise à jour

Remplacer le contenu du dossier par la nouvelle version, puis cliquer sur ↻ (Recharger) sur l'extension dans `chrome://extensions`.

## Personnalisation

En haut de `content.js` : `TAGS` (liste), `MAX_SELECTED` (limite), `TITLE` (titre du bloc), `PREFIX` (préfixe des étiquettes).
