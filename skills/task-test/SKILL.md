---
name: "task-test"
description: "Vérifie les tests impactés, ajoute les cas comportementaux manquants et diagnostique les échecs sans masquer les régressions ; utilise les runners réels du projet."
---

# Task Test

Lire d'abord le [contrat commun](../WORKFLOW.md).

## 1. Définir les comportements à vérifier

Lire le plan validé s'il existe, le périmètre Git complet et les fichiers
concernés, y compris les specs déjà modifiées. Identifier les modules propriétaires
et leurs commandes de test dans les configurations actuelles.

Retrouver les tests existants par nom et usages, mais aussi par dépendances et
scénarios : une modification de template, style, ressource ou configuration peut
impacter des tests sans modifier une classe TypeScript ou Java.

Lister les comportements introduits/corrigés, les risques de régression et les
cas limites utiles. Ne pas créer un test par fichier uniquement pour remplir
une couverture. Aucun test trouvé ou exécuté signifie « non vérifié ».

## 2. Exécuter les tests existants ciblés

Utiliser le runner installé et configuré dans chaque module, sans watch ni
installation opportuniste. Ne pas choisir Jest par défaut.
Regrouper les sélecteurs d'un même runner. Capturer les erreurs de compilation,
d'environnement et les assertions séparément.

Pour chaque échec, déterminer s'il provient :

- d'une régression introduite dans le code ;
- d'un test devenu obsolète suite à un changement de contrat **validé** ;
- d'un mock ou d'une fixture incorrecte ;
- d'un problème préexistant ou d'environnement, avec preuves si disponibles.

Ne jamais changer une valeur attendue, retirer une assertion, ignorer un test
ou ajouter un mock seulement pour obtenir du vert. Si le comportement attendu
est incertain, demander une décision. Si un correctif de production non déjà
approuvé est nécessaire, présenter le diagnostic et attendre l'accord.

## 3. Compléter les tests utiles

Si l'écriture ou la correction de tests n'est pas déjà autorisée par la demande
ou le plan, présenter les cas proposés et demander validation avant édition.

Ajouter quelques tests ciblés qui échoueraient sans le changement et démontrent
les entrées/sorties attendues. Éviter les tests de simple instanciation,
d'accesseurs triviaux ou du comportement du framework.

- Lire les règles de tests du dépôt et reprendre les patterns existants.
- Angular : utiliser les factories `*Sample` disponibles et des données fortement
  typées ; pas de `as unknown as` pour fabriquer une fixture.
- Java : suivre les règles JUnit/AssertJ du dépôt, ne pas mocker les mappers ;
  migrer un test JUnit 4 touché vers JUnit 5 avant d'y ajouter des cas si le dépôt
  l'exige.
- Rédiger les données et messages de test en anglais.

## 4. Vérifier le résultat

Relancer les tests concernés après correction, puis les contrôles de
compilation/type-check et format/lint applicables aux fichiers touchés.
Élargir seulement si les résultats ou les dépendances révèlent un risque.

Rapporter les comportements couverts, les commandes réellement exécutées,
les résultats et les cas non vérifiés. Si des échecs ou blocages subsistent,
le dire explicitement ; ne pas conclure « aucune régression » au-delà du
périmètre exécuté. Aucun commit ni push. La prochaine étape est `/code-review`.
