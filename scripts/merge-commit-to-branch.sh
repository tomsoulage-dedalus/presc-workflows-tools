#!/bin/bash

# =============================================================================
# merge-commit-to-branch.sh
#
# Script pour porter les commits d'un ticket vers une autre branche /develop.
#
# Usage : ./merge-commit-to-branch.sh <TICKET_ID> [--repo]
#
# Paramètres :
#   TICKET_ID  ID du bug ou de la story (ex: ORBISBUG-123, HORME-123)
#   --repo     (optionnel) Affiche la liste des dépôts disponibles pour en choisir un.
#              Sans ce flag, le dépôt orme-prescription est utilisé par défaut.
# =============================================================================

set -e

# ---- Paramètres --------------------------------------------------------------

TICKET=""
SELECT_REPO=false
REPOS_BASE_DIR="/home/orbisu/work"
DEFAULT_REPO="orme-prescription"

for arg in "$@"; do
    case "$arg" in
        --repo) SELECT_REPO=true ;;
        *)      TICKET="$arg" ;;
    esac
done

if [ -z "$TICKET" ]; then
    echo ""
    read -rp "Entrez l'identifiant du ticket (ex: ORBISBUG-123, HORME-123) : " TICKET
fi

if ! [[ "$TICKET" =~ ^[A-Z]+-[0-9]+$ ]]; then
    echo "Format de ticket invalide '${TICKET}'."
    read -rp "Entrez l'identifiant du ticket (ex: ORBISBUG-123, HORME-123) : " TICKET
fi

if ! [[ "$TICKET" =~ ^[A-Z]+-[0-9]+$ ]]; then
    echo "Erreur : format de ticket invalide '${TICKET}'."
    echo "Le ticket doit correspondre au pattern : ORBISBUG-123 ou HORME-123"
    exit 1
fi

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

# ---- Sélection du dépôt de travail ------------------------------------------

if [ "$SELECT_REPO" = true ]; then
    print_step "Recherche des dépôts Git dans ${BOLD}${REPOS_BASE_DIR}${NC}..."

    REPOS=()
    while IFS= read -r repo_path; do
        REPOS+=("$(basename "$repo_path")")
    done < <(find "$REPOS_BASE_DIR" -maxdepth 1 -mindepth 1 -type d | sort | while read -r dir; do
        [ -e "$dir/.git" ] && echo "$dir"
    done)

    if [ ${#REPOS[@]} -eq 0 ]; then
        print_error "Aucun dépôt Git trouvé dans ${REPOS_BASE_DIR}."
        exit 1
    fi

    echo ""
    echo -e "${YELLOW}${BOLD}Dépôts Git disponibles dans ${REPOS_BASE_DIR} :${NC}"
    for i in "${!REPOS[@]}"; do
        echo -e "  ${CYAN}$((i+1)).${NC} ${REPOS[$i]}"
    done

    echo ""
    read -rp "Choisissez le dépôt de travail (1-${#REPOS[@]}) : " REPO_CHOICE

    if ! [[ "$REPO_CHOICE" =~ ^[0-9]+$ ]] || [ "$REPO_CHOICE" -lt 1 ] || [ "$REPO_CHOICE" -gt "${#REPOS[@]}" ]; then
        print_error "Choix invalide : ${REPO_CHOICE}"
        exit 1
    fi

    SELECTED_REPO="${REPOS[$((REPO_CHOICE-1))]}"
else
    SELECTED_REPO="$DEFAULT_REPO"
fi

SELECTED_REPO_PATH="${REPOS_BASE_DIR}/${SELECTED_REPO}"

if [ ! -d "$SELECTED_REPO_PATH/.git" ]; then
    print_error "Le dépôt '${SELECTED_REPO}' est introuvable dans ${REPOS_BASE_DIR}."
    exit 1
fi

print_info "Dépôt de travail : ${BOLD}${SELECTED_REPO}${NC}"
cd "$SELECTED_REPO_PATH"

# ---- Fetch ------------------------------------------------------------------

print_step "Récupération des branches distantes..."
git fetch --all --prune
print_success "Fetch terminé."

# ---- Recherche des commits sur les branches /develop (priorité) -------------

print_step "Recherche des commits liés à ${TICKET} sur les branches /develop..."

ALL_DEVELOP_BRANCHES=()
while IFS= read -r line; do
    branch=$(echo "$line" | sed 's|^[[:space:]]*origin/||' | tr -d ' ')
    ALL_DEVELOP_BRANCHES+=("$branch")
done < <(git branch -r | grep -E '/develop$' | grep -v 'HEAD')

# Tableaux parallèles : noms de branches ayant des commits + leurs hashes
DEVELOP_WITH_COMMITS=()
DEVELOP_COMMITS_DATA=()

for dev_branch in "${ALL_DEVELOP_BRANCHES[@]}"; do
    # Toujours utiliser le ref distant (à jour après git fetch) pour la recherche,
    # afin d'éviter qu'une branche locale en retard masque des commits récents.
    ref="origin/${dev_branch}"
    found_hashes=()
    while IFS= read -r h; do
        [ -n "$h" ] && found_hashes+=("$h")
    done < <(git log --format="%H" --regexp-ignore-case --grep="$TICKET" "$ref")
    if [ ${#found_hashes[@]} -gt 0 ]; then
        DEVELOP_WITH_COMMITS+=("$dev_branch")
        DEVELOP_COMMITS_DATA+=("${found_hashes[*]}")
    fi
done

SOURCE_IS_DEVELOP=false
ALL_FOUND_HASHES=()
CURRENT_BRANCH=""

if [ ${#DEVELOP_WITH_COMMITS[@]} -gt 0 ]; then
    # ---- Commits trouvés sur une ou plusieurs branches /develop ---------------
    SOURCE_IS_DEVELOP=true

    if [ ${#DEVELOP_WITH_COMMITS[@]} -eq 1 ]; then
        CURRENT_BRANCH="${DEVELOP_WITH_COMMITS[0]}"
        read -ra ALL_FOUND_HASHES <<< "${DEVELOP_COMMITS_DATA[0]}"
        print_success "Commits trouvés sur la branche /develop : ${BOLD}${CURRENT_BRANCH}${NC}"
    else
        echo ""
        echo -e "${YELLOW}${BOLD}Commits liés à ${TICKET} trouvés sur plusieurs branches /develop :${NC}"
        for i in "${!DEVELOP_WITH_COMMITS[@]}"; do
            nb=$(echo "${DEVELOP_COMMITS_DATA[$i]}" | wc -w)
            echo -e "  ${CYAN}$((i+1)).${NC} ${DEVELOP_WITH_COMMITS[$i]}  ${CYAN}(${nb} commit(s))${NC}"
        done
        echo ""
        read -rp "Choisissez la branche source (1-${#DEVELOP_WITH_COMMITS[@]}) : " SRC_CHOICE
        if ! [[ "$SRC_CHOICE" =~ ^[0-9]+$ ]] || [ "$SRC_CHOICE" -lt 1 ] || [ "$SRC_CHOICE" -gt "${#DEVELOP_WITH_COMMITS[@]}" ]; then
            print_error "Choix invalide : ${SRC_CHOICE}"
            exit 1
        fi
        CURRENT_BRANCH="${DEVELOP_WITH_COMMITS[$((SRC_CHOICE-1))]}"
        read -ra ALL_FOUND_HASHES <<< "${DEVELOP_COMMITS_DATA[$((SRC_CHOICE-1))]}"
    fi

else
    # ---- Fallback : recherche d'une branche source liée au ticket -------------
    print_warning "Aucun commit lié à ${TICKET} trouvé sur les branches /develop."
    print_step "Recherche des branches liées à ${TICKET}..."

    SOURCE_BRANCHES=()

    # Branches locales finissant par /<TICKET>
    while IFS= read -r branch; do
        branch=$(echo "$branch" | sed 's/^\*\s*//' | tr -d ' ')
        [ -n "$branch" ] && SOURCE_BRANCHES+=("$branch")
    done < <(git branch --list | grep -E "/${TICKET}(-[^/]*)?$")

    # Branches distantes finissant par /<TICKET> (strip origin/, dédoublonnage)
    while IFS= read -r line; do
        branch=$(echo "$line" | sed 's|^[[:space:]]*origin/||' | tr -d ' ')
        already=false
        for existing in "${SOURCE_BRANCHES[@]}"; do
            [ "$existing" = "$branch" ] && already=true && break
        done
        [ "$already" = false ] && [ -n "$branch" ] && SOURCE_BRANCHES+=("$branch")
    done < <(git branch -r | grep -E "/${TICKET}(-[^/]*)?$" | grep -v 'HEAD')

    if [ ${#SOURCE_BRANCHES[@]} -eq 0 ]; then
        print_error "Aucune branche trouvée pour le ticket ${TICKET}."
        print_error "Une branche doit exister avec un nom finissant par /${TICKET}"
        print_error "Exemple : 400XXXX/presc/bugfix/${TICKET}"
        exit 1
    fi

    if [ ${#SOURCE_BRANCHES[@]} -eq 1 ]; then
        CURRENT_BRANCH="${SOURCE_BRANCHES[0]}"
        print_info "Branche source trouvée : ${BOLD}${CURRENT_BRANCH}${NC}"
    else
        echo ""
        echo -e "${YELLOW}${BOLD}Plusieurs branches trouvées pour ${TICKET} :${NC}"
        for i in "${!SOURCE_BRANCHES[@]}"; do
            echo -e "  ${CYAN}$((i+1)).${NC} ${SOURCE_BRANCHES[$i]}"
        done
        echo ""
        read -rp "Choisissez la branche source (1-${#SOURCE_BRANCHES[@]}) : " SRC_CHOICE
        if ! [[ "$SRC_CHOICE" =~ ^[0-9]+$ ]] || [ "$SRC_CHOICE" -lt 1 ] || [ "$SRC_CHOICE" -gt "${#SOURCE_BRANCHES[@]}" ]; then
            print_error "Choix invalide : ${SRC_CHOICE}"
            exit 1
        fi
        CURRENT_BRANCH="${SOURCE_BRANCHES[$((SRC_CHOICE-1))]}"
    fi

    if [[ "$CURRENT_BRANCH" != */* ]]; then
        print_error "La branche '${CURRENT_BRANCH}' ne respecte pas la convention attendue."
        print_error "Format attendu : <version>/<type>/... (ex: 400XXXX/presc/bugfix/${TICKET})"
        exit 1
    fi
fi

# Toujours utiliser le ref distant (à jour après git fetch) pour git log
LOG_REF="origin/${CURRENT_BRANCH}"

# Préfixe de version = tout ce qui est avant le premier '/'
# Ex : "400XXXX/presc/bugfix/ORBISBUG-123" -> "400XXXX"
CURRENT_PREFIX=$(echo "$CURRENT_BRANCH" | cut -d'/' -f1)

print_title "Cherry-pick vers une autre branche /develop"
print_info "Dépôt              : ${BOLD}${SELECTED_REPO}${NC}"
print_info "Branche source     : ${BOLD}${CURRENT_BRANCH}${NC}"
print_info "Préfixe de version : ${BOLD}${CURRENT_PREFIX}${NC}"
print_info "Ticket             : ${BOLD}${TICKET}${NC}"


# ---- Recherche des branches /develop cibles ---------------------------------

print_step "Recherche des branches **/develop disponibles..."

DEVELOP_BRANCHES=()
while IFS= read -r line; do
    # Supprime le préfixe "  origin/"
    branch_full=$(echo "$line" | sed 's|^[[:space:]]*origin/||')
    branch_prefix=$(echo "$branch_full" | cut -d'/' -f1)

    # On exclut les branches ayant le même préfixe de version que la branche courante
    if [ "$branch_prefix" != "$CURRENT_PREFIX" ]; then
        DEVELOP_BRANCHES+=("$branch_full")
    fi
done < <(git branch -r | grep -E '/develop$' | grep -v 'HEAD')

if [ ${#DEVELOP_BRANCHES[@]} -eq 0 ]; then
    print_error "Aucune branche /develop cible trouvée (autre que '${CURRENT_PREFIX}/develop')."
    exit 1
fi

# ---- Sélection de la branche cible ------------------------------------------

echo ""
echo -e "${YELLOW}${BOLD}Branches /develop disponibles :${NC}"
for i in "${!DEVELOP_BRANCHES[@]}"; do
    echo -e "  ${CYAN}$((i+1)).${NC} ${DEVELOP_BRANCHES[$i]}"
done

echo ""
read -rp "Choisissez la branche cible (1-${#DEVELOP_BRANCHES[@]}) : " CHOICE

if ! [[ "$CHOICE" =~ ^[0-9]+$ ]] || [ "$CHOICE" -lt 1 ] || [ "$CHOICE" -gt "${#DEVELOP_BRANCHES[@]}" ]; then
    print_error "Choix invalide : ${CHOICE}"
    exit 1
fi

TARGET_DEVELOP="${DEVELOP_BRANCHES[$((CHOICE-1))]}"
TARGET_PREFIX=$(echo "$TARGET_DEVELOP" | cut -d'/' -f1)

echo ""
print_info "Branche cible sélectionnée : ${BOLD}${TARGET_DEVELOP}${NC}"
print_info "Préfixe cible              : ${BOLD}${TARGET_PREFIX}${NC}"

# ---- Construction du nom de la nouvelle branche -----------------------------

# Détermine le type de branche selon le préfixe du ticket :
#   ORBISBUG-* ou HDEFECT-* -> presc/bugfix/<TICKET>
#   HORME-*                 -> presc/feature/<TICKET>
if [[ "$TICKET" =~ ^(ORBISBUG|HDEFECT)- ]]; then
    TICKET_PATH="presc/bugfix/${TICKET}"
elif [[ "$TICKET" =~ ^HORME- ]]; then
    TICKET_PATH="presc/feature/${TICKET}"
else
    TICKET_PATH="presc/bugfix/${TICKET}"
    print_warning "Préfixe de ticket non reconnu, type de branche par défaut : bugfix"
fi

NEW_BRANCH="${TARGET_PREFIX}/${TICKET_PATH}"
print_info "Nouvelle branche à créer   : ${BOLD}${NEW_BRANCH}${NC}"

# ---- Recherche des commits à cherry-picker ----------------------------------

if [ "$SOURCE_IS_DEVELOP" = false ]; then
    echo ""
    print_step "Recherche des commits relatifs au ticket ${TICKET}..."

    ALL_FOUND_HASHES=()
    while IFS= read -r commit_hash; do
        [ -n "$commit_hash" ] && ALL_FOUND_HASHES+=("$commit_hash")
    done < <(git log --format="%H" --regexp-ignore-case --grep="$TICKET" "$LOG_REF")

    if [ ${#ALL_FOUND_HASHES[@]} -eq 0 ]; then
        print_error "Aucun commit mentionnant '${TICKET}' trouvé sur la branche ${CURRENT_BRANCH}."
        print_error "Vérifiez que le message de commit contient bien le numéro de ticket."
        exit 1
    fi

    # ---- Avertissement : commits trouvés sur une branche ticket, pas sur /develop ----
    echo ""
    print_warning "Aucun commit lié à ${TICKET} n'a été trouvé sur les branches /develop."
    print_warning "Les commits suivants ont été trouvés sur la branche ticket : ${BOLD}${CURRENT_BRANCH}${NC}"
    echo ""
    printf "  %-10s %-20s %-30s %s\n" "Hash" "Date" "Auteur" "Message"
    printf "  %-10s %-20s %-30s %s\n" "----------" "--------------------" "------------------------------" "-------"
    for hash in "${ALL_FOUND_HASHES[@]}"; do
        commit_date=$(git log -1 --format="%ci" "$hash" | cut -c1-16)
        commit_author=$(git log -1 --format="%an" "$hash" | cut -c1-29)
        commit_msg=$(git log -1 --format="%s" "$hash" | cut -c1-60)
        printf "  ${YELLOW}%-10s${NC} %-20s %-30s %s\n" "$hash" "$commit_date" "$commit_author" "$commit_msg"
    done
    echo ""
    print_warning "Ces commits proviennent d'une branche ticket et non d'une branche /develop."
    read -rp "Confirmer l'utilisation de ces commits pour le cherry-pick ? (y/N) : " CONFIRM_TICKET_BRANCH
    if [[ ! "$CONFIRM_TICKET_BRANCH" =~ ^[Yy]$ ]]; then
        echo "Annulé."
        exit 0
    fi
fi

# Affichage de la liste détaillée avec date et auteur
echo ""
echo -e "${GREEN}${BOLD}Commits trouvés pour ${TICKET} (${#ALL_FOUND_HASHES[@]}) :${NC}"
echo ""
printf "  %-4s %-10s %-20s %-30s %s\n" "Num" "Hash" "Date" "Auteur" "Message"
printf "  %-4s %-10s %-20s %-30s %s\n" "---" "----------" "--------------------" "------------------------------" "-------"
for i in "${!ALL_FOUND_HASHES[@]}"; do
    hash="${ALL_FOUND_HASHES[$i]}"
    commit_date=$(git log -1 --format="%ci" "$hash" | cut -c1-16)
    commit_author=$(git log -1 --format="%an" "$hash" | cut -c1-29)
    commit_msg=$(git log -1 --format="%s" "$hash" | cut -c1-60)
    printf "  ${CYAN}%-4s${NC} %-10s %-20s %-30s %s\n" \
        "$((i+1))." "$hash" "$commit_date" "$commit_author" "$commit_msg"
done

# Sélection des commits si plusieurs trouvés
COMMITS_TO_PICK=()
if [ ${#ALL_FOUND_HASHES[@]} -eq 1 ]; then
    echo ""
    print_info "Un seul commit trouvé, il sera cherry-pické."
    COMMITS_TO_PICK=("${ALL_FOUND_HASHES[@]}")
else
    echo ""
    print_warning "${#ALL_FOUND_HASHES[@]} commits trouvés. Précisez lesquels cherry-picker."
    echo -e "  ${CYAN}•${NC} Entrez les numéros séparés par des virgules  ex: ${BOLD}1,3${NC}"
    echo -e "  ${CYAN}•${NC} Ou tapez ${BOLD}all${NC} pour les prendre tous"
    echo ""
    read -rp "Votre sélection : " SELECTION

    if [[ "$SELECTION" =~ ^[Aa][Ll][Ll]$ ]]; then
        COMMITS_TO_PICK=("${ALL_FOUND_HASHES[@]}")
    else
        # Validation et construction de la liste à partir des numéros saisis
        IFS=',' read -ra SELECTED_NUMS <<< "$SELECTION"
        INVALID=0
        for num in "${SELECTED_NUMS[@]}"; do
            num=$(echo "$num" | tr -d '[:space:]')
            if ! [[ "$num" =~ ^[0-9]+$ ]] || [ "$num" -lt 1 ] || [ "$num" -gt "${#ALL_FOUND_HASHES[@]}" ]; then
                print_error "Numéro invalide : ${num}"
                INVALID=1
            else
                COMMITS_TO_PICK+=("${ALL_FOUND_HASHES[$((num-1))]}")
            fi
        done
        if [ "$INVALID" -eq 1 ]; then
            exit 1
        fi
        if [ ${#COMMITS_TO_PICK[@]} -eq 0 ]; then
            print_error "Aucun commit sélectionné."
            exit 1
        fi
    fi

    echo ""
    echo -e "${GREEN}${BOLD}Commits sélectionnés (${#COMMITS_TO_PICK[@]}) :${NC}"
    for commit in "${COMMITS_TO_PICK[@]}"; do
        commit_date=$(git log -1 --format="%ci" "$commit" | cut -c1-16)
        commit_author=$(git log -1 --format="%an" "$commit" | cut -c1-29)
        commit_msg=$(git log -1 --format="%s" "$commit" | cut -c1-60)
        echo -e "  ${GREEN}✓${NC} ${commit} | ${commit_date} | ${commit_author} | ${commit_msg}"
    done
fi

# ---- Confirmation -----------------------------------------------------------

echo ""
echo -e "${YELLOW}${BOLD}Récapitulatif des actions :${NC}"
echo -e "  1. Création d'un worktree temporaire sur ${BOLD}${TARGET_DEVELOP}${NC}"
echo -e "  2. Création de la branche              ${BOLD}${NEW_BRANCH}${NC}"
echo -e "  3. Push de la branche vide"
echo -e "  4. Cherry-pick de ${#COMMITS_TO_PICK[@]} commit(s) liés à ${TICKET}"
echo -e "  5. Push final"
echo -e "  6. Suppression du worktree temporaire"
echo -e "${GREEN}  ✓ Votre branche courante ${BOLD}${CURRENT_BRANCH}${GREEN} ne sera pas modifiée.${NC}"
echo ""
read -rp "Confirmer ? (y/N) : " CONFIRM

if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "Annulé."
    exit 0
fi

# ---- Worktree temporaire -----------------------------------------------------

WORKTREE_DIR=""

cleanup() {
    if [ -n "$WORKTREE_DIR" ] && [ -d "$WORKTREE_DIR" ]; then
        echo ""
        print_step "Nettoyage du worktree temporaire..."
        git -C "$SELECTED_REPO_PATH" worktree remove --force "$WORKTREE_DIR" 2>/dev/null || rm -rf "$WORKTREE_DIR"
        print_success "Worktree supprimé."
    fi
}
trap cleanup EXIT INT TERM

WORKTREE_DIR=$(mktemp -d --tmpdir "merge-commit-to-branch-XXXXXX")

print_step "Création d'un worktree temporaire sur ${TARGET_DEVELOP}..."
git worktree add "$WORKTREE_DIR" "origin/${TARGET_DEVELOP}"
print_success "Worktree prêt : ${WORKTREE_DIR}"

cd "$WORKTREE_DIR"

# ---- Mise à jour de la branche /develop cible --------------------------------

print_step "Mise à jour de ${TARGET_DEVELOP} (pull --rebase)..."
git pull --rebase origin "$TARGET_DEVELOP"
print_success "${TARGET_DEVELOP} est à jour."

# ---- Vérification que la nouvelle branche n'existe pas déjà -----------------

if git show-ref --verify --quiet "refs/heads/${NEW_BRANCH}"; then
    print_error "La branche '${NEW_BRANCH}' existe déjà en local. Veuillez la supprimer d'abord."
    exit 1
fi

if git ls-remote --exit-code --heads origin "$NEW_BRANCH" > /dev/null 2>&1; then
    print_error "La branche '${NEW_BRANCH}' existe déjà sur le remote. Veuillez la supprimer d'abord."
    exit 1
fi

# ---- Création et push de la nouvelle branche (vide) -------------------------

print_step "Création de la branche ${NEW_BRANCH}..."
git checkout -b "$NEW_BRANCH"

print_step "Push de la branche vide..."
git push origin "$NEW_BRANCH"
print_success "Branche ${NEW_BRANCH} poussée."

# ---- Cherry-pick (du plus ancien au plus récent) ----------------------------

echo ""
print_step "Cherry-pick des ${#COMMITS_TO_PICK[@]} commit(s) (du plus ancien au plus récent)..."

# Inversion du tableau : COMMITS_TO_PICK est du plus récent au plus ancien
for ((i=${#COMMITS_TO_PICK[@]}-1; i>=0; i--)); do
    commit="${COMMITS_TO_PICK[$i]}"
    MSG=$(git log --oneline -1 "$commit")
    print_step "Cherry-picking : ${MSG}"

    if ! git cherry-pick "$commit"; then
        echo ""
        print_warning "Conflits détectés lors du cherry-pick du commit ${commit}."

        # ---- Détection d'un outil de fusion visuel ---------------------------
        DETECTED_TOOL=""
        DETECTED_TOOL_NAME=""

        for candidate in idea idea.sh; do
            if command -v "$candidate" &>/dev/null; then
                DETECTED_TOOL="$candidate"
                DETECTED_TOOL_NAME="IntelliJ IDEA"
                break
            fi
        done
        if [ -z "$DETECTED_TOOL" ] && command -v code &>/dev/null; then
            DETECTED_TOOL="code"
            DETECTED_TOOL_NAME="VS Code"
        fi
        if [ -z "$DETECTED_TOOL" ] && command -v meld &>/dev/null; then
            DETECTED_TOOL="meld"
            DETECTED_TOOL_NAME="Meld"
        fi

        RESOLVED=false

        if [ -n "$DETECTED_TOOL" ]; then
            echo ""
            print_info "Outil de fusion détecté : ${BOLD}${DETECTED_TOOL_NAME}${NC}"
            read -rp "Ouvrir ${DETECTED_TOOL_NAME} pour résoudre les conflits visuellement ? (y/N) : " USE_VISUAL

            if [[ "$USE_VISUAL" =~ ^[Yy]$ ]]; then
                case "$DETECTED_TOOL" in
                    idea|idea.sh)
                        MERGETOOL_CMD="${DETECTED_TOOL} merge \"\$LOCAL\" \"\$REMOTE\" \"\$BASE\" \"\$MERGED\""
                        ;;
                    code)
                        MERGETOOL_CMD="code --wait \"\$MERGED\""
                        ;;
                    meld)
                        MERGETOOL_CMD="meld \"\$LOCAL\" \"\$BASE\" \"\$REMOTE\" --output \"\$MERGED\""
                        ;;
                esac

                print_step "Ouverture de ${DETECTED_TOOL_NAME} pour chaque fichier en conflit..."
                git -c "merge.tool=vt" \
                    -c "mergetool.vt.cmd=${MERGETOOL_CMD}" \
                    -c "mergetool.vt.trustExitCode=false" \
                    mergetool --no-prompt

                echo ""
                read -rp "Conflits résolus ? Continuer le cherry-pick ? (y/N) : " CONTINUE_CHERRY
                if [[ "$CONTINUE_CHERRY" =~ ^[Yy]$ ]]; then
                    git cherry-pick --continue --no-edit
                    RESOLVED=true
                fi
            fi
        fi

        if [ "$RESOLVED" = false ]; then
            echo ""
            print_error "Cherry-pick interrompu pour le commit ${commit}."
            print_error "Le worktree temporaire est conservé : ${WORKTREE_DIR}"
            print_error "Pour reprendre manuellement :"
            print_error "  cd ${WORKTREE_DIR}"
            print_error "  # Résoudre les conflits"
            print_error "  git cherry-pick --continue"
            print_error "  git push origin ${NEW_BRANCH}"
            print_error "Puis supprimer le worktree :"
            print_error "  git -C ${SELECTED_REPO_PATH} worktree remove ${WORKTREE_DIR}"
            WORKTREE_DIR=""  # Désactive le cleanup automatique
            exit 1
        fi
    fi

    print_success "Appliqué : ${MSG}"
done

# ---- Push final -------------------------------------------------------------

echo ""
print_step "Push final de ${NEW_BRANCH}..."
git push origin "$NEW_BRANCH"

echo ""
print_title "Terminé avec succès !"
print_success "Branche créée et poussée : ${BOLD}${NEW_BRANCH}${NC}"
print_info   "${#COMMITS_TO_PICK[@]} commit(s) cherry-pickés depuis ${BOLD}${CURRENT_BRANCH}${NC}"


