---
name: "task-implement"
description: "Implémente un plan explicitement validé, prépare la branche si nécessaire et vérifie les changements avec les outils du projet, sans commit ni push."
---

# Task Implement

Lire d'abord le [contrat commun](../WORKFLOW.md).

## 1. Vérifier le plan et l'accord

Résoudre le ticket et lire son `ANALYZE.md`, les instructions applicables et les
leçons existantes. Ne pas imposer `/clear` : un rapport proposé ne conserve pas
à lui seul une validation donnée uniquement en conversation.

Vérifier que l'approche et le périmètre sont explicitement approuvés dans la
conversation ou consignés fidèlement dans le rapport. Sans plan, ou si l'accord
est absent/ambigu, présenter ce qui manque et demander validation via `ask_user`
avant de modifier quoi que ce soit. Ne pas continuer avec un simple avertissement.

## 2. Préparer la branche si nécessaire

- Si la branche courante est déjà celle de la tâche, la conserver.
- Sinon, proposer la base distante vérifiée et le nom de branche avant création :
  `main/presc/feature/<STORY_PARENTE>` ou `main/presc/bugfix/<ORBISBUG>`.
  Appliquer une autre convention si le dépôt cible la définit.
- Pour un changement sans Jira dans un autre dépôt, proposer un nom descriptif ;
  ne pas inventer de ticket.
- Obtenir l'accord sur la base et la destination. Ne pas créer la branche depuis
  un HEAD arbitraire. Privilégier un worktree si l'utilisateur veut conserver sa
  branche ou si son travail local empêcherait un basculement sûr.
- Vérifier les branches locales, distantes et les worktrees existants. Ne jamais
  écraser une branche ni faire de reset pour résoudre une divergence ; exposer
  les options et attendre la décision.

## 3. Implémenter le minimum validé

Identifier le périmètre front, back ou autre depuis le plan **et le code actuel**.
Relire les fichiers avant édition, réutiliser les mécanismes existants et
garder les changements chirurgicaux.

Les règles détaillées restent dans le dépôt : ne pas leur substituer une
checklist générique, un chemin `src/app/models` imposé ou des préférences de
types. Pour ORME, lire notamment les règles TypeScript spécifiques en plus des
règles front, et les règles de tests Java si des tests sont touchés.

Les tests ne sont pas interdits ici : ajouter ou adapter ceux qui sont nécessaires
pour démontrer le correctif. `/task-test` complète ensuite les cas manquants et
la recherche de régressions ; il ne dispense pas de vérifier l'implémentation.
Si le diagnostic impose un changement de comportement ou un périmètre nouveau,
le faire valider avant de l'appliquer.

## 4. Vérifier et rendre la main

Lancer les contrôles ciblés applicables du contrat commun, dont format/lint.
Inspecter le diff final et les effets des corrections automatiques.
Corriger les défauts introduits, sans nettoyer des problèmes préexistants
sans rapport.

Résumer le comportement modifié, les choix importants et les limites restantes.
Ne déclarer l'implémentation terminée que si les vérifications nécessaires ont
abouti ; sinon indiquer clairement le blocage. Ne pas créer de commit ni pousser.
La prochaine étape du parcours est `/task-test`.
