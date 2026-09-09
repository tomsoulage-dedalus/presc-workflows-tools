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

## Configuration requise

- `JIRA_DOMAIN` : domaine Jira (ex. `jira.dedalus.com`)
- `JIRA_API_TOKEN` : Personal Access Token Jira Server

> Les variables sont définies dans `~/.bashrc`. **Toujours lancer `source ~/.bashrc`** avant toute action.

## Commande

### `/gsupport-analyze <ISSUE_KEY>`

`<ISSUE_KEY>` accepte aussi une URL complète (`https://jira.dedalus.com/browse/GSUPPORT-47944`) :
extraire la clé de l'URL le cas échéant.

---

## Étape 1 — Valider la clé

```
Si <ISSUE_KEY> ne commence pas par "GSUPPORT-" :
  → afficher "Préfixe inattendu. Ce skill traite uniquement les tickets GSUPPORT-XXXXX.
     Pour HORME-/ORBISBUG-, utiliser /task-analyze."
  → arrêter
```

## Étape 2 — Lire le ticket

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

## Étape 3 — Lire TOUS les commentaires

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

## Étape 4 — Télécharger et lire TOUTES les pièces jointes

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

## Étape 5 — Liens distants et issues liées

```bash
curl -s -H "Authorization: Bearer ${JIRA_API_TOKEN}" -H "Accept: application/json" \
  "https://${JIRA_DOMAIN}/rest/api/2/issue/<ISSUE_KEY>/remotelink"
```

Recenser : liens Confluence, liens ServiceNow (Master Ticket), tickets Jira liés
(`fields.issuelinks[]`), ticket miroir (`External ID`), et tout `ORBISBUG`/`HORME` déjà créé.

Si un ticket lié existe déjà, le lire (`/rest/api/2/issue/<KEY>?fields=summary,status,resolution`)
pour savoir si le sujet a déjà été traité.

## Étape 6 — Investigation du code

Point d'entrée le plus efficace : **le message d'erreur exact** remonté par le client (souvent
présent dans la description, un commentaire ou une capture).

1. Chercher le message dans les fichiers de traduction / bundles pour retrouver sa **clé**.
2. Chercher cette clé dans le code back (Java/Jakarta EE) et front (Angular) pour trouver
   **qui lève l'erreur** et sous quelle condition.
3. Remonter la condition métier jusqu'à la règle en cause, et confronter cette règle au scénario
   décrit par le client.
4. Compléter par des recherches sur les termes du domaine (entité, action, workflow concerné).

Produire pour chaque fichier pertinent : chemin, rôle, extrait de code (10–30 lignes max).

Vérifier aussi la **version détectée** (`[G] Detected in Version`) : la règle en cause existe-t-elle
déjà dans cette version, ou a-t-elle été introduite / corrigée depuis ? Le client parle souvent de
« régression » — le confirmer ou l'infirmer avec l'historique git.

Si rien n'est trouvé : écrire `Aucun code pertinent identifié.`

## Étape 7 — Qualification

C'est la section centrale du skill et sa raison d'être : décider **ce qu'est** la demande avant
de décider quoi en faire.

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

## Étape 8 — Hypothèses techniques

Uniquement si la catégorie est `Bug dans notre code` ou `Évolution`.
Lister 2 à 4 hypothèses classées de la plus à la moins probable :

- **Probabilité** : Élevée / Moyenne / Faible
- **Mécanisme** : ce qui se passe réellement
- **Localisation** : fichier + méthode (+ ligne si connue)
- **Correction envisagée** : changement concret
- **Impact / risque** : effets de bord, périmètre de régression

## Étape 9 — Prochaines actions

- Questions précises à poser au client (numérotées, chacune justifiée par un manque identifié).
- Vérifications à faire en interne (base, logs, environnement, version).
- Brouillon de réponse support (ton factuel, sans jargon interne, en anglais si le ticket est en anglais).
- Si un `ORBISBUG` ou un `HORME` est à créer : titre proposé et résumé prêt à copier.

## Étape 10 — Sauvegarder le rapport

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
mkdir -p "${REPO_ROOT}/.copilot/analyses"
```

Écrire `${REPO_ROOT}/.copilot/analyses/<ISSUE_KEY>-GSUPPORT.md` avec le contenu de l'étape 11,
puis afficher :

```
Rapport sauvegardé : <repo_root>/.copilot/analyses/<ISSUE_KEY>-GSUPPORT.md
```

En cas d'échec d'écriture : afficher `Impossible de sauvegarder le rapport : <erreur>` et continuer.

## Étape 11 — Structure du rapport

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

### <chemin/du/fichier>
Rôle : <...>

```<langage>
<extrait>
```

<ou "Aucun code pertinent identifié.">

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
- **Localisation** : <fichier / méthode>
- **Correction envisagée** : <...>
- **Impact / risque** : <...>

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
