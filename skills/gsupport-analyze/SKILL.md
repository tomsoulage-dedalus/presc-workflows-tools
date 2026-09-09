---
name: "gsupport-analyze"
description: "Analyse d'un ticket client GSUPPORT : lit le ticket, tous les commentaires et toutes les pièces jointes, investigue le code, qualifie la nature du problème (bug / config / comportement attendu / évolution) et sauvegarde un GSUPPORT.md — sans créer de branche ni de PR"
---

# GSupport Analyze Skill

Skill dédié aux tickets **clients** du projet Jira `GSUPPORT` (Global Customer Support).

Un ticket GSUPPORT n'est **pas** un ticket de développement : c'est une remontée client brute.
L'objectif de ce skill n'est pas de produire un plan d'implémentation, mais de **qualifier** la
demande avant qu'elle ne devienne (ou non) un `ORBISBUG` ou un `HORME`.

> Pour les tickets de développement (`HORME-`, `ORBISBUG-`), utiliser `/task-analyze`.

## Installation

À faire une seule fois sur un nouveau poste.

**1. Variables Jira** dans `~/.bashrc` (chacun génère son propre PAT depuis son profil Jira) :

```bash
export JIRA_DOMAIN="jira.dedalus.com"
export JIRA_API_TOKEN="<PAT Jira Server personnel>"
```

**2. Chemins des repos** — au premier lancement, si les repos ne sont pas trouvés, le skill
**demande où ils se trouvent** et propose d'enregistrer la réponse dans `config.json`. Rien à
préparer donc, mais il reste possible de renseigner `reposDir` à l'avance, ou d'exporter
`REPOS_DIR` qui est prioritaire.

**Aucun repo n'est à cloner à l'avance** : à chaque analyse, le skill affiche l'état des repos
(présent, branche de la version disponible) et indique lesquels sont **requis pour ce ticket
précis**, avec la commande `git clone` correspondante. Un repo absent mais non pertinent n'est pas
signalé comme un problème.

**3. Lier le skill** : `bash skills/setup.sh` depuis la racine de `presc-workflows-tools`.

**Outils requis** : `curl`, `jq`, `python3`, `unzip` — tous standards, aucun paquet à installer.
`pdftotext` est optionnel (sans lui, les PDF joints sont signalés comme non exploitables).

## Configuration requise

- `JIRA_DOMAIN` : domaine Jira (ex. `jira.dedalus.com`)
- `JIRA_API_TOKEN` : Personal Access Token Jira Server

> Les variables sont définies dans `~/.bashrc`. **Toujours lancer `source ~/.bashrc`** avant toute action.

### `config.json` — la connaissance du skill

`config.json`, situé dans ce même dossier, est la **seule** source de vérité. Rien n'est en dur
dans ce fichier-ci : ni un chemin, ni un nom de repo, ni une correspondance version → repo.

| Bloc | Rôle | Utilisé à l'étape |
|---|---|---|
| `reposDir`, `reportDir` | où sont les repos, où écrire le rapport | 3, 8 |
| `agents`, `orchestratorModel` | modèles des sous-agents et modèle attendu pour la qualification | 0, 2, 4 |
| `domains` | routage métier : `aliases` client, `repos`, `paths`, `grepSeeds` | 3.1, 4 |
| `glossary` | jargon client → terme technique | 3.1 |
| `i18nHint` | où se trouvent réellement les libellés affichés | 4.1 |
| `repositories` | rôle de chaque repo, URL de clone, `versionRange` | 3 |

Les trois blocs de connaissance — `domains`, `glossary`, `i18nHint` — sont ceux qui font la
différence entre une recherche ciblée et une recherche à l'aveugle. **Ils vieillissent** : les
tenir à jour au fil des tickets fait partie du travail d'analyse, pas d'une maintenance à part.

Chaque entrée de `repositories` porte `name`, `path` (relatif à `reposDir`) et `description`.

```bash
SKILL_DIR=$(dirname "$(readlink -f ~/.copilot/skills/gsupport-analyze/SKILL.md)")

# reposDir vient de config.json ; la variable d'environnement REPOS_DIR reste prioritaire.
REPOS_DIR="${REPOS_DIR:-$(jq -r '.reposDir // ""' "$SKILL_DIR/config.json")}"
REPOS_DIR="${REPOS_DIR/#\~/$HOME}"

# Un dossier n'est valide que s'il contient au moins un des repos declares.
is_valid_repos_dir() {
  [ -d "$1" ] || return 1
  jq -r '.repositories[].path' "$SKILL_DIR/config.json" \
    | while read -r p; do [ -d "$1/$p" ] && echo found; done | grep -q found
}

if is_valid_repos_dir "$REPOS_DIR"; then
  echo "reposDir : $REPOS_DIR"
else
  echo "INTROUVABLE : $REPOS_DIR"
  # Pistes a proposer a l'utilisateur.
  for candidate in "$HOME/work" "$HOME/repos" "$HOME/dev" "$HOME/SourceRepo"; do
    is_valid_repos_dir "$candidate" && echo "candidat : $candidate"
  done
fi
```

**Si le dossier est introuvable ou ne contient aucun repo déclaré : demander à l'utilisateur.**
Ne jamais deviner silencieusement, et ne jamais poursuivre l'investigation de code sur un chemin
non confirmé — une recherche dans le vide produirait une conclusion fausse.

1. Poser la question avec l'outil `ask_user`, en proposant les candidats détectés ci-dessus comme
   choix, plus une saisie libre :
   *« Où se trouvent tes repos ORME ? Le chemin configuré `<reposDir>` est introuvable. »*
2. Valider la réponse avec `is_valid_repos_dir`. Si elle ne contient aucun repo déclaré, le dire
   et redemander **une** fois.
3. Une fois le chemin validé, **proposer de l'enregistrer** dans `config.json` pour ne plus avoir
   à le demander (écriture sur un fichier existant → confirmation requise) :

   ```bash
   tmp=$(mktemp)
   jq --arg d "$REPOS_DIR" '.reposDir = $d' "$SKILL_DIR/config.json" > "$tmp" \
     && mv "$tmp" "$SKILL_DIR/config.json"
   ```

4. Si l'utilisateur décline la question ou n'a pas les repos en local : poursuivre l'analyse Jira
   **sans** investigation de code, et l'indiquer clairement dans le rapport
   (`Investigation du code non réalisée : repos non disponibles`) plutôt que de conclure
   `Aucun code pertinent identifié.`, qui serait trompeur.

Lister les repos disponibles une fois `REPOS_DIR` validé :

```bash
jq -r '.repositories[] | "\(.name)\t\(.description)"' "$SKILL_DIR/config.json"
```

Un ticket GSUPPORT ne se limite presque jamais au repo courant : le message d'erreur peut venir
de `orme-prescription-api`, un libellé de `orme-common`, une règle historique de
`orme-medication-legacy`. **Sélectionner les repos à fouiller à l'étape 3**, en confrontant le
symptôme aux `description` de `config.json`. Ignorer un repo absent du disque sans bloquer, et
lister les repos ignorés dans le rapport.

Si `config.json` déclare une entrée pointant vers un fichier de **schéma de base de données**
(markdown), le consulter **uniquement au `grep`** pour retrouver une table ou une colonne — ne
jamais le lire en entier.

## Exécution autonome

| Pré-autorisé — exécuter sans demander | Demande confirmation |
|---|---|
| Appels Jira en lecture (`curl` GET) | Écriture sur un fichier existant |
| Téléchargement des pièces jointes dans `/tmp` | Suppression de fichiers |
| `grep`, `glob`, `view`, lecture de fichiers | Utiliser une branche autre que celle de la version |
| Extraction d'archives dans `/tmp` | Installation de paquets |
| `git grep`, `git show`, `git log`, `git ls-tree`, `git rev-parse` sur `origin/<branche>` | Commit / push |
| `git fetch origin` (met à jour les refs distantes uniquement) | |
| Lancement des sous-agents de collecte (étapes 2 et 4) | |
| Création du dossier de rapport et écriture d'un **nouveau** fichier | |

**Interdit** dans les repos de l'utilisateur, même avec son accord : `git checkout`, `git switch`,
`git stash`, `git worktree`, `git reset`, `git pull`, ou toute commande modifiant la branche
courante, le working tree ou les stashes. Tout est faisable en lecture seule sur `origin/<branche>`.

Ne jamais demander « je continue ? » pour une opération pré-autorisée.

Si l'utilisateur a accepté `/allow-all` à l'étape 0, ce tableau reste la règle de conduite : les
opérations de la colonne de droite continuent d'être annoncées et validées explicitement.

## Architecture d'exécution — orchestrateur et sous-agents

Une analyse GSUPPORT brasse beaucoup de matière brute : un `issue.json` complet, des dizaines de
commentaires, des pièces jointes, puis des recherches de code sur plusieurs repos. Tout garder dans
une seule conversation sature le contexte avant la qualification, qui est justement l'étape qui a
besoin de tout voir.

Le skill est donc découpé : la **collecte** est déléguée à des sous-agents, la **décision** reste
chez l'orchestrateur.

| Bloc | Exécutant | Sortie |
|---|---|---|
| Étapes 0, 1 — permissions, modèle, validation de la clé | orchestrateur | — |
| Étape 2 — collecte Jira (ticket, commentaires, pièces jointes, liens) | **1 sous-agent** (modèle rapide) | `digest-jira.md` |
| Étape 3 — sélection des repos, diagnostic, résolution de branche | orchestrateur | tableau affiché |
| Étape 4 — investigation du code | **1 sous-agent par repo retenu**, en parallèle (modèle fort) | `digest-code-<repo>.md` |
| Étapes 5 à 9 — qualification, hypothèses, rapport | orchestrateur | `GSUPPORT.md` |

### Règle du passage par fichiers

C'est elle qui protège réellement le contexte, plus encore que le découpage lui-même.

Chaque sous-agent **écrit son résultat complet dans un fichier** sous `/tmp/gsupport/<ISSUE_KEY>/`
et ne **renvoie qu'une synthèse courte** (30 lignes maximum) à l'orchestrateur. L'orchestrateur ne
relit ensuite que les sections dont il a besoin, au moment d'écrire le rapport — jamais les
fichiers entiers d'un coup, et jamais le JSON brut.

Un sous-agent qui recopie tout son travail dans sa réponse annule le bénéfice du découpage.

### Ce qui ne se délègue jamais

- Toute question à l'utilisateur (`ask_user`) : permissions, `reposDir` introuvable, repo requis
  manquant, branche approchante à confirmer. Un sous-agent ne peut pas dialoguer.
- La **qualification** (étape 5) : elle croise Jira, code et contradictions entre commentaires.
  C'est la raison d'être du skill, elle reste chez l'orchestrateur.
- L'écriture du rapport final.

### Nommage des agents

Plusieurs agents tournent en parallèle : sans nom parlant, l'utilisateur ne sait pas lequel est en
train de travailler ni sur quoi. Renseigner **`name`** et **`description`** à chaque lancement.

| Bloc | `name` | `description` |
|---|---|---|
| Étape 2 | `collecte-jira-<ISSUE_KEY>` | `Collecte Jira <ISSUE_KEY>` |
| Étape 4 | `code-<repo>` | `Investigation <repo> sur <branche>` |

Exemples : `collecte-jira-GSUPPORT-47944`, `code-orme-prescription` avec la description
`Investigation orme-prescription sur 317XXXX/develop`.

Le nom porte **le repo, pas un numéro** : `code-1`, `code-2` ne dit rien quand trois agents
tournent ensemble. Quand un digest sera relu à l'étape 5, c'est par ce nom qu'on le retrouvera.

### Consignes communes à tous les sous-agents
Les sous-agents sont **sans mémoire** : chaque prompt doit être autoportant. Y inclure
systématiquement :

- la clé du ticket et le chemin `/tmp/gsupport/<ISSUE_KEY>/` où écrire,
- le rappel que `JIRA_DOMAIN` / `JIRA_API_TOKEN` viennent de `source ~/.bashrc`,
- le rappel du masquage des données patient (`Contains PID`),
- la contrainte de sortie : écrire le fichier, ne renvoyer qu'une synthèse ≤ 30 lignes,
- l'interdiction absolue de `git checkout` / `switch` / `stash` / `worktree` / `reset` / `pull`,
- l'interdiction de poser une question : en cas de blocage, l'écrire dans le digest et rendre la
  main.

Si un sous-agent échoue ou rend une sortie vide, **ne pas le relancer une seconde fois** :
exécuter son bloc directement, et le signaler dans le rapport.

### Choix des modèles

Tous les blocs ne demandent pas la même puissance : la collecte Jira est mécanique, l'investigation
de code est du raisonnement. Les modèles sont déclarés dans `config.json` sous `agents`, jamais en
dur ici — les identifiants évoluent et tout le monde n'a pas les mêmes accès.

```bash
jq -r '.agents | to_entries[] | "\(.key)\t\(.value.model // "défaut")\t\(.value.reasoningEffort // "-")"' \
  "$SKILL_DIR/config.json"
```

| Bloc | Clé `config.json` | Intention |
|---|---|---|
| Étape 2 — collecte Jira | `agents.jiraCollect` | modèle rapide : `curl`, `jq`, extraction de documents, gros volume de tokens et peu de raisonnement |
| Étape 4 — investigation code | `agents.codeInvestigate` | modèle fort avec `reasoningEffort` élevé : chaîne message d'erreur → front → REST → condition métier |

Passer ces valeurs aux paramètres `model` et `reasoning_effort` de l'outil `task`. Deux garde-fous :

- Valeur vide → lancer l'agent **sans** forcer de modèle.
- Identifiant refusé (modèle inconnu ou non accessible) → **relancer une fois sans le paramètre
  `model`** plutôt que d'abandonner l'analyse, et le signaler en une ligne. Un `config.json` recopié
  d'un autre poste ne doit jamais bloquer un ticket.

**Le modèle de l'orchestrateur, lui, ne se force pas** : il dépend du `/model` de la session. C'est
pourtant lui qui qualifie (étape 5). D'où la vérification à l'étape 0.

## Commande

### `/gsupport-analyze <ISSUE_KEY>`

`<ISSUE_KEY>` accepte aussi une URL complète (`https://jira.dedalus.com/browse/GSUPPORT-47944`) :
extraire la clé de l'URL le cas échéant.

---

## Étape 0 — Permissions

L'analyse enchaîne des dizaines d'appels `curl`, `git`, `grep` et d'écritures dans `/tmp`. Valider
chaque demande une par une casse le rythme et fait perdre du temps. **Avant toute autre action**,
poser la question une seule fois, via `ask_user` :

```
Titre  : Autorisez-vous l'exécution sans confirmation ?
Texte  : Cette analyse enchaîne de nombreuses commandes en lecture seule (Jira, git, grep,
         téléchargement des pièces jointes dans /tmp). Sans autorisation globale, chaque
         commande demandera une confirmation.
Choix  : - Oui, activer /allow-all pour cette session (recommandé)
         - Non, me demander à chaque fois
```

Selon la réponse :

- **Oui** → répondre : « Tape `/allow-all` puis relance `/gsupport-analyze <ISSUE_KEY>`. »
  et **s'arrêter là**. Un skill ne peut pas exécuter `/allow-all` lui-même : c'est une commande
  interactive, seul l'utilisateur peut la taper.
- **Non** → continuer normalement, en respectant strictement le tableau « Exécution autonome ».

Ne jamais reposer la question pendant l'analyse.

> Pour éviter la question à chaque lancement, l'utilisateur peut ajouter
> `"defaultPermissionMode": "allow-all"` dans `~/.copilot/settings.json` (fichier **utilisateur**
> uniquement : la clé est ignorée depuis `.github/copilot/settings.json` d'un repo).
> Elle ne s'applique qu'aux nouvelles sessions interactives (pas `--resume`, pas `-p`).

### Vérifier le modèle de la session

La qualification (étape 5) est un exercice de jugement : arbitrer entre « bug » et « comportement
attendu » à partir de commentaires contradictoires et d'une condition métier. Un modèle léger y
conclut mécaniquement.

Comparer le modèle de la session à `orchestratorModel.preferred` de `config.json` :

```bash
jq -r '.orchestratorModel.preferred | join(", ")' "$SKILL_DIR/config.json"
```

S'il n'en fait pas partie, **avertir une fois puis continuer** — ne jamais bloquer l'analyse :

```
Session sur <modèle>. La qualification gagne à tourner sur <liste des modèles préférés>.
Tu peux basculer avec /model puis relancer, ou continuer : l'investigation de code utilisera
de toute façon <agents.codeInvestigate.model>.
```

Ne pas répéter l'avertissement pendant l'analyse, et le reporter en une ligne dans le rapport :
la confiance d'une qualification dépend du modèle qui l'a produite.

## Étape 1 — Valider la clé

```
Si <ISSUE_KEY> ne commence pas par "GSUPPORT-" :
  → afficher "Préfixe inattendu. Ce skill traite uniquement les tickets GSUPPORT-XXXXX.
     Pour HORME-/ORBISBUG-, utiliser /task-analyze."
  → arrêter
```

## Étape 2 — Collecte Jira — **déléguée à un sous-agent**

Ce bloc produit le gros du volume brut (JSON complet, commentaires, pièces jointes). Il est confié
à **un seul sous-agent** de type `explore`, nommé `collecte-jira-<ISSUE_KEY>` et lancé avec le
modèle `agents.jiraCollect` de `config.json`. Il écrit
`/tmp/gsupport/<ISSUE_KEY>/digest-jira.md` et ne renvoie qu'une synthèse.

> **Pièces jointes et images** — le sous-agent doit pouvoir ouvrir des images avec l'outil `view`.
> S'il n'en est pas capable, il l'écrit dans le digest (`images non exploitées par l'agent`) et
> l'orchestrateur les regarde lui-même après coup, sans relancer tout le bloc.

### Prompt à fournir au sous-agent

Y reprendre intégralement les sections 2.1 à 2.4 ci-dessous (elles sont le contrat de l'agent),
plus les consignes communes, et exiger cette structure de digest :

```markdown
# Digest Jira — <ISSUE_KEY>
## Champs        <tableau des champs standards et GSUPPORT>
## Symptôme      <description reformatée, scénario, résultat actuel/attendu, message d'erreur exact>
## Commentaires  <synthèse chronologique : auteur, date, apport>
## Pièces jointes <une entrée par PJ : nom, type, ce qu'elle apporte ; "Contenu non exploitable" sinon>
## Liens         <tickets liés avec statut + résolution + apport de leur description ; liens externes>
## Pistes de recherche
<les 3 à 8 chaînes de caractères exactes les plus discriminantes pour le `git grep` :
 message d'erreur, libellé d'écran, code d'erreur, nom de bouton, classe apparaissant dans une
 stacktrace. C'est le livrable le plus important pour l'étape 4.>
## Vocabulaire client
<les termes métier employés par le client, traduits via le `glossary` de config.json ;
 signaler tout terme absent du glossaire — il devra y être ajouté>
## Ce qui n'a pas pu être lu
```

La **synthèse renvoyée** (≤ 30 lignes) doit tenir en : version détectée, produit, symptôme en
trois phrases, message d'erreur exact, pistes de recherche, et ce qui n'a pas pu être lu.

### Ce que l'orchestrateur en fait

Lire la synthèse, puis ne relire dans `digest-jira.md` que les sections nécessaires à l'étape
concernée. Ne jamais charger `issue.json` ni `comments.json` dans le contexte de l'orchestrateur :
ils restent sur disque, à disposition d'un `jq` ciblé si un champ précis manque.

Si `Contains PID = Yes`, vérifier dans la synthèse qu'aucune donnée patient n'a fuité avant de
recopier quoi que ce soit dans le rapport.

---

## 2.1 — Lire le ticket

Récupérer **tous** les champs (les tickets GSUPPORT portent l'essentiel de l'information dans des
custom fields, ne pas filtrer avec `?fields=`) :

```bash
source ~/.bashrc
mkdir -p /tmp/gsupport/<ISSUE_KEY>
curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<ISSUE_KEY>" \
  -o /tmp/gsupport/<ISSUE_KEY>/issue.json
```

Si la réponse contient `errorMessages` → afficher `Ticket <ISSUE_KEY> introuvable sur ${JIRA_DOMAIN}` et arrêter.

### Champs standards

| Donnée | Chemin JSON |
|---|---|
| Titre | `fields.summary` |
| Description | `fields.description` (texte wiki Jira Server) |
| Type | `fields.issuetype.name` (ex. `Customer Support Request`) |
| Statut | `fields.status.name` |
| Priorité | `fields.priority.name` |
| Labels | `fields.labels[]` (ex. `AP-HP`, `FR`) |
| Créé / Mis à jour | `fields.created` / `fields.updated` |
| Rapporteur | `fields.reporter.displayName` |
| Liens d'issues | `fields.issuelinks[]` |
| Pièces jointes | `fields.attachment[]` |

### Champs spécifiques GSUPPORT

Ces custom fields sont propres au projet GSUPPORT et portent le contexte client et produit.

| Donnée | Champ | Extraction |
|---|---|---|
| Customer Info | `customfield_32118` | tableau wiki : Customer Ticket ID, Customer ID, Company Name, Contact, Related System |
| Severity | `customfield_11049` | `.value` (ex. `3 - Moderate`) |
| Master Ticket Number | `customfield_20207` | ServiceNow (ex. `MST0126896`) |
| Master Ticket Link | `customfield_20219` | HTML contenant l'URL ServiceNow |
| Customer Tickets | `customfield_20215` | nombre de tickets client rattachés |
| Support Contact | `customfield_20239` | nom du contact support |
| External ID | `customfield_11042` | clé du ticket miroir (ex. `GSUPPORT-48083`) |
| Jira Cloud Key | `customfield_36500` | HTML contenant le lien Jira Cloud |
| [G] Business Unit | `customfield_22703` | `.fields.summary` |
| [G] Product Line | `customfield_22712` | `.fields.summary` (ex. `ORBIS`) |
| [G] Product | `customfield_22709` | `.fields.summary` (ex. `ORBIS Medication`) |
| [G] Detected in Version | `customfield_22705` | `.fields.summary` (ex. `ORBIS Medication 03.17.09.02`) |
| [G] Team | `customfield_22715` | `.fields.summary` |
| [G] PM&E Team | `customfield_30100` | `.fields.summary` |
| Contains PID | `customfield_27001` | `.value` — si `Yes`, données patient présentes |
| ISP Impacted | `customfield_18624` | `.value` |

Commande d'extraction :

```bash
jq -r '
"summary: \(.fields.summary)",
"type: \(.fields.issuetype.name)",
"status: \(.fields.status.name)",
"priority: \(.fields.priority.name)",
"severity: \(.fields.customfield_11049.value // "n/a")",
"labels: \(.fields.labels | join(", "))",
"product: \(.fields.customfield_22709.fields.summary // "n/a")",
"productLine: \(.fields.customfield_22712.fields.summary // "n/a")",
"detectedInVersion: \(.fields.customfield_22705.fields.summary // "n/a")",
"team: \(.fields.customfield_22715.fields.summary // "n/a")",
"businessUnit: \(.fields.customfield_22703.fields.summary // "n/a")",
"masterTicket: \(.fields.customfield_20207 // "n/a")",
"externalId: \(.fields.customfield_11042 // "n/a")",
"containsPid: \(.fields.customfield_27001.value // "n/a")",
"customerInfo:", .fields.customfield_32118,
"description:", .fields.description
' /tmp/gsupport/<ISSUE_KEY>/issue.json
```

> **Attention aux données patient.** Si `Contains PID = Yes`, ou si la description contient un IPP,
> un nom ou une date de naissance : ne jamais recopier ces valeurs dans le fichier généré.
> Les remplacer par `<IPP masqué>`, `<patient masqué>`. Le fichier généré reste dans le repo.

## 2.2 — Lire TOUS les commentaires

Les commentaires portent souvent l'essentiel de l'analyse (échanges support ↔ client ↔ R&D,
compléments de reproduction, contre-exemples). Ils sont **obligatoires**, jamais optionnels.

```bash
curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<ISSUE_KEY>/comment?maxResults=1000&orderBy=created" \
  -o /tmp/gsupport/<ISSUE_KEY>/comments.json

jq -r '.comments[] | "--- \(.author.displayName) | \(.created) ---\n\(.body)\n"' \
  /tmp/gsupport/<ISSUE_KEY>/comments.json
```

Vérifier que `.total` est bien couvert par `.comments | length` ; sinon paginer avec `startAt`.

Lire **chaque** commentaire, puis en produire une synthèse chronologique qui retient :
- les compléments de scénario ou de reproduction,
- les demandes d'information restées sans réponse,
- les analyses déjà faites côté support / R&D (et leurs conclusions),
- les contradictions avec la description initiale,
- les décisions déjà prises (ticket rejeté, workaround fourni, escalade…).

## 2.3 — Télécharger et lire TOUTES les pièces jointes

```bash
jq -r '.fields.attachment[] | "\(.id)\t\(.filename)\t\(.mimeType)\t\(.size)\t\(.content)"' \
  /tmp/gsupport/<ISSUE_KEY>/issue.json
```

Télécharger chaque pièce jointe via son champ `.content` (l'URL `/rest/api/2/attachment/content/<id>`
ne fonctionne pas sur cette instance) :

```bash
jq -r '.fields.attachment[] | "\(.content)\t\(.filename)"' /tmp/gsupport/<ISSUE_KEY>/issue.json \
| while IFS=$'\t' read -r url name; do
    curl -sL -H "Authorization: Bearer ${JIRA_API_TOKEN}" "$url" \
      -o "/tmp/gsupport/<ISSUE_KEY>/$name"
  done
```

Puis exploiter selon le type :

- **Images** (`.png`, `.jpg`, `.gif`) → les ouvrir avec l'outil `view` et **décrire ce qu'elles montrent**
  (écran concerné, message d'erreur affiché, état de la prescription, horodatage visible).
- **Word** (`.docx`) → extraire le texte, ces documents contiennent en général le scénario de
  reproduction pas à pas :

  ```bash
  python3 - "/tmp/gsupport/<ISSUE_KEY>/<fichier>.docx" <<'PY'
  import re, sys, zipfile
  z = zipfile.ZipFile(sys.argv[1])
  xml = z.read("word/document.xml").decode("utf8")
  xml = re.sub(r"</w:p>", "\n", xml)
  print(re.sub(r"<[^>]+>", "", xml))
  PY
  ```

  Un `.docx` embarque aussi ses captures d'écran dans `word/media/` — les extraire et les regarder,
  elles portent souvent le message d'erreur exact et les horaires du scénario :

  ```bash
  unzip -o -j "/tmp/gsupport/<ISSUE_KEY>/<fichier>.docx" 'word/media/*' \
    -d "/tmp/gsupport/<ISSUE_KEY>/media"
  ```

- **Excel** (`.xlsx`) → extraire via `python3` (`zipfile` + `xl/sharedStrings.xml`) ou signaler
  `Contenu non exploitable` si l'extraction échoue.
- **PDF** → `pdftotext` s'il est installé, sinon signaler `Contenu non exploitable`.
- **Logs / `.txt` / `.xml` / `.json`** → les lire, chercher les stacktraces et les codes d'erreur.

> Si une pièce jointe ne peut pas être lue, l'indiquer explicitement dans le rapport plutôt que
> de l'ignorer silencieusement — une pièce jointe non lue est une information manquante.

## 2.4 — Liens distants et issues liées

```bash
curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<ISSUE_KEY>/remotelink"
```

Recenser : liens Confluence, liens ServiceNow (Master Ticket), tickets Jira liés
(`fields.issuelinks[]`), ticket miroir (`External ID`), et tout `ORBISBUG`/`HORME` déjà créé.

Pour **chaque** ticket lié, suivre le lien sur **un niveau** et récupérer aussi sa **description** —
pas seulement son titre : un ticket lié contient fréquemment l'analyse déjà menée, le motif de
rejet ou le correctif appliqué.

```bash
curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<LINKED_KEY>?fields=summary,status,resolution,description,components,labels,fixVersions"
```

Conclure explicitement : le sujet a-t-il **déjà** été traité, rejeté, ou corrigé dans une version ?

## Étape 3 — Sélection des repos et diagnostic — **orchestrateur**

Cette étape reste chez l'orchestrateur : elle est peu volumineuse, et elle peut avoir à
**questionner l'utilisateur** (repo requis manquant, branche approchante à confirmer), ce qu'un
sous-agent ne sait pas faire. Elle produit le contexte exact que recevront les agents de l'étape 4 :
**repo + branche résolue**.

### 3.1 — Choisir les repos

#### Router par domaine métier

`config.json` porte une table `domains` : chaque domaine décrit un périmètre fonctionnel avec ses
`aliases` (le vocabulaire du **client**, en français, anglais et allemand), les `repos` concernés,
des `paths`, des `i18nBundles` et des `grepSeeds`.

Confronter le symptôme et le message d'erreur aux `aliases`, puis retenir le ou les domaines qui
correspondent :

```bash
jq -r '.domains[] | "\(.name)\t\(.label)\t\(.aliases | join(" | "))"' "$SKILL_DIR/config.json"
```

Les tickets GSUPPORT arrivent dans la langue du client : c'est **son** vocabulaire qu'il faut
reconnaître, pas le nom technique du module. « Absetzen », « discontinue » et « stopper la ligne »
désignent le même domaine.

Le domaine retenu donne les repos, et surtout les `paths` / `grepSeeds` transmis aux agents de
l'étape 4 — c'est ce qui les empêche de partir en recherche large.

> **Ce sont des indications, jamais un filtre.** Si aucun domaine ne correspond, ou si un agent ne
> trouve rien dans les `paths` annoncés, il doit chercher au-delà. Un périmètre figé produirait des
> `Aucun code pertinent identifié.` faussement rassurants — le pire résultat possible pour ce skill.
>
> Quand une analyse révèle qu'un domaine a mal routé (alias manquant, chemin obsolète, `grepSeed`
> qui ne renvoie plus rien), **corriger `config.json` dans la foulée** et le mentionner à
> l'utilisateur. Sans entretien, cette table sera fausse en quelques mois.

#### Traduire le vocabulaire du client

Un ticket client parle en jargon de service, pas en noms de classes. `config.json` porte un
`glossary` qui fait le pont : chaque entrée donne les `terms` employés par le client, leur
`meaning`, le `technical` correspondant et, quand elle existe, le `domain` visé.

```bash
jq -r '.glossary[] | "\(.terms | join(" / "))\t→ \(.technical)\t[\(.domain // "-")]"' \
  "$SKILL_DIR/config.json"
```

Faire cette traduction **avant** de router et avant tout `git grep` : chercher « plan de soins »
dans le code ne donnera jamais rien, `DirectAdministration` si. Une entrée du glossaire peut
désigner directement un domaine, ce qui règle le routage.

Comme pour les domaines, entretenir : un terme client mal compris pendant une analyse doit être
ajouté ici dans la foulée.

#### Compléter par les descriptions de repos

Un ticket peut ne relever d'aucun domaine, ou déborder du sien. Confronter alors le symptôme aux
`description` des repos, et retenir les repos pertinents. Annoncer la sélection et la justifier en
une ligne par repo. Commencer par le plus probable.

#### Repos soumis à une version

Un repo peut n'être valable que pour certaines versions : il porte alors un champ `versionRange`
dans `config.json` (`>=3.22`, `<3.22`, `>=3.17 <3.22`…). **La règle est dans le fichier, pas ici** :
ne jamais réénoncer une correspondance version → repo en dur, elle divergerait du config.

La version de référence est **`[G] Detected in Version`** (`customfield_22705`, ex.
`ORBIS Medication 03.17.09.02` → `3.17`) — en extraire les deux premiers segments :

```bash
VERSION=$(jq -r '.fields.customfield_22705.fields.summary // ""' \
  /tmp/gsupport/<ISSUE_KEY>/issue.json \
  | grep -oE '[0-9]+\.[0-9]+' | head -1 | sed 's/^0*//;s/\.0*/./')
```

Filtrer ensuite les repos applicables. Un repo sans `versionRange` vaut pour toutes les versions :

```bash
jq -r --arg v "$VERSION" '
  def num: split(".") | (.[0]|tonumber) * 1000 + (.[1]|tonumber);
  def sat($r): $r
    | split(" ") | map(select(length > 0))
    | all(
        capture("^(?<op>>=|<=|>|<|=)(?<ver>[0-9]+\\.[0-9]+)$") as $c
        | ($v|num) as $a | ($c.ver|num) as $b
        | if   $c.op == ">=" then $a >= $b
          elif $c.op == "<=" then $a <= $b
          elif $c.op == ">"  then $a >  $b
          elif $c.op == "<"  then $a <  $b
          else $a == $b end
      );
  .repositories[]
  | select((has("versionRange") | not) or sat(.versionRange))
  | "\(.name)\t\(.description)"
' "$SKILL_DIR/config.json"
```

Deux repos aux `versionRange` complémentaires couvrent le même périmètre à des époques
différentes : **n'en fouiller qu'un**, celui que le filtre retient. C'est aujourd'hui le cas de
`orme-medication-legacy` et `orme-global-repo`. Indiquer dans le rapport la version retenue et le
repo correspondant.

Si la version détectée est absente ou illisible, ne pas filtrer : retenir le repo dont le
`versionRange` couvre les versions les plus récentes, et **le signaler explicitement comme une
hypothèse** dans le rapport.

### 3.2 — Se placer sur la branche de la version, sans rien casser

**Ne jamais chercher dans les fichiers du disque.** Les repos locaux sont sur des branches
quelconques (ticket en cours, migration, version différente de celle du client) et peuvent porter
du travail non commité. Chercher dedans produirait une analyse du mauvais code, donc une
qualification fausse.

**Ne jamais faire de `git checkout`, `git switch`, `git stash` ni `git worktree`** dans les repos
de l'utilisateur. La recherche se fait **directement sur les références distantes**, en lecture
seule : branche courante, `HEAD`, stashes et fichiers modifiés restent intacts.

```bash
git -C "$REPO" grep -n "<motif>" "origin/<branche>" -- '<filtre>'   # rechercher
git -C "$REPO" show "origin/<branche>:<chemin>"                     # lire un fichier
git -C "$REPO" ls-tree -r --name-only "origin/<branche>"            # lister les fichiers
git -C "$REPO" log -S "<motif>" "origin/<branche>" -- '<chemin>'    # tracer une regression
```

**Pourquoi en local et pas via l'API GitHub** — la recherche de code GitHub n'indexe que la
**branche par défaut** du dépôt (`main/develop`) et n'accepte aucun filtre de branche : elle
renverrait le code le plus récent au lieu de celui de la version du client, ce que toute cette
section vise justement à éviter. S'ajoutent un quota de 10 recherches/minute contre ~0,15 s par
`git grep` local. **Ne pas remplacer ces commandes par une recherche GitHub.**

#### Résoudre la branche depuis la version

Les branches de version suivent le motif `<clé>/develop`, où la clé encode la version sur 7
chiffres (`major` 1 + `minor` 2 + `patch` 2 + `build` 2), `X` servant de joker :
`03.17.09.02` → `3170902` → `317XXXX/develop`.

Retenir la branche **la plus spécifique** qui correspond (une clé exacte prime sur un joker) :

```bash
pick_branch() {
  local repo="$1" version="$2" key best="" pat re xs bxs
  key=$(echo "$version" \
        | grep -oE '[0-9]{2}\.[0-9]{2}\.[0-9]{2}\.[0-9]{2}|[0-9]+\.[0-9]+' \
        | head -1 | tr -d '.' | sed 's/^0//')
  while read -r b; do
    pat="${b%%/develop}"; pat="${pat#origin/}"
    case "$pat" in (*[!0-9X]*|"") continue;; esac
    re="^${pat//X/[0-9]}$"
    if [[ "$key" =~ $re ]]; then
      xs=${pat//[!X]/}; bxs=${best//[!X]/}
      { [ -z "$best" ] || [ ${#xs} -lt ${#bxs} ]; } && best="$pat"
    fi
  done < <(git -C "$repo" branch -r | grep -E '/develop$' | tr -d ' ')
  echo "$best"
}
```

Correspondances validées : `03.17.09.02` → `317XXXX`, `03.21.02.05` → `32102XX`,
`03.21.00.01` → `3210001` (exacte, préférée à `32100XX`).

#### Rafraîchir les références

Avant tout diagnostic et toute recherche, mettre à jour les refs distantes de **chaque repo
présent**. `fetch` ne touche ni la branche courante, ni le working tree, ni les stashes :

```bash
git -C "$REPO" fetch --quiet origin
```

#### Diagnostic des repos — à afficher avant toute recherche

Après le `fetch` (sinon une branche récente paraîtra absente à tort), dresser l'état des repos et
**l'afficher à l'utilisateur** : il doit savoir sur quoi l'analyse s'appuie, et ce qui lui manque.

```bash
printf '%-28s %-9s %-16s %s\n' REPO PRESENT BRANCHE STATUT
jq -r '.repositories[] | "\(.name)\t\(.path)\t\(.url // "")"' "$SKILL_DIR/config.json" |
while IFS=$'\t' read -r name path url; do
  dir="$REPOS_DIR/$path"
  if [ ! -d "$dir/.git" ]; then
    printf '%-28s %-9s %-16s %s\n' "$name" "non" "-" "MANQUANT : git clone $url"
  else
    b=$(pick_branch "$dir" "$VERSION")
    if [ -n "$b" ]; then
      printf '%-28s %-9s %-16s %s\n' "$name" "oui" "$b/develop" "OK"
    else
      printf '%-28s %-9s %-16s %s\n' "$name" "oui" "-" "pas de branche pour cette version"
    fi
  fi
done
```

Interpréter chaque cas :

| Cas | Signification | Conduite à tenir |
|---|---|---|
| `OK` | repo cloné et branche de la version disponible | analyser |
| `pas de branche pour cette version` | repo cloné mais la version n'y existe pas | souvent normal (repo plus récent que la version, ou repo exclu par son `versionRange`) — proposer la branche la plus proche et demander confirmation |
| `MANQUANT` | repo absent du poste | donner la commande `git clone` exacte |

**Distinguer le nécessaire du superflu.** Croiser ce diagnostic avec les repos retenus à
l'étape 3.1 : un repo manquant mais non pertinent pour ce ticket ne doit pas inquiéter
l'utilisateur. Formuler par exemple :

- *« `orme-global-repo` est requis pour ce ticket (version 3.17) et il est absent :
  `git clone git@github.com:dedalus-cis4u/orme-global-repo.git` dans `<reposDir>`. »*
- *« `orme-pgd-config` est absent mais n'est pas nécessaire ici. »*

Si un repo **requis** manque, proposer à l'utilisateur de le cloner (commande fournie), puis
attendre sa réponse. S'il refuse ou ne peut pas, poursuivre en excluant ce repo, et écrire dans le
rapport ce qui n'a pas pu être vérifié à cause de cette absence — une conclusion tirée sans un repo
requis doit voir sa confiance abaissée.

#### Branche absente

Vérifier l'existence avant toute recherche :

```bash
git -C "$REPO" rev-parse --verify -q "origin/<branche>" >/dev/null || echo "ABSENTE"
```

Si la branche de la version n'existe pas dans un repo, c'est souvent **normal** : un repo dont le
`versionRange` exclut la version du client n'a par construction aucune branche pour elle. Dans ce
cas :

1. Ne pas se rabattre silencieusement sur `main/develop` — le code y est plus récent que celui du
   client et mènerait à une conclusion erronée.
2. Le signaler, proposer la branche existante la plus proche, et **demander confirmation** avant
   de l'utiliser.
3. Si l'utilisateur refuse, exclure ce repo et l'indiquer dans le rapport.

#### Tracer

Le rapport doit indiquer, **pour chaque repo fouillé, la branche réellement analysée**, ainsi que
la version dont elle découle. Sans cette information, une conclusion n'est pas vérifiable.

## Étape 4 — Investigation du code — **déléguée, un sous-agent par repo**

Une fois les repos retenus et leur branche résolue (étape 3), lancer **un sous-agent `explore` par
repo**, tous **en parallèle** : les repos sont indépendants, rien ne justifie de les enchaîner.
Chacun porte le nom `code-<repo>`, avec la branche analysée dans sa `description`.

Chaque agent est lancé avec le modèle et le `reasoningEffort` de `agents.codeInvestigate` : c'est
le bloc qui demande le plus de raisonnement, et le seul où un modèle fort change réellement la
qualité de la conclusion.

Chaque agent écrit `/tmp/gsupport/<ISSUE_KEY>/digest-code-<repo>.md` et ne renvoie qu'une synthèse
de 30 lignes maximum.

### Prompt à fournir à chaque agent

L'agent est sans mémoire : sans ces éléments, il partira en recherche large, exactement ce que
cette étape interdit. Le prompt doit contenir :

| Élément | Pourquoi |
|---|---|
| Chemin absolu du repo et **branche résolue** (`origin/<branche>`) | il ne doit ni redeviner la branche ni toucher au working tree |
| Version détectée du client | pour l'analyse de régression |
| Symptôme en trois phrases + **message d'erreur exact** | son point d'entrée |
| Les « Pistes de recherche » du `digest-jira.md` | les motifs `git grep` à essayer en premier |
| Les `grepSeeds`, `paths` et `i18nBundles` du domaine retenu | ses points de départ vérifiés dans ce repo |
| Le champ `i18nHint` de `config.json` | où chercher un libellé client (étape 4.1) |
| Scénario de reproduction résumé | pour confronter la règle trouvée au cas client |
| La chaîne de recherche 4.1 → 4.6 et les consignes de recherche ci-dessous | sa méthode |
| Le rôle du repo (`description` de `config.json`) | pour cadrer son périmètre |

Récupérer les éléments du domaine pour un repo donné :

```bash
jq -r --arg d "<domaine>" --arg r "<repo>" '
  .domains[] | select(.name == $d)
  | "paths:\n  " + ((.paths // []) | join("\n  "))
  + "\ni18nBundles:\n  " + ((.i18nBundles // []) | join("\n  "))
  + "\ngrepSeeds:\n  " + ((.grepSeeds // []) | join("\n  "))
' "$SKILL_DIR/config.json"
```

Les `paths` d'un domaine couvrent l'ensemble de ses repos : **un chemin inexistant dans le repo
confié à l'agent est simplement ignoré**, ce n'est pas une anomalie. Le préciser dans le prompt,
sinon l'agent perdra du temps à s'en inquiéter.

Rappeler enfin que ces éléments sont des **amorces, pas des limites** : si les `grepSeeds` ne
donnent rien, l'agent doit élargir et consigner les motifs essayés dans ses
`## Pistes non concluantes`.

Y ajouter les consignes communes, et en particulier l'interdiction stricte de toute commande
modifiant le repo (`checkout`, `switch`, `stash`, `worktree`, `reset`, `pull`) : ces repos sont
ceux de l'utilisateur, avec du travail en cours dessus.

### Structure du digest attendu

```markdown
# Digest code — <repo> @ origin/<branche>
## Chaîne de raisonnement   <message d'erreur → front → REST → métier → données>
## Fichiers retenus         <une section par fichier : chemin:lignes, rôle, extrait 10–30 lignes>
## Condition exacte qui produit le symptôme
## Version et régression    <la règle existe-t-elle déjà sur cette branche ? git log -S / diff>
## Verdict du repo          <ce que ce repo établit, et ce qu'il ne permet pas de conclure>
## Pistes non concluantes   <motifs cherchés sans résultat — évite qu'on les recherche deux fois>
```

Si l'agent ne trouve rien, il écrit `Aucun code pertinent identifié.` **et** la liste des motifs
essayés : une recherche infructueuse documentée vaut mieux qu'un silence.

### Ce que l'orchestrateur en fait

Il collecte les synthèses, puis **relit les digests fichier par fichier au moment de rédiger
l'étape 9**. Un verdict de repo qui contredit un autre est un signal fort : le dire dans la
qualification plutôt que de trancher en silence.

### Chaîne de recherche

Suivre cet ordre : chaque étape fournit le point d'entrée de la suivante. Ne pas sauter d'étape,
ne pas partir en recherche large.

**4.1 — Message d'erreur et libellés**
Point d'entrée le plus efficace : le **texte exact** remonté par le client (description,
commentaire, ou capture d'écran). Le chercher dans les bundles i18n pour retrouver sa **clé**, puis
chercher cette clé dans le code.

Où chercher exactement dépend du produit : suivre le champ `i18nHint` de `config.json` et les
`i18nBundles` du domaine plutôt que de supposer un emplacement. Sur ORME aujourd'hui, les libellés
affichés par le front Angular viennent des `.properties` du **backend** — chercher un `fr.json`
Angular ne donnerait rien.

**4.2 — Écran / composant front**
Si un écran est identifié : localiser le composant Angular (ou GWT) qui l'affiche, son template
et son service.

**4.3 — Point d'entrée REST**
Depuis le service front : retrouver l'endpoint appelé côté back (`@Path`, `@GET`, `@POST`, DTO
correspondant).

**4.4 — Logique métier**
Depuis le contrôleur : remonter aux services et **à la condition exacte qui lève l'erreur**.
Confronter cette règle au scénario décrit par le client.

**4.5 — Données / persistance**
Si le problème est lié aux données : entités JPA, requêtes, migrations, contraintes. Utiliser le
schéma DB au `grep` si `config.json` en déclare un.

**4.6 — Configuration et tests**
Fichiers de configuration, feature flags, paramétrage client. Puis les tests existants qui
couvrent (ou devraient couvrir) le comportement : un test qui affirme le comportement dénoncé
oriente fortement vers « comportement attendu ».

### Consignes de recherche

- Toutes les recherches passent par `git grep` / `git show` sur `origin/<branche>` — **jamais** par
  une lecture directe des fichiers du disque, qui reflètent une autre branche.
- Motifs ciblés, jamais de recherche large ; limiter les résultats (`head_limit`).
- `git ls-tree -r --name-only origin/<branche>` pour trouver les fichiers par nom, puis
  `git show origin/<branche>:<chemin>` pour lire la zone utile.
- Java : `.java` (classes, méthodes, annotations) · Angular : `.ts`, `.html` · SQL : `.sql` ·
  config : `.properties`, `.yml`, `.json` — via le filtre `-- '<motif>'` de `git grep`.

### Version et régression

Vérifier la **version détectée** (`[G] Detected in Version`) : la règle en cause existe-t-elle déjà
sur la branche de cette version, ou a-t-elle été introduite / corrigée depuis ? Le client parle
souvent de « régression » — le confirmer ou l'infirmer en comparant la branche de sa version à une
branche plus ancienne :

```bash
git -C "$REPO" log -S "<motif>" --oneline "origin/<branche>" -- '<chemin>'
git -C "$REPO" diff "origin/<branche ancienne>" "origin/<branche client>" -- '<chemin>'
```

### Restitution

Pour chaque fichier retenu : repo, chemin, plage de lignes, extrait (10–30 lignes max) et
explication de son rôle dans le symptôme. Restituer le résultat comme une **chaîne de raisonnement
traçable** (message d'erreur → front → REST → service → données), pas comme une liste de fichiers.

Cette restitution va dans le **digest du repo**, pas dans la réponse de l'agent.

Si rien n'est trouvé : écrire `Aucun code pertinent identifié.` et préciser les repos fouillés.

## Étape 5 — Qualification — **orchestrateur, jamais déléguée**

C'est la section centrale du skill et sa raison d'être : décider **ce qu'est** la demande avant
de décider quoi en faire.

Elle s'appuie sur les digests produits aux étapes 2 et 4. Avant de trancher, relire les sections
utiles : `## Symptôme` et `## Commentaires` du `digest-jira.md`, et `## Verdict du repo` de chaque
`digest-code-<repo>.md`.

Deux réflexes propres au mode délégué :

- **Un digest muet n'est pas une preuve d'absence.** Si un agent a rendu `Aucun code pertinent
  identifié.`, regarder ses `## Pistes non concluantes` : cherchait-il les bons motifs ? Si le
  message d'erreur exact n'y figure pas, la recherche était mal amorcée — le refaire soi-même sur
  ce motif avant de conclure.
- **Deux verdicts de repos qui se contredisent** sont une information, pas un bruit à arbitrer en
  silence : le mentionner dans « Éléments contradictoires ou incertains » et baisser la confiance.

Abaisser également la confiance si un repo requis était absent, ou si une pièce jointe n'a pas pu
être lue.

Choisir **une** catégorie principale, avec un niveau de confiance (Élevée / Moyenne / Faible) et
les éléments concrets qui la justifient (extrait de code, commentaire, capture, scénario) :

| Catégorie | Signification | Suite à donner |
|---|---|---|
| Bug dans notre code | Le comportement contredit la règle métier attendue | Créer un `ORBISBUG` |
| Configuration / données | Paramétrage, droits, données client ou environnement en cause | Retour au support / à l'équipe déploiement |
| Comportement attendu | Le produit fonctionne comme spécifié, le client attendait autre chose | Réponse fonctionnelle argumentée au client |
| Évolution / changement de comportement | La demande sort du comportement spécifié | Créer un `HORME` (à arbitrer produit) |
| Informations insuffisantes | Scénario non reproductible en l'état | Questions précises à poser au client |

Toujours indiquer :
- ce qui **soutient** la catégorie retenue,
- ce qui **la contredit** ou reste incertain,
- les catégories écartées et pourquoi.

Ne jamais conclure « bug » par défaut faute d'information : c'est le cas
`Informations insuffisantes`.

## Étape 6 — Hypothèses techniques

Uniquement si la catégorie est `Bug dans notre code` ou `Évolution`.
Lister 2 à 4 hypothèses classées de la plus à la moins probable :

- **Probabilité** : Élevée / Moyenne / Faible
- **Mécanisme** : ce qui se passe réellement
- **Localisation** : fichier + méthode (+ ligne si connue)
- **Correction envisagée** : changement concret
- **Impact / risque** : effets de bord, périmètre de régression

## Étape 7 — Informations manquantes et prochaines actions

### Informations manquantes

Pour **chaque** information qui manque à la conclusion, préciser trois choses :

| Information | Pourquoi elle est nécessaire | Qui peut la fournir |
|---|---|---|

Sans cette table, une catégorie `Informations insuffisantes` n'est pas exploitable.

### Prochaines actions

- Questions précises à poser au client (numérotées, chacune rattachée à une ligne du tableau ci-dessus).
- Vérifications à faire en interne (base, logs, environnement, version livrée).
- Brouillon de réponse support (ton factuel, sans jargon interne, en anglais si le ticket est en anglais).
- Si un `ORBISBUG` ou un `HORME` est à créer : titre proposé et résumé prêt à copier.

## Étape 8 — Sauvegarder le rapport

Un rapport existant n'est **jamais** écrasé : il constitue l'historique de l'analyse.

Le dossier de sortie vient de `reportDir` dans `config.json` (relatif à la racine du dépôt courant) :

```bash
SKILL_DIR=$(dirname "$(readlink -f ~/.copilot/skills/gsupport-analyze/SKILL.md)")
REPO_ROOT=$(git rev-parse --show-toplevel)
REPORT_DIR="${REPO_ROOT}/$(jq -r '.reportDir // ".copilot/analyses"' "$SKILL_DIR/config.json")"
mkdir -p "$REPORT_DIR"

REPORT="${REPORT_DIR}/<ISSUE_KEY>-GSUPPORT.md"
n=2
while [ -e "$REPORT" ]; do
  REPORT="${REPORT_DIR}/<ISSUE_KEY>-GSUPPORT-${n}.md"
  n=$((n + 1))
done
echo "$REPORT"
```

Écrire le contenu de l'étape 9 dans `$REPORT`, puis afficher :

```
Rapport sauvegardé : <chemin>
```

Si un rapport précédent existe, le signaler et indiquer **ce qui a changé** depuis.

En cas d'échec d'écriture : afficher `Impossible de sauvegarder le rapport : <erreur>` et continuer.

## Étape 9 — Structure du rapport

Même contenu dans le fichier et dans le chat.

```markdown
# <ISSUE_KEY> — <SUMMARY>

| | |
|---|---|
| Type | <ISSUE_TYPE> |
| Statut | <STATUS> |
| Priorité | <PRIORITY> |
| Sévérité | <SEVERITY> |
| Créé le | <CREATED> |
| Mis à jour le | <UPDATED> |
| Jira | https://<JIRA_DOMAIN>/browse/<ISSUE_KEY> |

## Contexte client

| | |
|---|---|
| Client | <CUSTOMER_COMPANY_NAME> |
| Ticket client | <CUSTOMER_TICKET_ID> |
| Contact | <CONTACT_PERSON> |
| Contact support | <SUPPORT_CONTACT> |
| Master ticket | <MASTER_TICKET_NUMBER> — <MASTER_TICKET_LINK> |
| Labels | <LABELS> |
| Données patient | <CONTAINS_PID> |

## Contexte produit

| | |
|---|---|
| Business Unit | <BUSINESS_UNIT> |
| Product Line | <PRODUCT_LINE> |
| Produit | <PRODUCT> |
| Version détectée | <DETECTED_IN_VERSION> |
| Équipe | <TEAM> |

## Symptôme

### Description client
<description reformatée en markdown, données patient masquées>

### Scénario de reproduction
<étapes numérotées, consolidées depuis la description, les commentaires et les documents joints>

### Résultat actuel
<...>

### Résultat attendu
<...>

### Message d'erreur
```
<message d'erreur exact, tel que remonté>
```

## Commentaires
<synthèse chronologique — auteur, date, apport du commentaire>
<ou "Aucun commentaire.">

## Pièces jointes
<pour chaque pièce jointe : nom, type, auteur, date, et ce qu'elle apporte>
<pour les images : description de ce qui est visible>
<pour les documents : extrait utile>
<ou "Aucune pièce jointe.">

## Liens
### Tickets liés
<clé — titre — statut, et relation>
### Documentation / liens externes
<titre → URL>
<ou "Aucun.">

## Investigation du code

**Version de référence** : <[G] Detected in Version> → clé `<clé>`
**Domaine métier retenu** : <domaine(s) de `config.json`, ou "aucun — routage par description de repo">

| Repo | Requis | Branche analysée | Remarque |
|---|---|---|---|
| <repo> | oui / non | `origin/<branche>` | <exacte / plus proche confirmée / absent du poste / exclu> |

**Repos requis manquants** : <liste + commande `git clone`, ou "aucun">
**Non vérifié faute de repo** : <ce qui n'a pas pu être confirmé, ou "rien">

### Chaîne de raisonnement
1. Point de départ : <message d'erreur / écran / libellé>
2. Front : <composant>
3. REST : <endpoint>
4. Métier : <service + condition qui lève l'erreur>
5. Données / configuration : <...>

### <repo> `origin/<branche>` — <chemin/du/fichier>:<lignes>
Rôle : <...>

```<langage>
<extrait>
```

### Version et régression
<la règle existe-t-elle sur la branche de la version détectée ? comparaison avec une branche
antérieure, confirmation ou infirmation de la régression>

<ou "Aucun code pertinent identifié." + repos et branches fouillés>
<ou "Investigation du code non réalisée : repos non disponibles">

## Qualification

**Catégorie retenue** : <catégorie>
**Confiance** : Élevée | Moyenne | Faible

**Justification**
<éléments concrets qui soutiennent la catégorie>

**Éléments contradictoires ou incertains**
<...>

**Catégories écartées**
- <catégorie> : <raison>

**Suite à donner** : <ORBISBUG | HORME | retour support | réponse client | demande d'information>

## Hypothèses techniques
<uniquement si bug ou évolution>

### Hypothèse 1 — <titre court>
- **Probabilité** : <...>
- **Mécanisme** : <...>
- **Localisation** : <repo / fichier / méthode>
- **Correction envisagée** : <...>
- **Impact / risque** : <...>

## Informations manquantes

| Information | Pourquoi elle est nécessaire | Qui peut la fournir |
|---|---|---|
| <...> | <...> | <...> |

<ou "Aucune — l'analyse est concluante en l'état.">

## Prochaines actions

### Questions au client
1. <...>

### Vérifications internes
- <...>

### Brouillon de réponse support
<texte prêt à envoyer>

### Ticket à créer
- **Type** : <ORBISBUG | HORME | aucun>
- **Titre** : <...>
- **Résumé** : <...>

## Traçabilité
Modèles : orchestrateur `<modèle de session>` · collecte `<agents.jiraCollect.model>` ·
code `<agents.codeInvestigate.model>`
<mention si un modèle configuré n'était pas disponible et a été remplacé par le modèle par défaut>

Digests de collecte (non versionnés, effacés au redémarrage) :
- `/tmp/gsupport/<ISSUE_KEY>/digest-jira.md`
- `/tmp/gsupport/<ISSUE_KEY>/digest-code-<repo>.md`
```

---

## Gestion des erreurs

| Situation | Message |
|---|---|
| Préfixe différent de `GSUPPORT-` | `Préfixe inattendu. Utiliser /task-analyze pour HORME-/ORBISBUG-.` |
| Ticket introuvable | `Ticket <KEY> introuvable sur ${JIRA_DOMAIN}` |
| Token absent | `Configurer JIRA_API_TOKEN dans ~/.bashrc` |
| Pièce jointe illisible | `Contenu non exploitable` (et le signaler dans le rapport) |
| Aucun commentaire | `Aucun commentaire.` |
| Aucune piste dans le code | `Aucun code pertinent identifié.` |
| Écriture du rapport impossible | `Impossible de sauvegarder le rapport : <erreur>` |
| Sous-agent en échec ou sortie vide | Exécuter le bloc soi-même, sans relancer l'agent, et l'indiquer dans le rapport |
