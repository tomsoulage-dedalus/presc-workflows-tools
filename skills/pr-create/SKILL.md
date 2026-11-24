---
name: "pr-create"
description: "Publie les changements approuvés et crée ou retrouve une PR draft avec la base réelle du dépôt, un résumé factuel et les vérifications exécutées."
---

# PR Create

Lire d'abord le [contrat commun](../WORKFLOW.md).

## 1. Vérifier la destination et le contenu

- Vérifier `git`, `gh`, l'authentification GitHub, le dépôt distant et la branche.
  Ne pas installer d'outil automatiquement.
- Déterminer la base depuis la PR existante, la demande explicite ou la branche
  par défaut du dépôt, puis la confirmer si elle est ambiguë. Ne pas faire de
  fallback silencieux entre `develop` et `main`.
- Lire le périmètre Git complet, le plan et les résultats de vérification.
  Ne pas publier des modifications préexistantes sans rapport.
- Chercher une PR ouverte correspondant à la branche et au dépôt. Si elle
  existe, restituer son URL ; ne la modifier ou ne publier de nouveaux commits
  que si la demande l'autorise.
- Résoudre le ticket s'il existe et lire ses informations utiles via le contrat
  Jira. Dans un dépôt sans ticket, continuer sans Jira ; ne pas fabriquer de clé
  ni exiger les conventions propres à ORME.

## 2. Préparer la publication

Une demande explicite de créer la PR autorise le commit et le push des seuls
changements concernés. Sinon, présenter le périmètre et demander validation
avant publication.

Si des changements approuvés restent à committer, inspecter le diff staged,
ajouter uniquement leurs chemins explicites puis créer un commit descriptif.
Ne pas inclure un fichier qui mélange des changements utilisateur non approuvés :
demander comment le séparer. Inclure le trailer, sauf refus explicite :

```text
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

Pousser explicitement la branche avec son upstream (`git push --set-upstream
<remote> <branche>`), jamais avec force. Si le push échoue, s'arrêter et
présenter l'erreur ; ne pas afficher une publication réussie.

## 3. Rédiger et créer la PR draft

Titre et body en anglais. Respecter les conventions du dépôt cible.
Pour ORME avec ticket Jira, conserver le titre
`feat(HORME-XXXX): <summary> /fixed` ou
`fix(ORBISBUG-XXXX): <summary> /fixed` et le label `WORKFLOWS`.
Vérifier le label et le créer seulement si requis et autorisé ; signaler
tout échec, sans `|| true` masquant les erreurs.

Le body décrit :

1. Ticket et critères applicables, s'il y en a.
2. Problème résolu et changements de comportement.
3. Choix importants ou limites.
4. Commandes de vérification réellement exécutées, résultats et contrôles
   non exécutés avec leur raison.

Ne pas annoncer de tests passants sur la base d'un ancien résumé non vérifié,
cocher des AC sans preuve ou confondre lint et tests.

Créer avec `gh pr create --draft --base <base> --head <branche>` et le titre,
le body et les labels applicables. Vérifier ensuite avec `gh pr view` le dépôt,
la branche source, la base, le statut draft et l'URL.
Rendre l'URL et les éventuels blocages, sans recopier tout le body.
