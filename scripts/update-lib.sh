#!/bin/bash

# =============================================================================
# update-lib.sh
#
# Met à jour une ou plusieurs dépendances npm choisies dans prescription-app et
# prescription-lib. Chaque lib fait l'objet d'un commit dédié sur la même
# branche : après chaque commit, l'utilisateur peut choisir d'enchaîner avec
# une autre lib avant de passer au push / à la création de la PR.
#
# Usage : ./update-lib.sh [--bug BUG_ID] [--lib LIB_NAME] [--test]
#
# Paramètres :
#   --bug BUG_ID    (optionnel) Identifiant du bug (ex: ORBISBUG-135) ou suffixe
#                   de branche libre (ex: eknit-update-version). Sans ce
#                   paramètre, il est demandé interactivement (aucun format requis).
#   --lib LIB_NAME  (optionnel) Nom exact de la dépendance npm à mettre à jour
#                   pour le premier commit. Sans ce paramètre, une liste
#                   interactive est présentée. Les libs suivantes (si l'utilisateur
#                   choisit d'en ajouter) sont toujours sélectionnées interactivement.
#   --test          (optionnel) Enchaîne npm install, vérification du proxy et
#                   démarrage de l'application après le(s) commit(s).
#
# Comportement selon BUG_ID (fourni via --bug ou saisi interactivement) :
#   - Préfixe connu (ORBISBUG, HDEFECT, HORME) : branche presc/bugfix/<BUG_ID>,
#     commit "fix(<BUG_ID>)".
#   - Préfixe inconnu / format libre : branche presc/quality/<BUG_ID>,
#     commit "chore(deps)".
#
# Après le(s) commit(s), l'utilisateur est interrogé pour pousser la branche et
# créer une Pull Request GitHub (nécessite GITHUB_TOKEN ou 'gh auth login').
#
# Le script doit être lancé depuis un dépôt contenant frontend/prescription-app
# et frontend/prescription-lib (ex: orme-prescription).
# =============================================================================

set -euo pipefail

# ---- Couleurs ----------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

print_info()    { echo -e "${BLUE}ℹ  $*${NC}"; }
print_success() { echo -e "${GREEN}✓  $*${NC}"; }
print_warning() { echo -e "${YELLOW}⚠  $*${NC}"; }
print_error()   { echo -e "${RED}✗  $*${NC}"; }
print_step()    { echo -e "${CYAN}▶  $*${NC}"; }
print_title()   { echo -e "\n${BOLD}${YELLOW}=== $* ===${NC}\n"; }

# ---- Paramètres ---------------------------------------------------------------

BUG_ID=""
LIB_NAME=""
RUN_TEST=false

while [ $# -gt 0 ]; do
    case "$1" in
        --bug)
            BUG_ID="${2:-}"
            shift 2
            ;;
        --bug=*)
            BUG_ID="${1#--bug=}"
            shift
            ;;
        --lib)
            LIB_NAME="${2:-}"
            shift 2
            ;;
        --lib=*)
            LIB_NAME="${1#--lib=}"
            shift
            ;;
        --test)
            RUN_TEST=true
            shift
            ;;
        *)
            print_error "Paramètre inconnu : $1"
            exit 1
            ;;
    esac
done

# ---- Step 1 — Vérifications préalables ----------------------------------------

print_title "Step 1 — Vérifications préalables"

REPO_ROOT=$(git rev-parse --show-toplevel)
cd "$REPO_ROOT"

APP_PKG="frontend/prescription-app/package.json"
LIB_PKG="frontend/prescription-lib/package.json"

# Si le dépôt courant ne contient pas prescription-app/prescription-lib (ex: le
# script est lancé depuis presc-workflows-tools), on recherche automatiquement
# un dépôt voisin qui les contient (typiquement orme-prescription dans le
# même dossier parent, ex: ~/work). Surchargeable via PRESC_REPO_DIR.
if [ ! -f "$APP_PKG" ] || [ ! -f "$LIB_PKG" ]; then
    CANDIDATE=""
    if [ -n "${PRESC_REPO_DIR:-}" ] && [ -f "${PRESC_REPO_DIR}/${APP_PKG}" ] && [ -f "${PRESC_REPO_DIR}/${LIB_PKG}" ]; then
        CANDIDATE="$PRESC_REPO_DIR"
    else
        PARENT_DIR=$(dirname "$REPO_ROOT")
        for d in "$PARENT_DIR"/orme-prescription "$PARENT_DIR"/*/; do
            d="${d%/}"
            if [ -f "$d/$APP_PKG" ] && [ -f "$d/$LIB_PKG" ]; then
                CANDIDATE="$d"
                break
            fi
        done
    fi

    if [ -n "$CANDIDATE" ]; then
        print_info "prescription-app/prescription-lib introuvables dans ${REPO_ROOT}, utilisation de ${BOLD}${CANDIDATE}${NC}"
        REPO_ROOT="$CANDIDATE"
        cd "$REPO_ROOT"
    fi
fi

if [ ! -f "$APP_PKG" ]; then
    print_error "package.json introuvable dans frontend/prescription-app"
    exit 1
fi
if [ ! -f "$LIB_PKG" ]; then
    print_error "package.json introuvable dans frontend/prescription-lib"
    exit 1
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "HEAD")
if [ "$CURRENT_BRANCH" = "HEAD" ]; then
    print_error "Detached HEAD non supporté"
    exit 1
fi
print_info "Dépôt cible     : ${BOLD}${REPO_ROOT}${NC}"
print_info "Branche courante : ${BOLD}${CURRENT_BRANCH}${NC}"

# Demander le BUG_ID si absent (aucune validation de format requise)
while [ -z "$BUG_ID" ]; do
    read -rp "🔎 Aucun --bug fourni. Veuillez saisir l'identifiant du bug (ex: ORBISBUG-135) ou un suffixe de branche libre : " BUG_ID
    if [ -z "$BUG_ID" ]; then
        print_warning "La saisie ne peut pas être vide."
    fi
done

# Classification du BUG_ID
if [[ "$BUG_ID" =~ ^(ORBISBUG|HDEFECT|HORME)(-.*)?$ ]]; then
    COMMIT_PREFIX="fix(${BUG_ID})"
    BRANCH_TYPE="bugfix"
else
    COMMIT_PREFIX="chore(deps)"
    BRANCH_TYPE="quality"
fi
print_info "BUG_ID : ${BOLD}${BUG_ID}${NC} → branche ${BRANCH_TYPE}, commit \"${COMMIT_PREFIX}\""

# ---- Fonction — Sélection interactive d'une lib -------------------------------
#
# Affiche la liste des dépendances de prescription-app / prescription-lib, en
# excluant celles déjà mises à jour dans ce run (tableau global ALREADY_UPDATED),
# et place le choix de l'utilisateur dans la variable globale LIB_NAME.

select_lib_interactive() {
    LIB_LIST_OUTPUT=$(node -e "
      const app = require('./${APP_PKG}').dependencies || {};
      const lib = require('./${LIB_PKG}').dependencies || {};
      const exclude = new Set(process.argv.slice(1));
      const all = [...new Set([...Object.keys(app), ...Object.keys(lib)])].filter(k => !exclude.has(k)).sort();
      const common  = all.filter(k => k in app && k in lib);
      const appOnly = all.filter(k => k in app && !(k in lib));
      const libOnly = all.filter(k => !(k in app) && k in lib);
      let i = 1;
      const lines = [];
      const ordered = [];
      if (common.length) {
        lines.push('── Communes ──────────────────────────────────────────');
        common.forEach(k => { lines.push((i++) + ') ' + k + '  ' + app[k] + '  /  ' + lib[k]); ordered.push(k); });
      }
      if (appOnly.length) {
        lines.push('── prescription-app uniquement ───────────────────────');
        appOnly.forEach(k => { lines.push((i++) + ') ' + k + '  ' + app[k]); ordered.push(k); });
      }
      if (libOnly.length) {
        lines.push('── prescription-lib uniquement ───────────────────────');
        libOnly.forEach(k => { lines.push((i++) + ') ' + k + '  ' + lib[k]); ordered.push(k); });
      }
      console.log(lines.join('\n'));
      console.log('---NAMES---');
      console.log(ordered.join('\n'));
    " "${ALREADY_UPDATED[@]}")

    LIB_DISPLAY=$(echo "$LIB_LIST_OUTPUT" | sed -n '1,/---NAMES---/p' | sed '$d')
    LIB_NAMES_ORDERED=$(echo "$LIB_LIST_OUTPUT" | sed -n '/---NAMES---/,$p' | tail -n +2)

    mapfile -t LIB_ARRAY <<< "$LIB_NAMES_ORDERED"

    LIB_NAME=""
    while [ -z "$LIB_NAME" ]; do
        echo ""
        echo "📋 Dépendances disponibles :"
        echo ""
        echo "$LIB_DISPLAY"
        echo ""
        read -rp "👉 Entrez le numéro (ou le nom exact) de la lib à mettre à jour : " lib_choice

        if [[ "$lib_choice" =~ ^[0-9]+$ ]] && [ "$lib_choice" -ge 1 ] && [ "$lib_choice" -le "${#LIB_ARRAY[@]}" ]; then
            LIB_NAME="${LIB_ARRAY[$((lib_choice-1))]}"
        else
            for name in "${LIB_ARRAY[@]}"; do
                if [ "$name" = "$lib_choice" ]; then
                    LIB_NAME="$lib_choice"
                    break
                fi
            done
        fi

        if [ -z "$LIB_NAME" ]; then
            print_error "Choix invalide."
        fi
    done
}

ALREADY_UPDATED=()

# ---- Step 1b — Sélection de la lib (si --lib absent) --------------------------

if [ -z "$LIB_NAME" ]; then
    print_title "Step 1b — Sélection de la lib"
    select_lib_interactive
fi
print_info "Lib sélectionnée : ${BOLD}${LIB_NAME}${NC}"

# ---- Step 1c — Sélection de la branche de base (*/develop) --------------------

print_title "Step 1c — Sélection de la branche de base"

git fetch origin --prune --quiet || print_warning "Impossible de fetch origin (pas de réseau ?)"

DEVELOP_BRANCHES=$(git branch -a --format='%(refname:short)' \
    | sed 's#^origin/##' \
    | grep '/develop$' \
    | sort -u || true)

if [ -z "$DEVELOP_BRANCHES" ]; then
    print_error "Aucune branche se terminant par '/develop' n'a été trouvée (locale ou origin)."
    exit 1
fi

mapfile -t DEVELOP_ARRAY <<< "$DEVELOP_BRANCHES"

BASE_BRANCH=""
while [ -z "$BASE_BRANCH" ]; do
    echo ""
    echo "📋 Branches de base disponibles :"
    echo ""
    for i in "${!DEVELOP_ARRAY[@]}"; do
        echo "  $((i+1))) ${DEVELOP_ARRAY[$i]}"
    done
    echo ""
    read -rp "👉 Entrez le numéro (ou le nom exact) de la branche à partir de laquelle créer votre branche de travail : " base_choice

    if [[ "$base_choice" =~ ^[0-9]+$ ]] && [ "$base_choice" -ge 1 ] && [ "$base_choice" -le "${#DEVELOP_ARRAY[@]}" ]; then
        BASE_BRANCH="${DEVELOP_ARRAY[$((base_choice-1))]}"
    else
        for name in "${DEVELOP_ARRAY[@]}"; do
            if [ "$name" = "$base_choice" ]; then
                BASE_BRANCH="$base_choice"
                break
            fi
        done
    fi

    if [ -z "$BASE_BRANCH" ]; then
        print_error "Choix invalide."
    fi
done

ROOT_BRANCH="${BASE_BRANCH%%/*}"
NEW_BRANCH="${ROOT_BRANCH}/presc/${BRANCH_TYPE}/${BUG_ID}"
print_info "Branche de base : ${BOLD}${BASE_BRANCH}${NC}"
print_info "Nouvelle branche : ${BOLD}${NEW_BRANCH}${NC}"

if git show-ref --verify --quiet "refs/heads/${NEW_BRANCH}" \
    || git ls-remote --exit-code --heads origin "${NEW_BRANCH}" >/dev/null 2>&1; then
    print_error "La branche '${NEW_BRANCH}' existe déjà (locale ou origin)."
    exit 1
fi

# ---- Step 1d — Vérification des changements en cours --------------------------

print_title "Step 1d — Vérification des changements en cours"

while true; do
    PENDING_CHANGES=$(git status --porcelain)
    if [ -z "$PENDING_CHANGES" ]; then
        print_success "Aucun changement en cours."
        break
    fi

    print_warning "Des changements sont en cours sur la branche '${CURRENT_BRANCH}' :"
    echo ""
    git status --short
    echo ""
    read -rp "👉 Confirmez une fois que c'est fait pour poursuivre, ou tapez 'q' pour annuler : " confirm
    if [[ "$confirm" =~ ^[qQ]$ ]]; then
        print_info "Annulé par l'utilisateur."
        exit 1
    fi
done

# ---- Step 2 — Mettre à jour BASE_BRANCH et créer la branche -------------------

print_title "Step 2 — Créer la branche"

git fetch origin "${BASE_BRANCH}"
if git show-ref --verify --quiet "refs/heads/${BASE_BRANCH}"; then
    git checkout "${BASE_BRANCH}"
    git pull origin "${BASE_BRANCH}"
else
    git checkout -b "${BASE_BRANCH}" "origin/${BASE_BRANCH}"
fi
print_success "Branche '${BASE_BRANCH}' mise à jour depuis origin."

git checkout -b "${NEW_BRANCH}" "${BASE_BRANCH}"
print_success "Branche créée : ${NEW_BRANCH} (depuis ${BASE_BRANCH})"

# ---- Step 3 & 4 — Mettre à jour la/les lib(s) et créer un commit par lib ------
#
# Chaque lib choisie fait l'objet d'un commit dédié. Une fois le commit créé,
# l'utilisateur peut choisir d'enchaîner avec une autre lib (nouveau commit)
# avant de passer au push / à la création de la PR.

ALL_LIB_NAMES=()
ALL_COMMIT_MSGS=()
ALL_UPDATE_SCOPES=()
UPDATE_APP_ANY=false
UPDATE_LIB_PKG_ANY=false

FIRST_LIB=true
while true; do
    if [ "$FIRST_LIB" = false ]; then
        print_title "Step 3 — Sélection d'une lib supplémentaire"
        select_lib_interactive
        print_info "Lib sélectionnée : ${BOLD}${LIB_NAME}${NC}"
    fi
    FIRST_LIB=false

    print_title "Step 3 — Mettre à jour ${LIB_NAME}"

    PRESENCE=$(node -e "
      const app = require('./${APP_PKG}').dependencies || {};
      const lib = require('./${LIB_PKG}').dependencies || {};
      const inApp = '${LIB_NAME}' in app;
      const inLib = '${LIB_NAME}' in lib;
      if (inApp && inLib) console.log('both');
      else if (inApp)     console.log('app-only');
      else if (inLib)     console.log('lib-only');
      else                console.log('none');
    ")

    UPDATE_APP=false
    UPDATE_LIB_PKG=false
    case "$PRESENCE" in
        none)
            print_error "${LIB_NAME} introuvable dans les dépendances de prescription-app ni de prescription-lib."
            exit 1
            ;;
        app-only)
            print_warning "${LIB_NAME} n'existe que dans prescription-app (absent de prescription-lib)."
            UPDATE_APP=true
            ;;
        lib-only)
            print_warning "${LIB_NAME} n'existe que dans prescription-lib (absent de prescription-app)."
            UPDATE_LIB_PKG=true
            ;;
        both)
            UPDATE_APP=true
            UPDATE_LIB_PKG=true
            ;;
    esac

    if [ "$UPDATE_APP" = true ]; then
        (cd frontend/prescription-app && npm update "${LIB_NAME}")
        print_success "npm update ${LIB_NAME} — OK dans frontend/prescription-app"
    fi
    if [ "$UPDATE_LIB_PKG" = true ]; then
        (cd frontend/prescription-lib && npm update "${LIB_NAME}")
        print_success "npm update ${LIB_NAME} — OK dans frontend/prescription-lib"
    fi

    # ---- Step 4 — Créer le commit ----------------------------------------------

    print_title "Step 4 — Créer le commit"

    COMMIT_PATHS=()
    if [ "$UPDATE_APP" = true ]; then
        git add frontend/prescription-app/package-lock.json
        COMMIT_PATHS+=("frontend/prescription-app/package-lock.json")
    fi
    if [ "$UPDATE_LIB_PKG" = true ]; then
        git add frontend/prescription-lib/package-lock.json
        COMMIT_PATHS+=("frontend/prescription-lib/package-lock.json")
    fi

    if git diff --cached --quiet -- "${COMMIT_PATHS[@]}"; then
        print_warning "Aucun changement détecté dans les package-lock.json après npm update."
        print_warning "${LIB_NAME} est peut-être déjà à jour."
        exit 1
    fi

    COMMIT_MSG="${COMMIT_PREFIX}: update ${LIB_NAME} dependency"
    git commit "${COMMIT_PATHS[@]}" -m "${COMMIT_MSG}"
    print_success "Commit créé : ${COMMIT_MSG}"

    UPDATE_SCOPE="prescription-app et prescription-lib"
    if [ "$UPDATE_APP" = true ] && [ "$UPDATE_LIB_PKG" = false ]; then
        UPDATE_SCOPE="prescription-app uniquement"
    elif [ "$UPDATE_APP" = false ] && [ "$UPDATE_LIB_PKG" = true ]; then
        UPDATE_SCOPE="prescription-lib uniquement"
    fi

    ALL_LIB_NAMES+=("${LIB_NAME}")
    ALL_COMMIT_MSGS+=("${COMMIT_MSG}")
    ALL_UPDATE_SCOPES+=("${LIB_NAME}: ${UPDATE_SCOPE}")
    ALREADY_UPDATED+=("${LIB_NAME}")
    [ "$UPDATE_APP" = true ] && UPDATE_APP_ANY=true
    [ "$UPDATE_LIB_PKG" = true ] && UPDATE_LIB_PKG_ANY=true

    echo ""
    read -rp "➕ Voulez-vous mettre à jour une autre lib (dans un nouveau commit) avant de pousser ? (y/N) : " ADD_ANOTHER_LIB
    if [[ ! "$ADD_ANOTHER_LIB" =~ ^[yY]$ ]]; then
        break
    fi
done

# Récapitulatif consolidé (utilisé pour le titre/corps de la PR et le résumé final)
LIB_NAMES_STR=$(IFS=', '; echo "${ALL_LIB_NAMES[*]}")
if [ "${#ALL_LIB_NAMES[@]}" -eq 1 ]; then
    COMMIT_MSG="${ALL_COMMIT_MSGS[0]}"
else
    COMMIT_MSG="${COMMIT_PREFIX}: update ${LIB_NAMES_STR} dependencies"
fi

UPDATE_SCOPE="prescription-app et prescription-lib"
if [ "$UPDATE_APP_ANY" = true ] && [ "$UPDATE_LIB_PKG_ANY" = false ]; then
    UPDATE_SCOPE="prescription-app uniquement"
elif [ "$UPDATE_APP_ANY" = false ] && [ "$UPDATE_LIB_PKG_ANY" = true ]; then
    UPDATE_SCOPE="prescription-lib uniquement"
fi

# ---- Step 4b — Push & Pull Request (optionnel) --------------------------------

print_title "Step 4b — Push & Pull Request"

PR_URL=""
read -rp "🚀 Voulez-vous pousser la branche et créer une Pull Request GitHub ? (Y/n) : " DO_PUSH_PR

if [[ "$DO_PUSH_PR" =~ ^[Nn]$ ]]; then
    print_info "Push et création de PR ignorés."
else
    if ! git push origin "${NEW_BRANCH}"; then
        print_error "Échec du push de la branche ${NEW_BRANCH}."
        exit 1
    fi
    print_success "Branche poussée : ${NEW_BRANCH}"

    # Chargement des variables d'environnement (désactivation temporaire de
    # set -eu : .bashrc / /etc/bashrc référencent des variables non définies)
    # shellcheck source=/dev/null
    if [ -f "$HOME/.bashrc" ]; then
        set +eu
        source "$HOME/.bashrc"
        set -eu
    fi

    # Résolution du token GitHub : $GITHUB_TOKEN puis 'gh auth token'
    if [ -z "${GITHUB_TOKEN:-}" ] && command -v gh &>/dev/null; then
        GITHUB_TOKEN=$(gh auth token 2>/dev/null || true)
    fi

    if [ -z "${GITHUB_TOKEN:-}" ]; then
        print_warning "Aucun token GitHub trouvé : la Pull Request ne sera pas créée."
        print_warning "Option 1 (recommandée) : installer gh CLI et lancer 'gh auth login'"
        print_warning "Option 2              : export GITHUB_TOKEN=<votre-PAT> dans ~/.bashrc"
    else
        # Extraction du owner/repo depuis l'URL du remote origin
        REMOTE_URL=$(git remote get-url origin 2>/dev/null)
        GH_REPO=""
        if [[ "$REMOTE_URL" =~ git@github\.com:(.+/.+)\.git$ ]]; then
            GH_REPO="${BASH_REMATCH[1]}"
        elif [[ "$REMOTE_URL" =~ https://github\.com/(.+/.+)\.git$ ]]; then
            GH_REPO="${BASH_REMATCH[1]}"
        elif [[ "$REMOTE_URL" =~ https://github\.com/(.+/.+)$ ]]; then
            GH_REPO="${BASH_REMATCH[1]}"
        fi

        if [ -z "$GH_REPO" ]; then
            print_warning "Impossible d'extraire owner/repo depuis l'URL remote : ${REMOTE_URL}"
            print_warning "La Pull Request ne sera pas créée."
        else
            GH_API="https://api.github.com/repos/${GH_REPO}"
            GH_REPO_OWNER="${GH_REPO%%/*}"
            print_info "Dépôt GitHub : ${BOLD}${GH_REPO}${NC}"

            print_step "Vérification si une PR existe déjà..."
            EXISTING_PR=$(curl -s \
                -H "Authorization: token ${GITHUB_TOKEN}" \
                -H "Accept: application/vnd.github+json" \
                "${GH_API}/pulls?state=open&head=${GH_REPO_OWNER}:${NEW_BRANCH}" \
                | jq -r '.[0].html_url // ""' 2>/dev/null) || EXISTING_PR=""

            if [ -n "$EXISTING_PR" ]; then
                print_warning "Une PR existe déjà pour cette branche :"
                print_info "  ${EXISTING_PR}"
                PR_URL="$EXISTING_PR"
            else
                if [ -n "${JIRA_DOMAIN:-}" ] && [[ "$BUG_ID" =~ ^(ORBISBUG|HDEFECT|HORME) ]]; then
                    JIRA_LINK="[${BUG_ID}](https://${JIRA_DOMAIN}/browse/${BUG_ID})"
                else
                    JIRA_LINK="${BUG_ID}"
                fi

                DEPS_DESCRIPTION=""
                for scope_line in "${ALL_UPDATE_SCOPES[@]}"; do
                    DEPS_DESCRIPTION="${DEPS_DESCRIPTION}- **${scope_line}**"$'\n'
                done

                PR_BODY="## Jira Ticket

${JIRA_LINK}

## Description

Mise à jour de(s) dépendance(s) :

${DEPS_DESCRIPTION}
## Tests

<!-- Résultats des tests -->
"

                print_step "Création de la Pull Request..."
                PR_PAYLOAD=$(jq -n \
                    --arg title "$COMMIT_MSG" \
                    --arg body  "$PR_BODY" \
                    --arg head  "$NEW_BRANCH" \
                    --arg base  "$BASE_BRANCH" \
                    '{title: $title, body: $body, head: $head, base: $base}')

                PR_RESPONSE=$(curl -s \
                    -X POST \
                    -H "Authorization: token ${GITHUB_TOKEN}" \
                    -H "Accept: application/vnd.github+json" \
                    "${GH_API}/pulls" \
                    -d "$PR_PAYLOAD")

                PR_URL=$(echo "$PR_RESPONSE" | jq -r '.html_url // ""' 2>/dev/null) || PR_URL=""

                if [ -z "$PR_URL" ] || [ "$PR_URL" = "null" ]; then
                    PR_ERROR=$(echo "$PR_RESPONSE" | jq -r '.message // "Erreur inconnue"' 2>/dev/null) || PR_ERROR="Erreur inconnue"
                    print_error "Échec de la création de la PR : ${PR_ERROR}"
                    print_warning "La branche ${NEW_BRANCH} a bien été poussée, mais sans PR."
                    PR_URL=""
                else
                    print_success "Pull Request créée : ${PR_URL}"
                fi
            fi
        fi
    fi
fi

print_summary() {
    echo ""
    echo -e "${BOLD}${GREEN}✅ Workflow complete!${NC}$1"
    echo ""
    echo "🌿 Branche  : ${NEW_BRANCH}  (depuis ${BASE_BRANCH})"
    echo "📦 Update   : ${#ALL_LIB_NAMES[@]} lib(s) — ${LIB_NAMES_STR}"
    for i in "${!ALL_LIB_NAMES[@]}"; do
        echo "   $((i+1))) ${ALL_UPDATE_SCOPES[$i]}"
        echo "      💾 ${ALL_COMMIT_MSGS[$i]}"
    done
    if [ -n "$PR_URL" ]; then
        echo "🔗 PR       : ${PR_URL}"
    fi
}

if [ "$RUN_TEST" = false ]; then
    print_summary " (mode commit uniquement — relancer avec --test pour tester l'appli)"
    exit 0
fi

# ---- Step 5 — Lancer npm install -----------------------------------------------

print_title "Step 5 — npm install"

(cd frontend/prescription-app && npm install)
print_success "npm install — OK dans frontend/prescription-app"
(cd frontend/prescription-lib && npm install)
print_success "npm install — OK dans frontend/prescription-lib"

# ---- Step 6 — Vérifier le proxy -------------------------------------------------

print_title "Step 6 — Vérifier le proxy"

PROXY_FILE="frontend/prescription-app/proxy.conf.js"
if [ ! -f "$PROXY_FILE" ]; then
    print_error "proxy.conf.js introuvable"
    exit 1
fi

if grep -q '^const UPSTREAM_URL = process\.env\.UPSTREAM_URL || URLS\.fr;' "$PROXY_FILE"; then
    print_success "proxy.conf.js — UPSTREAM_URL pointe déjà sur URLS.fr"
else
    sed -i 's|^const UPSTREAM_URL = .*|const UPSTREAM_URL = process.env.UPSTREAM_URL || URLS.fr;|' "$PROXY_FILE"
    print_success "proxy.conf.js — UPSTREAM_URL mis à jour vers URLS.fr"
fi

# ---- Step 7 — Démarrer l'application --------------------------------------------

print_title "Step 7 — Démarrer l'application"

print_summary $'\n🔧 Proxy    : UPSTREAM_URL → URLS.fr  (frontend/prescription-app/proxy.conf.js)\n🚀 Start    : npm start lancé dans frontend/prescription-app'

cd frontend/prescription-app
exec npm start
