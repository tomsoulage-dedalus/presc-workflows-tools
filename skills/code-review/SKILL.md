---
name: "code-review"
description: "Relit en lecture seule le périmètre Git complet, front et back, pour identifier les bugs, régressions et écarts fonctionnels étayés."
---

# Code Review

Lire d'abord le [contrat commun](../WORKFLOW.md).

## 1. Charger le contexte

Déterminer la base et le périmètre Git complet : commits de la branche,
changements staged, unstaged et nouveaux fichiers. Lire le plan validé, les
instructions, les leçons existantes et les résultats de vérification disponibles.

Ne pas limiter la review à Angular ou à `src/` : inclure les modules Java, les
tests, les ressources et les configurations pertinents. Lire le contexte des
lignes modifiées et les appelants nécessaires pour évaluer leur effet.

## 2. Chercher des problèmes démontrables

Priorité aux bugs de logique, régressions, contrats incompatibles, erreurs de
mapping, état partagé, concurrence, droits, comportements UI et tests qui
manquent le scénario demandé. Comparer les AC et, si pertinent, le comportement
GWT de référence.

Appliquer les règles du dépôt, mais distinguer un défaut fonctionnel d'une
remarque de style. Ne pas réclamer automatiquement une abstraction, une méthode
plus courte ou un commentaire de cast. Ne pas transformer une préférence de
rédaction en bug bloquant.

Chaque constat doit préciser :

- fichier et lignes exactes ;
- scénario déclencheur et impact ;
- preuve issue du code ou d'une vérification ;
- sévérité et correction minimale proposée.

Ne pas inventer de problème pour remplir un quota. Une hypothèse non confirmée
doit rester une question ou une limite, pas devenir un constat certain.

## 3. Restituer sans modifier

Présenter d'abord les constats, classés par gravité, puis les limites de la
review. En l'absence de constat, le dire sans prétendre avoir prouvé l'absence
de tout bug. Ne pas annoncer de tests exécutés s'ils ont seulement été lus.

La review est en lecture seule : ne pas corriger le code ni créer ou enrichir
automatiquement `.copilot/lessons.md`. Proposer une leçon seulement pour un
mécanisme durable et vérifié, sans duplication des règles ; son ajout requiert
validation.

Si des corrections sont nécessaires, attendre l'accord puis revenir à
l'implémentation et aux tests concernés. Sinon, `/pr-create` reste une étape
de publication explicitement déclenchée par l'utilisateur.
