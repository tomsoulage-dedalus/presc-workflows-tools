---
name: "update-lib"
description: "Met à jour une dépendance choisie dans prescription-app et prescription-lib et crée un commit. Paramètres nommés : --bug (optionnel), --lib (optionnel), --test (flag). Si --bug est fourni avec un préfixe connu (ORBISBUG, HDEFECT, HORME), crée une branche bugfix ; avec un préfixe inconnu, crée une branche quality en utilisant le BUG_ID directement comme suffixe ; sans --bug, travaille sur la branche courante (interdit si la branche courante se termine par /develop). Si --lib est omis, présente la liste des dépendances communes et demande à l'utilisateur de choisir. Avec --test : lance aussi npm install, vérifie le proxy et démarre l'application."
---

# Update Lib Skill

## Available commands

### `/update-lib [--bug BUG_ID] [--lib LIB_NAME] [--test]`

Met à jour une dépendance npm, optionnellement pour un bug spécifié.

- `--bug BUG_ID` *(optionnel)* : identifiant du bug (ex: `ORBISBUG-135`) ou suffixe de branche (ex: `eknit-update-version`). Sans ce paramètre, travaille sur la branche courante (impossible si elle se termine par `/develop`).
- `--lib LIB_NAME` *(optionnel)* : nom exact de la dépendance npm à mettre à jour. Sans ce paramètre, une liste interactive est présentée.
- `--test` *(flag optionnel)* : enchaîne npm install, vérification du proxy et démarrage de l'application après le commit.

**Comportement selon `--bug` :**
- Absent : travaille sur la branche courante, commit `chore(deps)`. ⚠️ Interdit si la branche courante se termine par `/develop`.
- Préfixe connu (`ORBISBUG`, `HDEFECT`, `HORME`) : crée une branche `bugfix`, commit `fix(${BUG_ID})`.
- Préfixe inconnu : crée une branche `quality/${BUG_ID}` (le BUG_ID est utilisé directement comme suffixe), commit `chore(deps)`.

**Exemples :**
```
/update-lib
/update-lib --lib @medication-statement/lib
/update-lib --lib @medication-statement/lib --test
/update-lib --bug eknit-update-version
/update-lib --bug ORBISBUG-135
/update-lib --bug ORBISBUG-135 --lib @medication-statement/lib
/update-lib --bug ORBISBUG-135 --lib @medication-statement/lib --test
```

---

## Detailed behaviour

### Step 1 — Vérifications préalables

Parser les paramètres nommés :
```
BUG_ID  = valeur de --bug  (vide si absent)
LIB_NAME = valeur de --lib (vide si absent)
RUN_TEST = true si --test présent, false sinon
```

Récupérer la branche courante :

```bash
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ROOT_BRANCH="${CURRENT_BRANCH%%/*}"
```

Si `HEAD` est détaché :
```
❌ Detached HEAD non supporté
```
**Stopper.**

**Cas 1 — `--bug` absent :**

Vérifier que la branche courante ne se termine pas par `/develop` :
```bash
[[ "${CURRENT_BRANCH}" == */develop ]]
```

Si c'est le cas :
```
❌ Impossible de travailler directement sur la branche '${CURRENT_BRANCH}'.
   Changez de branche ou fournissez un --bug pour créer une branche dédiée.
```
**Stopper.**

```
NO_BRANCH=true
COMMIT_PREFIX="chore(deps)"
NEW_BRANCH=""   # pas de nouvelle branche
```

**Cas 2 — `--bug` fourni avec un préfixe connu (`ORBISBUG`, `HDEFECT`, `HORME`) :**

Valider le format (lettres majuscules + tiret + chiffres, ex: `ORBISBUG-135`). Si invalide :
```
❌ BUG_ID invalide : <valeur reçue>
   Format attendu  : ORBISBUG-135
```
**Stopper.**

```
NO_BRANCH=false
COMMIT_PREFIX="fix(${BUG_ID})"
NEW_BRANCH="${ROOT_BRANCH}/presc/bugfix/${BUG_ID}"
```

**Cas 3 — `--bug` fourni avec un préfixe inconnu :**

Aucune validation de format : accepter le BUG_ID tel quel.

```
NO_BRANCH=false
COMMIT_PREFIX="chore(deps)"
NEW_BRANCH="${ROOT_BRANCH}/presc/quality/${BUG_ID}"
```

---

**Pour les cas 2 et 3**, vérifier les `package.json` :

```bash
[ -f "frontend/prescription-app/package.json" ]  || echo "❌ package.json introuvable dans frontend/prescription-app"
[ -f "frontend/prescription-lib/package.json" ]  || echo "❌ package.json introuvable dans frontend/prescription-lib"
```

**Pour les cas 2 et 3**, vérifier que la branche cible n'existe pas déjà :

```bash
git show-ref --verify --quiet "refs/heads/${NEW_BRANCH}"
git ls-remote --heads origin "${NEW_BRANCH}"
```

Si elle existe déjà :
```
❌ La branche '${NEW_BRANCH}' existe déjà (locale ou origin).
```
**Stopper.**

### Step 1b — Sélection de la lib (si --lib absent)

> ⚡ Cette sous-étape n'est exécutée que si `--lib` n'a pas été passé.

Calculer la liste des dépendances **communes** aux deux projets (champ `dependencies` uniquement, pas `devDependencies`) :

```bash
node -e "
  const app = require('./frontend/prescription-app/package.json').dependencies || {};
  const lib = require('./frontend/prescription-lib/package.json').dependencies || {};
  const common = Object.keys(app).filter(k => k in lib).sort();
  common.forEach((name, i) => console.log((i + 1) + ') ' + name + '  ' + app[name]  + '  /  ' + lib[name]));
"
```

Afficher la liste sous ce format :
```
📋 Dépendances communes à prescription-app et prescription-lib :

 1) @angular/animations         ^20.0.0  /  ^20.0.0
 2) @angular/cdk                ^20.0.0  /  ^20.0.0
 3) @ddm/core                   ^3.4000000.3  /  ^3.4000000.3
 4) @medication-statement/lib   ^3.4000000.4  /  ^3.4000000.4
 ...

👉 Entrez le numéro (ou le nom exact) de la lib à mettre à jour :
```

Attendre la réponse de l'utilisateur.
- Si l'utilisateur saisit un **numéro** valide → utiliser le nom correspondant comme `LIB_NAME`.
- Si l'utilisateur saisit un **nom exact** présent dans la liste → utiliser ce nom comme `LIB_NAME`.
- Si la saisie ne correspond à rien : afficher `❌ Choix invalide` et re-présenter la liste.

### Step 2 — Créer la branche

> ⚡ Cette étape n'est exécutée que si `NO_BRANCH=false`.

```bash
git checkout -b "${NEW_BRANCH}"
```

Afficher :
```
🌿 Branche créée : ${NEW_BRANCH}  (depuis ${CURRENT_BRANCH})
```

Si `NO_BRANCH=true`, afficher à la place :
```
ℹ️  Pas de --bug fourni — travail sur la branche courante : ${CURRENT_BRANCH}
```

### Step 3 — Mettre à jour la lib

Vérifier que `LIB_NAME` est bien renseigné :

```bash
[ -z "${LIB_NAME}" ]
```

Si vide :
```
❌ Aucune lib spécifiée. Utilisez --lib ou sélectionnez une lib dans la liste interactive.
```
**Stopper.**

Exécuter `npm update` dans les deux projets frontend :

```bash
cd frontend/prescription-app
npm update ${LIB_NAME}

cd ../prescription-lib
npm update ${LIB_NAME}
```

Afficher après chaque commande :
```
📦 npm update ${LIB_NAME} — OK dans <dossier>
```

### Step 4 — Créer le commit

Stager **uniquement** les `package-lock.json` des deux projets.  
⚠️ Ne jamais appeler `git restore --staged` ni aucune commande qui modifierait l'index en dehors de ces deux fichiers. Les fichiers déjà stagés par l'utilisateur restent intacts.

```bash
git add frontend/prescription-app/package-lock.json
git add frontend/prescription-lib/package-lock.json
```

Vérifier qu'il y a bien des changements à committer. Si rien n'a changé :
```
⚠️  Aucun changement détecté dans les package-lock.json après npm update.
    ${LIB_NAME} est peut-être déjà à jour.
```
**Stopper.**

Construire le message de commit :
```
COMMIT_MSG="${COMMIT_PREFIX}: update ${LIB_NAME} dependency"
```

Committer en passant les chemins explicitement :

```bash
git commit \
  frontend/prescription-app/package-lock.json \
  frontend/prescription-lib/package-lock.json \
  -m "${COMMIT_MSG}"
```

Afficher :
```
✅ Commit créé : ${COMMIT_MSG}
```

Si `RUN_TEST` est `false`, afficher le résumé court et **stopper** :
```
✅ Workflow complete! (mode commit uniquement — relancer avec --test pour tester l'appli)

🌿 Branche  : ${NEW_BRANCH:-${CURRENT_BRANCH} (inchangée)}
📦 Update   : ${LIB_NAME} mis à jour dans prescription-app et prescription-lib
💾 Commit   : ${COMMIT_MSG}
```

### Step 5 — Lancer npm install

> ⚡ Cette étape n'est exécutée que si `--test` a été passé (`RUN_TEST=true`).

```bash
cd frontend/prescription-app
npm install

cd ../prescription-lib
npm install
```

Afficher après chaque commande :
```
📦 npm install — OK dans <dossier>
```

### Step 6 — Vérifier le proxy

> ⚡ Cette étape n'est exécutée que si `--test` a été passé (`RUN_TEST=true`).

Vérifier que la ligne définissant la constante `UPSTREAM_URL` dans `frontend/prescription-app/proxy.conf.js` contient exactement :

```
const UPSTREAM_URL = process.env.UPSTREAM_URL || URLS.fr;
```

Si ce n'est pas le cas, mettre à jour la ligne automatiquement :

```bash
sed -i 's|^const UPSTREAM_URL = .*|const UPSTREAM_URL = process.env.UPSTREAM_URL || URLS.fr;|' \
  frontend/prescription-app/proxy.conf.js
```

Afficher selon le résultat :
- Si déjà correct : `✅ proxy.conf.js — UPSTREAM_URL pointe déjà sur URLS.fr`
- Si corrigé :      `🔧 proxy.conf.js — UPSTREAM_URL mis à jour vers URLS.fr`

### Step 7 — Démarrer l'application

> ⚡ Cette étape n'est exécutée que si `--test` a été passé (`RUN_TEST=true`).

```bash
cd frontend/prescription-app
npm start
```

---

## Final output

### Sans `--test`

```
✅ Workflow complete! (mode commit uniquement — relancer avec --test pour tester l'appli)

🌿 Branche  : ${NEW_BRANCH:-${CURRENT_BRANCH} (inchangée)}
📦 Update   : ${LIB_NAME} mis à jour dans prescription-app et prescription-lib
💾 Commit   : ${COMMIT_MSG}
```

### Avec `--test`

```
✅ Workflow complete!

🌿 Branche  : ${NEW_BRANCH:-${CURRENT_BRANCH} (inchangée)}
📦 Update   : ${LIB_NAME} mis à jour dans prescription-app et prescription-lib
💾 Commit   : ${COMMIT_MSG}
🔧 Proxy    : UPSTREAM_URL → URLS.fr  (frontend/prescription-app/proxy.conf.js)
🚀 Start    : npm start lancé dans frontend/prescription-app
```

---

## Error handling

| Situation | Comportement |
|-----------|-------------|
| `--bug` absent et branche courante se terminant par `/develop` | "❌ Impossible de travailler directement sur la branche '…'" et stopper |
| `--bug` absent (branche courante valide) | Travaille sur la branche courante, commit `chore(deps)` |
| `--bug` fourni avec préfixe connu mais mal formaté | Afficher le format attendu et stopper |
| `--bug` avec préfixe inconnu | Crée une branche `quality/${BUG_ID}` en utilisant le BUG_ID directement, commit `chore(deps)` |
| Branche `${NEW_BRANCH}` déjà existante | Afficher l'erreur et stopper |
| HEAD détaché (detached HEAD) | "❌ Detached HEAD non supporté" et stopper |
| `package.json` absent dans un des deux dossiers | "❌ package.json introuvable dans <dossier>" et stopper |
| `--lib` fourni mais absent des deux `package.json` | "❌ `${LIB_NAME}` introuvable dans les dépendances communes" et stopper |
| `--lib` présent dans un seul des deux projets | Avertir et demander confirmation avant de continuer |
| Choix invalide dans la liste interactive | Afficher `❌ Choix invalide` et re-présenter la liste |
| `npm update` ne produit aucun changement | Avertir que la lib est déjà à jour et stopper |
| `npm install` échoue (mode `--test` uniquement) | Afficher le log d'erreur npm et stopper |
| `proxy.conf.js` introuvable (mode `--test` uniquement) | "❌ proxy.conf.js introuvable" et stopper |
