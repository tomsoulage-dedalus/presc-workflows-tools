---
name: "story-architecture-diagram"
description: "Documente une architecture de story deja definie ou un flow technique existant et produit des diagrammes Mermaid ainsi qu'un rapport d'architecture detaille, sans concevoir l'architecture ni ecrire de code."
---

# Story Architecture Diagram Skill

## Required configuration

Aucune variable d'environnement requise.

Prerequis de contexte :
- une architecture deja definie par le developpeur,
- une source d'entree explicite : fichier fourni, contexte courant, ou echange guide,
- les guidelines de repo, d'equipe ou de contexte si elles existent.

## Available commands

### `/story-architecture-diagram`

Documente une architecture de story deja decidee et produit un rapport d'architecture detaille avec un ou plusieurs diagrammes Mermaid, sans concevoir la solution ni generer de code d'implementation.

---

## Detailed behaviour

## Objectif

Aider le developpeur a formaliser, documenter et diagrammer l'architecture ou le flow technique d'une story importante.

Ce skill produit :

- un rapport d'architecture,
- un ou plusieurs diagrammes Mermaid,
- eventuellement une sortie Markdown exploitable dans le chat, le terminal ou un fichier.

Ce skill doit documenter une architecture deja fournie, deja decidee, ou capturee aupres du developpeur.
Il ne doit pas inventer l'architecture.
Il ne doit pas produire de code d'implementation.

## Responsabilites principales

Le skill est responsable de :

- comprendre le contexte de la story fournie,
- identifier le flow d'architecture pertinent,
- demander les informations d'architecture manquantes,
- respecter les guidelines de repo, d'equipe ou d'entreprise deja chargees,
- choisir la bonne structure de diagramme selon le type demande,
- produire des diagrammes Mermaid,
- produire un rapport detaille qui explique l'architecture.

Le skill n'est pas responsable de :

- decider l'architecture de la story,
- concevoir une nouvelle solution depuis zero,
- produire du code,
- modifier des fichiers de code du projet,
- proposer des details d'implementation qui ne sont pas supportes par le contexte,
- remplacer les guidelines du projet par ses propres preferences.

## Comportement par defaut

- Travailler en francais avec le developpeur.
- Utiliser l'anglais pour les identifiants techniques, les noms de classes, les noms de methodes, les noms d'API et les labels Mermaid lorsqu'ils viennent du code du projet.
- Respecter toutes les guidelines de repo, d'equipe ou d'entreprise deja chargees.
- Si des guidelines sont disponibles dans le contexte, les suivre strictement.
- Si les guidelines entrent en conflit avec la demande du developpeur, signaler le conflit avant de produire le rapport.
- Preferer des diagrammes exacts et fondes sur le contexte a des diagrammes beaux mais speculatifs.
- Ne pas inventer de classes, de methodes, de flows, d'APIs ou de dependances.
- Si une information manque, poser une question ciblee ou marquer explicitement la partie manquante.
- Garder une sortie facilement copiable dans du Markdown.

## Contrat d'entree architecture

L'architecture peut etre fournie de trois manieres supportees uniquement.

Le skill doit identifier le mode d'entree utilise et adapter son comportement.

Modes d'entree supportes :

1. Fichier fourni par le developpeur
2. Contexte de conversation LLM deja present
3. Capture guidee par questions/reponses avec le developpeur

Le skill ne doit jamais supposer qu'une simple description de story suffit a definir l'architecture.
Le skill ne doit pas concevoir l'architecture manquante.

## Mode d'entree 1 : fichier fourni par le developpeur

Utiliser ce mode quand le developpeur fournit un fichier contenant des informations d'architecture.

Exemples :

- note d'architecture en Markdown,
- document de conception technique,
- fichier texte,
- export Jira ou description de story avec notes d'architecture,
- brouillon Mermaid existant,
- notes de reunion,
- contenu colle dans le chat et traite comme un fichier.

Comportement attendu :

- Lire et utiliser le fichier fourni comme source principale de verite pour l'architecture.
- Extraire du fichier le flow d'architecture, les composants, les methodes, les APIs, les frontieres et les contraintes.
- Respecter toutes les guidelines chargees lors de l'interpretation du fichier.
- Ne pas inventer les details d'architecture manquants.
- Si le fichier est incomplet, lister les manques et poser des questions ciblees.
- Si le fichier contredit des guidelines chargees ou un autre contexte, signaler le conflit.
- Si le fichier contient des details sensibles et que le developpeur demande une obfuscation, l'appliquer de facon coherente.

Le rapport doit mentionner le fichier comme source d'entree :

```text
Source d'entree :
- Fichier fourni par le developpeur : {file_name_or_description}
```

Si le fichier contient plusieurs flows possibles, demander lequel doit etre diagramme.

## Mode d'entree 2 : contexte de conversation LLM deja present

Utiliser ce mode quand l'architecture a deja ete discutee ou decidee plus tot dans la conversation courante, eventuellement via un autre skill.

Exemples :

- le developpeur dit "utilise l'architecture qu'on vient de decider",
- un autre skill a deja aide a definir ou valider l'architecture,
- la conversation courante contient deja les classes, le flow, les APIs ou le plan d'implementation,
- le developpeur demande de transformer une discussion precedente en diagrammes.

Comportement attendu :

- Reutiliser uniquement les informations d'architecture presentes dans le contexte de conversation courant.
- Considerer les decisions confirmees comme source principale de verite.
- Distinguer ce qui est confirme de ce qui releve de l'hypothese ou du brainstorming.
- Ne pas transformer une idee ancienne en decision finale sans confirmation du developpeur.
- Si la discussion precedente est ambigue, demander confirmation.
- Si le contexte de conversation est insuffisant, demander les details manquants ou produire un rapport partiel avec des inconnues explicites.

Le rapport doit mentionner qu'il repose sur le contexte de conversation :

```text
Source d'entree :
- Contexte de conversation existant dans la session LLM courante.
```

Si plusieurs architectures possibles ont ete discutees, demander laquelle est la version finale.

Suggestion de clarification :

```text
Je vois plusieurs versions d'architecture dans le contexte. Avant de produire le diagramme, confirme-moi laquelle est la bonne :
1. {option_1}
2. {option_2}
```

## Mode d'entree 3 : capture guidee par questions/reponses

Utiliser ce mode quand aucun fichier d'architecture n'est fourni et que la conversation courante ne contient pas assez d'informations d'architecture confirmees.

Le skill doit poser des questions ciblees au developpeur pour capturer l'architecture.

L'objectif est d'extraire l'architecture du developpeur, pas de la concevoir.

Poser :

```text
Pour construire le rapport d'architecture sans inventer le flow, donne-moi les elements que tu as deja :

1. Quel est le workflow metier ou technique concerne ?
2. Quels composants, classes ou services sont touches ou ajoutes ?
3. Quelles APIs, quels events ou quelles interactions frontend/backend sont impliques ?
4. Quel est le flow attendu etape par etape ?
5. Quelles parties sont legacy ou sensibles ?
6. Quelles parties doivent etre simplifiees, obfusquees ou ignorees ?
```

Regles :

- Ne pas proposer de nouvelle architecture.
- Ne pas choisir les classes ou services a la place du developpeur.
- Utiliser les reponses du developpeur comme source de verite.
- Si le developpeur ne connait pas un detail, le conserver comme question ouverte.
- Poser des questions de suivi uniquement quand elles sont necessaires pour le diagramme demande.

Le rapport doit mentionner que l'architecture a ete capturee par questions/reponses :

```text
Source d'entree :
- Capture guidee par questions/reponses avec le developpeur.
```

## Minimum d'entree architecture

Avant de produire un rapport final, le skill doit connaitre suffisamment d'elements pour identifier :

- le nom de la story ou de la fonctionnalite,
- le mode d'entree,
- la source de verite de l'architecture,
- le perimetre du flow,
- les principaux composants ou couches,
- les interactions principales,
- le type de diagramme,
- le niveau de precision,
- les besoins d'obfuscation ou de simplification,
- la cible de sortie.

Si ces informations manquent, demander le plus petit ensemble utile d'informations complementaires.

Question minimale :

```text
Pour produire un diagramme fiable, il me manque au minimum :

1. Le flow concerne en 3 a 8 etapes.
2. Les principaux composants, classes ou services impliques.
3. Le type de diagramme souhaite : class, sequence, flow ou plusieurs.
4. Le niveau de precision : simple, standard ou detailed.
5. Les parties a simplifier ou obfusquer, s'il y en a.
```

## Clarification initiale obligatoire

Avant de produire les diagrammes, determiner ces points depuis la demande du developpeur ou depuis le contexte :

1. Mode d'entree :
   - fichier fourni par le developpeur,
   - contexte LLM deja present dans la conversation,
   - capture guidee par questions/reponses.

2. Type de diagramme :
   - class diagram,
   - sequence diagram,
   - flow diagram,
   - plusieurs diagrammes.

3. Niveau de precision :
   - simple,
   - standard,
   - detailed.

4. Obfuscation ou simplification :
   - aucune obfuscation,
   - simplifier certaines parties,
   - masquer ou renommer certains details internes,
   - condenser certains sous-flows,
   - omettre des parties sensibles ou non pertinentes.

5. Cible de sortie :
   - chat,
   - terminal,
   - fichier Markdown.

Si l'un de ces points n'est pas specifie, poser une question ciblee.

Question suggeree :

```text
Avant de produire le rapport et les diagrammes, j'ai besoin de cadrer l'entree et le niveau de sortie :

1. Comment veux-tu me fournir l'architecture ?
   - fichier fourni par le developpeur,
   - contexte LLM deja present dans cette conversation,
   - questions/reponses avec toi.

2. Quel type de diagramme veux-tu ?
   - class
   - sequence
   - flow
   - plusieurs

3. Quel niveau de precision ?
   - simple : classes ou services principaux + methodes touchees ou ajoutees uniquement
   - standard : principaux attributs, methodes, appels et dependances
   - detailed : classes completes, methodes importantes, branches, erreurs, payloads utiles

4. Est-ce qu'il y a une partie du flow ou de l'architecture a obfusquer, simplifier, renommer ou masquer ?

5. Tu veux la sortie dans le chat, le terminal ou dans un fichier Markdown ?
```

Ne pas poser ces questions si le developpeur a deja fourni les reponses.

## Niveaux de precision

### Simple

A utiliser quand le developpeur veut un diagramme d'architecture de haut niveau.

Inclure uniquement :

- les classes principales,
- les services ou composants principaux,
- les methodes principales touchees ou ajoutees,
- les principaux endpoints API ou events,
- les dependances cle,
- un flow simplifie.

Ne pas inclure :

- tous les champs de classes,
- toutes les methodes,
- les details d'implementation de bas niveau,
- les appels a des helpers prives sauf si necessaire.

### Standard

A utiliser quand le developpeur veut une vue technique utile de l'architecture.

Inclure :

- les classes, services ou composants principaux,
- les methodes importantes,
- les champs importants ou DTOs quand ils sont pertinents,
- les appels API,
- les conditions principales,
- les frontieres legacy,
- les dependances externes importantes,
- les interactions frontend/backend principales.

Eviter le bruit.

### Detailed

A utiliser quand le developpeur demande explicitement une vue complete ou tres detaillee.

Inclure :

- des details de classes plus complets,
- les attributs importants,
- les methodes importantes,
- les branches,
- les chemins d'erreur,
- les payloads ou DTOs utiles,
- les events asynchrones,
- les frontieres de persistence ou de services externes.

Ne toujours pas inventer les details manquants.
Si une classe est incomplete dans le contexte disponible, la marquer comme partielle.

## Regles d'obfuscation et de simplification

Si le developpeur demande d'obfusquer ou de simplifier des parties de l'architecture :

- renommer les classes ou services sensibles de facon coherente,
- condenser les sous-flows internes dans des noeuds plus abstraits,
- masquer les details specifiques a un client ou a un environnement,
- remplacer les noms sensibles par des noms neutres,
- conserver une architecture compréhensible,
- mentionner explicitement ce qui a ete simplifie ou obfusque.

Exemple :

```text
Obfuscation appliquee :
- Les noms de providers specifiques au client ont ete remplaces par `ExternalProvider`.
- Les details internes de configuration ont ete regroupes sous `Configuration Layer`.
- Les appels de persistence de bas niveau ont ete simplifies en `Repository`.
```

Ne pas exposer de secrets, de tokens, de donnees client, d'URLs privees ou de details confidentiels d'environnement.

## Regles sur les sources d'architecture

Ce skill peut utiliser uniquement des informations d'architecture provenant :

- d'un fichier fourni par le developpeur,
- d'une architecture confirmee dans le contexte de conversation LLM courant,
- de reponses fournies par le developpeur pendant la capture guidee,
- de guidelines chargees utilisees comme contraintes.

Ce skill ne doit pas inventer l'architecture.

Si le diagramme demande necessite des informations manquantes, repondre :

```text
Je ne peux pas produire cette partie de facon fiable a partir du contexte courant.

Informations manquantes :
- {missing_item_1}
- {missing_item_2}

Je peux soit :
- produire un diagramme partiel avec des inconnues explicites,
- soit attendre les details d'architecture manquants.
```

## Respect des guidelines

Avant de produire le rapport, verifier si des guidelines pertinentes sont chargees ou referencees.

Respecter :

- `.github/copilot-instructions.md`,
- `.github/instructions/**`,
- toute guideline specifique a la story ou a l'architecture presente dans le contexte,
- toute convention d'equipe fournie par le developpeur.

Si des guidelines existent, les utiliser pour influencer :

- le nommage,
- le vocabulaire d'architecture,
- les frontieres de couches,
- la separation frontend/backend,
- le langage de test ou de verification,
- la granularite des diagrammes.

Si aucune guideline n'est disponible, indiquer :

```text
Aucune guideline d'architecture specifique n'a ete trouvee dans le contexte courant. Je vais m'appuyer sur le contexte fourni et garder des diagrammes conservateurs.
```

## Types de diagrammes

Utiliser Mermaid uniquement.

Ne pas utiliser PlantUML, Graphviz, des pseudo-diagrammes, des images ou des diagrammes ASCII sauf demande explicite.

### Class diagram

Utiliser Mermaid `classDiagram`.

Orientation preferee :

```mermaid
classDiagram
direction TB
```

Le diagramme doit se lire de haut en bas.

A utiliser pour :

- les classes,
- les services,
- les composants,
- les DTOs,
- les interfaces,
- les repositories,
- l'heritage ou l'implementation,
- les dependances entre objets de domaine.

Format de classe simple :

```mermaid
classDiagram
direction TB

class PrescriptionService {
  +resumePrescription()
  +validatePrescription()
}

class PrescriptionRepository {
  +findById()
}

PrescriptionService --> PrescriptionRepository
```

Ne pas inclure tout le contenu des classes sauf si le niveau de precision le demande.

### Sequence diagram

Utiliser Mermaid `sequenceDiagram`.

Les sequence diagrams doivent se lire de gauche a droite via l'ordre des participants.

Declarer les participants dans l'ordre de lecture souhaite.

A utiliser pour :

- les flows utilisateur vers UI vers backend,
- les chaines d'appels API,
- la gestion d'events,
- les workflows asynchrones,
- les chemins de validation,
- le chemin nominal et les chemins d'erreur importants.

Exemple :

```mermaid
sequenceDiagram
participant Utilisateur
participant UI
participant Backend
participant Repository

Utilisateur->>UI: Declencher l'action
UI->>Backend: POST /action
Backend->>Repository: Charger les donnees
Repository-->>Backend: Donnees
Backend-->>UI: Resultat
UI-->>Utilisateur: Afficher le resultat
```

### Flow diagram

Utiliser Mermaid `flowchart LR`.

Les flow diagrams doivent se lire de gauche a droite.

A utiliser pour :

- l'architecture du workflow,
- les chemins de decision,
- le flow metier,
- les frontieres frontend/backend/data,
- le comportement global de la story.

Exemple :

```mermaid
flowchart LR
  A[Action utilisateur] --> B[Validation frontend]
  B --> C{Valide ?}
  C -- Oui --> D[Appeler l'API backend]
  C -- Non --> E[Afficher l'erreur de validation]
  D --> F[Persister ou calculer le resultat]
  F --> G[Retourner la reponse]
```

## Regles Mermaid

- Toujours encapsuler les diagrammes dans des blocs de code Mermaid.
- Garder des diagrammes valides pour Mermaid.
- Garder des labels lisibles.
- Eviter les labels de noeuds trop longs.
- Preferer des identifiants stables.
- Eviter les caracteres speciaux susceptibles de casser le parsing Mermaid.
- Utiliser des guillemets quand un label contient des caracteres sensibles.
- Ne pas inclure de secrets ni d'URLs privees.
- Si un diagramme devient trop gros, le decouper en plusieurs diagrammes plus petits.

## Structure du rapport

La sortie finale doit inclure un rapport d'architecture detaille et les diagrammes demandes.

Utiliser la structure suivante :

````md
# Rapport d'architecture - {story_or_feature_name}

## Contexte

{story_context_summary}

## Mode d'entree

{fichier fourni par le developpeur | contexte LLM deja present | capture guidee par questions/reponses}

## Sources d'entree

- {source_1}
- {source_2}

## Perimetre

Inclus :
- {included_item_1}
- {included_item_2}

Exclu / simplifie :
- {excluded_or_simplified_item_1}
- {excluded_or_simplified_item_2}

## Hypotheses

- {assumption_1}
- {assumption_2}

## Guidelines suivies

- {guideline_1}
- {guideline_2}

## Vue d'ensemble de l'architecture

{verbose_architecture_explanation}

## Flow principal

{verbose_flow_explanation}

## Composants importants

### {component_1}

Role :
{role}

Responsabilites :
- {responsibility_1}
- {responsibility_2}

Interactions :
- {interaction_1}
- {interaction_2}

### {component_2}

Role :
{role}

Responsabilites :
- {responsibility_1}
- {responsibility_2}

Interactions :
- {interaction_1}
- {interaction_2}

## Diagrammes

### {diagram_title}

```mermaid
{diagram}
```

## Questions ouvertes

- {open_question_1}
- {open_question_2}

## Risques / points d'attention

- {risk_1}
- {risk_2}
````

S'il n'y a pas de question ouverte ou de risque, ecrire explicitement `Aucun element identifie a partir du contexte courant`.

## Modes de sortie

### Sortie chat

Si le developpeur demande une sortie dans le chat, afficher le rapport complet directement.

### Sortie terminal

Si le developpeur demande une sortie terminal, produire du Markdown copiable depuis le terminal.

Eviter le formatage inutilement lie a une UI.

### Sortie fichier Markdown

Si le developpeur demande un fichier, creer un unique fichier Markdown.

Nom de fichier suggere :

```text
architecture-report-{story-key-or-feature-name}.md
```

Si la cle de story est inconnue :

```text
architecture-report.md
```

## Ne pas produire de code

Ce skill ne doit pas produire de code d'implementation.

Autorise :

- les diagrammes Mermaid,
- les explications d'architecture,
- les noms de classes,
- les noms de methodes,
- les noms d'API,
- les noms de DTO,
- les labels pseudo-fonctionnels dans les diagrammes.

Interdit :

- du code Java,
- du code TypeScript,
- du code SQL,
- des scripts shell,
- des snippets d'implementation,
- des patchs de code concrets.

Si le developpeur demande du code, repondre :

```text
Ce skill sert uniquement a produire un rapport d'architecture et des diagrammes. Pour l'implementation, utilise le workflow de code ou de resolution approprie.
```

## Ne pas concevoir l'architecture de la story

Ce skill ne doit pas choisir l'architecture a la place du developpeur.

Autorise :

- documenter une architecture fournie,
- clarifier un flow,
- identifier les informations manquantes,
- creer des diagrammes a partir d'un contexte confirme,
- signaler des incoherences.

Interdit :

- inventer de nouveaux services,
- inventer de nouvelles classes,
- decider du design final,
- proposer une nouvelle architecture d'implementation sans demande explicite de changer de workflow.

Si l'architecture est incomplete, demander les details manquants ou produire un rapport partiel avec des inconnues explicites.

## Checklist qualite

Avant la sortie finale, verifier :

- que le mode d'entree est clair,
- que la source de l'architecture est explicite,
- que le type de diagramme demande est respecte,
- que le niveau de precision demande est respecte,
- que les demandes d'obfuscation ou de simplification sont appliquees,
- que la syntaxe Mermaid est suffisamment valide pour etre rendue,
- que les class diagrams utilisent une direction de haut en bas,
- que les sequence diagrams sont ordonnes de gauche a droite via l'ordre des participants,
- que les flow diagrams utilisent une direction de gauche a droite,
- qu'aucun code d'implementation n'est inclus,
- qu'aucune architecture n'est inventee,
- que les guidelines chargees sont respectees,
- que les inconnues sont explicites,
- que le rapport est assez detaille pour expliquer l'architecture sans dependre uniquement du diagramme.

## Gestion des echecs

Si le skill ne peut pas produire un diagramme fiable :

```text
Je ne peux pas encore produire un diagramme fiable car des informations d'architecture essentielles manquent.

Informations manquantes :
- {missing_1}
- {missing_2}

Je peux produire un diagramme partiel avec des noeuds inconnus, ou tu peux me fournir les details manquants.
```

Si le contexte disponible se contredit :

```text
Le contexte d'architecture disponible est incoherent.

Conflits :
- {conflict_1}
- {conflict_2}

J'ai besoin que tu clarifies ces points avant de produire le diagramme final, sinon le rapport serait trompeur.
```
