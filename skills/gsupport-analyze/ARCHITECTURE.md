# gsupport-analyze — schéma de fonctionnement

Document destiné aux développeurs qui utilisent ou font évoluer le skill.
La référence normative reste `SKILL.md` ; ce fichier n'en est que la vue d'ensemble.

> **À maintenir avec le skill.** Toute modification du flux dans `SKILL.md` (étapes, répartition
> orchestrateur / sous-agents, fichiers produits, catégories de qualification, cas d'erreur) doit
> être répercutée ici dans le même commit. Voir la section « Maintenir la documentation
> d'architecture » de `SKILL.md` pour la correspondance changement → schéma.

## 1. Principe

Une analyse GSUPPORT brasse un gros volume brut (issue.json complet, dizaines de commentaires,
pièces jointes et archives, recherches de code sur plusieurs repos). Tout garder dans une seule
conversation sature le contexte avant l'étape qui a justement besoin de tout voir : la
qualification.

D'où la règle structurante du skill :

> **La collecte est déléguée à des sous-agents, la décision reste chez l'orchestrateur.**
> Chaque sous-agent écrit son résultat complet dans un fichier de `/tmp/gsupport/<KEY>/` et ne
> renvoie qu'une synthèse de 30 lignes maximum.

## 2. Vue d'ensemble

```mermaid
flowchart TD
    U([Utilisateur]) -->|/gsupport-analyze GSUPPORT-XXXXX| E0

    subgraph ORCH["Orchestrateur — session courante"]
        E0["Étape 0<br/>Résoudre la clé depuis le message,<br/>valider le préfixe GSUPPORT-"]
        E1["Étape 1<br/>Permissions + vérif. du modèle"]
        E1B["Étape 1b — optionnelle<br/>Pré-analyse utilisateur :<br/>couche, domaine, repos exclus, piste"]
        E3["Étape 3<br/>Router le domaine, choisir les repos,<br/>filtrer par version, résoudre origin/branche"]
        E5["Étape 5 — QUALIFICATION<br/>jamais déléguée"]
        E6["Étapes 6 et 7<br/>Hypothèses, infos manquantes, actions"]
        E89["Étapes 8 et 9<br/>Écriture du rapport, jamais écrasé"]
    end

    subgraph SUB2["Étape 2 — sous-agent (modèle rapide)"]
        A2["collecte-ticket-jira-GSUPPORT-XXXXX"]
    end

    subgraph SUB4["Étape 4 — 1 sous-agent par repo, en parallèle (modèle fort)"]
        A4A["investigation-code-repo-A"]
        A4B["investigation-code-repo-B"]
        A4C["investigation-code-repo-C"]
    end

    E0 --> E1 --> E1B --> A2
    A2 -->|compte-rendu-jira.md| E3
    E3 --> A4A & A4B & A4C
    A4A & A4B & A4C -->|compte-rendu-code-repo.md| E5
    E5 --> E6 --> E89 --> R([".copilot/analyses/&lt;KEY&gt;-analyse.md"])

    CFG[(config.json<br/>domains, glossary,<br/>repositories, agents)] -.-> E3
    E1B -.->|périmètre imposé : repos écartés| E3
    CFG -.->|model + reasoningEffort| A2
    CFG -.->|model + reasoningEffort| A4A

    style E5 fill:#fde2e2,stroke:#c0392b,stroke-width:2px
    style CFG fill:#eef3fb,stroke:#4a6fa5
```

## 3. Qui fait quoi

| Bloc | Exécutant | Sortie |
|---|---|---|
| Étapes 0, 1, 1b — résolution et validation de la clé, permissions, modèle, pré-analyse utilisateur | orchestrateur | — |
| Étape 2 — collecte Jira (ticket, commentaires, pièces jointes, archives, liens) | 1 sous-agent, `agents.jiraCollect` | `compte-rendu-jira.md` |
| Étape 3 — routage domaine, sélection des repos, résolution de branche | orchestrateur | tableau affiché |
| Étape 4 — investigation du code | 1 sous-agent par repo, en parallèle, `agents.codeInvestigate` | `compte-rendu-code-<repo>.md` |
| Étapes 5 à 9 — qualification, hypothèses, rapport | orchestrateur | `<KEY>-analyse.md` |

Ne se délègue **jamais** :

- toute question à l'utilisateur (`ask_user`) — un sous-agent ne sait pas dialoguer ;
- la qualification (étape 5), raison d'être du skill ;
- l'écriture du rapport final.

## 4. Passage par fichiers — ce qui protège vraiment le contexte

```mermaid
flowchart LR
    subgraph TMP["/tmp/gsupport/&lt;KEY&gt;/ — matière brute, jetable"]
        J["issue.json<br/>comments.json<br/>remotelink.json"]
        PJ["pièces jointes<br/>extracted/&lt;archive&gt;/..."]
        DJ["compte-rendu-jira.md"]
        DC["compte-rendu-code-&lt;repo&gt;.md"]
    end

    A2["Sous-agent Jira"] --> J --> PJ --> DJ
    A4["Sous-agents code"] --> DC

    A2 -.->|synthèse ≤ 30 lignes| O["Orchestrateur"]
    A4 -.->|synthèse ≤ 30 lignes| O
    DJ -->|relecture ciblée<br/>## Symptôme, ## Commentaires| O
    DC -->|relecture ciblée<br/>## Verdict du repo| O
    O --> REP["&lt;KEY&gt;-analyse.md<br/>versionné dans le dépôt"]

    style REP fill:#e8f6ec,stroke:#2e7d4f
```

Un sous-agent qui recopie tout son travail dans sa réponse annule le bénéfice du découpage.
L'orchestrateur ne relit jamais un compte rendu entier d'un coup, et jamais le JSON brut.

## 5. Étape 2 en détail — lecture exhaustive des pièces jointes

Le point le plus souvent sous-estimé : une pièce jointe non lue est une information manquante,
et une archive laissée fermée est un échec de l'étape.

```mermaid
flowchart TD
    S["fields.attachment[]"] --> DL["curl sur le champ .content"]
    DL --> T{"Type de fichier"}

    T -->|png / jpg / gif| IMG["view — décrire l'écran,<br/>le message, l'horodatage"]
    T -->|docx| DOC["extraction du texte<br/>+ word/media/* (captures)"]
    T -->|xlsx| XLS["zipfile + xl/sharedStrings.xml"]
    T -->|pdf| PDF["pdftotext si disponible"]
    T -->|log / txt / xml / json| LOG["lecture, stacktraces, codes d'erreur"]
    T -->|zip / tar.gz / gz / 7z / rar| ARC["décompression obligatoire<br/>vers extracted/&lt;nom&gt;/"]

    ARC --> LOOP{"contient une<br/>autre archive ?"}
    LOOP -->|oui, max 3 niveaux| ARC
    LOOP -->|non| T2["chaque fichier extrait<br/>repasse par le même aiguillage"]
    T2 --> T

    IMG & DOC & XLS & PDF & LOG --> D["compte-rendu-jira.md<br/>+ ## Pistes de recherche"]
    KO["illisible / protégé /<br/>outil absent"] --> SIG["signalé explicitement<br/>jamais ignoré"]

    style ARC fill:#fff4e0,stroke:#b8860b,stroke-width:2px
    style SIG fill:#fde2e2,stroke:#c0392b
```

La section `## Pistes de recherche` du compte rendu (3 à 8 chaînes exactes : message d'erreur, libellé
d'écran, code, nom de bouton, classe d'une stacktrace) est le livrable le plus important de
l'étape 2 : c'est l'amorce des `git grep` de l'étape 4.

## 6. Étape 3 — du vocabulaire client au bon repo, sur la bonne branche

Le client écrit « impossible de stopper la ligne ». Le code, lui, s'appelle
`StopPrescriptionLineService`. L'étape 3 ne fait qu'une chose : cette traduction, puis elle en
déduit où chercher.

Trois questions, dans l'ordre.

**1. De quel objet technique parle le client ?** → `glossary` de `config.json`

| Le client dit | Le code dit |
|---|---|
| « la ligne », « prescription line », « Verordnungszeile » | `PrescriptionLine` |
| « si besoin », « SB », « PRN », « bei Bedarf » | `PrescriptionPrnForm` / `ifNeeded` |
| « validation pharma », « VP », « Apothekerfreigabe » | `PharmaValidationInfo` |

**2. Quel domaine métier ?** → `domains[].aliases` (FR / EN / DE)

« arrêt de prescription », « discontinue medication » et « Medikament absetzen » pointent tous le
domaine `arret-prescription`, qui fournit les repos (`orme-prescription`, `orme-prescription-api`),
les `paths` et les `grepSeeds` (`StopPrescriptionLineService`, `StopDialogBox`,
`referenceDateTime`).

Si aucun alias ne correspond, repli : lire la `description` de chaque repo et retenir le plus
plausible.

**3. Quelle version du produit ?** → champ `[G] Detected in Version` du ticket

Ce filtre n'arbitre qu'un seul choix, celui du référentiel médicament : ticket en 3.17 →
`orme-global-repo` (`versionRange` `<3.22`) ; ticket en 3.22 ou plus → `orme-medication-legacy`
(`>=3.22`). Les autres repos n'ont pas de `versionRange` et sont retenus tels quels.

Le résultat des trois questions est le **contrat remis à chaque agent de l'étape 4** : un repo, une
branche `origin/<branche>` résolue, des `paths`, des `grepSeeds`.

`paths` et `grepSeeds` sont des points de départ, pas un périmètre fermé : un agent qui ne trouve
rien dedans cherche au-delà et le signale. Un routage faux constaté se corrige dans `config.json`
dans la foulée.

Deux invariants de l'étape 4 qui découlent d'ici :

- **lecture seule sur les références distantes** — `git grep`/`show`/`ls-tree`/`log` sur
  `origin/<branche>`. Aucun `checkout`, `switch`, `stash`, `worktree`, `reset` ni `pull` : la
  branche courante et le travail non commité de l'utilisateur restent intacts ;
- **ne jamais chercher dans les fichiers du disque** — ils sont sur une branche quelconque, ce
  serait une analyse du mauvais code, donc une qualification fausse.

## 7. Étape 5 — la seule étape qui décide

```mermaid
flowchart TD
    IN1["compte-rendu-jira.md<br/>## Symptôme, ## Commentaires"] --> Q
    IN2["compte-rendu-code-*.md<br/>## Verdict du repo"] --> Q
    Q{"Qualification<br/>1 catégorie + confiance"}

    Q --> C1["Bug dans notre code → ORBISBUG"]
    Q --> C2["Configuration / données → support, déploiement"]
    Q --> C3["Comportement attendu → réponse fonctionnelle"]
    Q --> C4["Évolution → HORME"]
    Q --> C5["Informations insuffisantes → questions au client"]

    G1["Compte rendu muet ≠ preuve d'absence :<br/>vérifier ## Pistes non concluantes,<br/>refaire la recherche si le motif exact manque"] -.-> Q
    G2["Verdicts contradictoires, repo absent,<br/>PJ ou archive illisible → baisser la confiance"] -.-> Q
    G3["Ne jamais conclure « bug » par défaut<br/>faute d'information"] -.-> Q

    style Q fill:#fde2e2,stroke:#c0392b,stroke-width:2px
```

## 8. Reprise sur incident

| Situation | Comportement |
|---|---|
| Sous-agent en échec ou sortie vide | Ne pas le relancer : l'orchestrateur exécute le bloc lui-même et le signale dans le rapport |
| Modèle de `config.json` refusé | Relancer une fois sans le paramètre `model`, ne jamais bloquer l'analyse |
| Images non exploitables par le sous-agent | L'orchestrateur les regarde après coup, sans relancer tout le bloc |
| Archive non décompressable | `Archive non décompressée : <nom> — <raison>` dans le rapport |
| Rapport existant | Jamais écrasé : suffixe `-2`, `-3`… et mention de ce qui a changé |

## 9. Ce qu'il faut entretenir

`config.json` est la connaissance du skill, pas de la configuration figée. Il vieillit vite :

- `domains.aliases` — le vocabulaire réel des clients, en FR / EN / DE ;
- `glossary` — tout terme client rencontré et absent doit y être ajouté ;
- `domains.paths` et `grepSeeds` — à corriger dès qu'un chemin ne renvoie plus rien ;
- `repositories.versionRange` — à mettre à jour à chaque bascule de version ;
- `agents.*.model` — les identifiants de modèles évoluent, ils ne sont jamais en dur dans `SKILL.md`.

Une analyse qui révèle une lacune doit corriger `config.json` dans la foulée et le mentionner.
