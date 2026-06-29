#!/bin/bash

# =============================================================================
# switch-branch-all-repos.sh
#
# Script pour changer la branche sur tous les repos git situés dans /home/orbisu/work.
# Pour chaque repo :
#   - Vérifie s'il y a des changements en cours
#   - Demande à l'utilisateur de les traiter (ou de passer ce repo)
#   - Propose les branches disponibles se terminant par /develop
#   - Effectue le checkout vers la branche choisie
#
# Usage : ./switch-branch-all-repos.sh
# =============================================================================

set -euo pipefail

WORK_DIR="/home/orbisu/work"

# Couleurs
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

print_header() {
    echo ""
    echo -e "${BOLD}${CYAN}============================================================${RESET}"
    echo -e "${BOLD}${CYAN}  REPO : $1${RESET}"
    echo -e "${BOLD}${CYAN}============================================================${RESET}"
}

print_ok()      { echo -e "${GREEN}✔ $1${RESET}"; }
print_warn()    { echo -e "${YELLOW}⚠ $1${RESET}"; }
print_info()    { echo -e "${CYAN}ℹ $1${RESET}"; }
print_error()   { echo -e "${RED}✘ $1${RESET}"; }

# Collecte tous les répertoires git dans WORK_DIR
repos=()
for dir in "$WORK_DIR"/*/; do
    if [ -d "$dir/.git" ]; then
        repos+=("$dir")
    fi
done

if [ ${#repos[@]} -eq 0 ]; then
    print_error "Aucun repo git trouvé dans $WORK_DIR"
    exit 1
fi

print_info "Repos trouvés : ${#repos[@]}"

for repo in "${repos[@]}"; do
    repo_name=$(basename "$repo")
    print_header "$repo_name"

    cd "$repo"
    current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "INCONNU")
    print_info "Branche actuelle : ${BOLD}$current_branch${RESET}"

    # ----------------------------------------------------------------
    # 1. Vérification des changements en cours
    # ----------------------------------------------------------------
    pending_changes=$(git status --porcelain 2>/dev/null)

    if [ -n "$pending_changes" ]; then
        print_warn "Des changements en cours ont été détectés :"
        echo ""
        git status --short
        echo ""

        while true; do
            echo -e "${YELLOW}Que souhaitez-vous faire ?${RESET}"
            echo "  1) J'ai traité les changements, continuer"
            echo "  2) Passer ce repo (ne pas changer la branche)"
            echo -n "Votre choix [1/2] : "
            read -r choice_pending

            case "$choice_pending" in
                1)
                    # Revalider que les changements ont bien été traités
                    remaining=$(git status --porcelain 2>/dev/null)
                    if [ -n "$remaining" ]; then
                        print_warn "Il reste encore des changements non traités :"
                        git status --short
                        echo ""
                        print_info "Veuillez traiter les changements (commit, stash, reset...) puis répondre à nouveau."
                        echo ""
                    else
                        print_ok "Aucun changement restant. On continue."
                        break
                    fi
                    ;;
                2)
                    print_info "Repo ${BOLD}$repo_name${RESET} ignoré."
                    continue 2
                    ;;
                *)
                    print_error "Choix invalide. Entrez 1 ou 2."
                    ;;
            esac
        done
    else
        print_ok "Aucun changement en cours."
    fi

    # ----------------------------------------------------------------
    # 2. Récupération des branches distantes se terminant par /develop
    # ----------------------------------------------------------------
    git fetch --quiet 2>/dev/null || print_warn "Impossible de fetch (pas de réseau ?)"

    develop_branches=$(git branch -r 2>/dev/null \
        | sed 's|^ *origin/||' \
        | grep '/develop$' \
        | sort \
        || true)

    if [ -z "$develop_branches" ]; then
        print_warn "Aucune branche se terminant par '/develop' trouvée sur ce repo."
        echo -n "Voulez-vous quand même changer de branche manuellement ? [o/N] : "
        read -r want_manual
        if [[ ! "$want_manual" =~ ^[oOyY]$ ]]; then
            print_info "Repo ${BOLD}$repo_name${RESET} ignoré."
            continue
        fi

        # Afficher toutes les branches disponibles
        echo ""
        print_info "Branches distantes disponibles :"
        git branch -r | sed 's|^ *origin/||' | grep -v 'HEAD' | sort | nl -w3 -s') '
        echo ""
        echo -n "Entrez le nom exact de la branche (ou laissez vide pour ignorer) : "
        read -r manual_branch
        if [ -z "$manual_branch" ]; then
            print_info "Repo ${BOLD}$repo_name${RESET} ignoré."
            continue
        fi
        target_branch="$manual_branch"
    else
        # ----------------------------------------------------------------
        # 3. Demander si l'utilisateur veut changer la branche
        # ----------------------------------------------------------------
        echo ""
        print_info "Branches disponibles se terminant par '/develop' :"
        echo ""

        # Construire un tableau indexé
        branch_array=()
        while IFS= read -r b; do
            branch_array+=("$b")
        done <<< "$develop_branches"

        for i in "${!branch_array[@]}"; do
            if [ "${branch_array[$i]}" = "$current_branch" ]; then
                echo -e "  $((i+1))) ${GREEN}${branch_array[$i]}${RESET} ${BOLD}(actuelle)${RESET}"
            else
                echo "  $((i+1))) ${branch_array[$i]}"
            fi
        done
        echo ""

        echo -n "Voulez-vous changer la branche de ce repo ? [O/n] : "
        read -r want_switch
        if [[ "$want_switch" =~ ^[nN]$ ]]; then
            echo -n "Voulez-vous mettre à jour la branche actuelle (${BOLD}$current_branch${RESET}) ? [O/n] : "
            read -r want_pull_current
            if [[ ! "$want_pull_current" =~ ^[nN]$ ]]; then
                print_info "Mise à jour de la branche ${BOLD}$current_branch${RESET}..."
                if git pull 2>&1; then
                    print_ok "Branche ${BOLD}$current_branch${RESET} mise à jour."
                else
                    print_error "Échec du pull sur la branche '$current_branch'."
                fi
            fi
            continue
        fi

        # Sélection de la branche
        while true; do
            echo -n "Choisissez un numéro de branche [1-${#branch_array[@]}] : "
            read -r branch_choice

            if [[ "$branch_choice" =~ ^[0-9]+$ ]] \
                && [ "$branch_choice" -ge 1 ] \
                && [ "$branch_choice" -le "${#branch_array[@]}" ]; then
                target_branch="${branch_array[$((branch_choice-1))]}"
                break
            else
                print_error "Choix invalide. Entrez un numéro entre 1 et ${#branch_array[@]}."
            fi
        done
    fi

    # ----------------------------------------------------------------
    # 4. Checkout
    # ----------------------------------------------------------------
    if [ "$target_branch" = "$current_branch" ]; then
        print_ok "Vous êtes déjà sur la branche ${BOLD}$target_branch${RESET}. Rien à faire."
        continue
    fi

    echo ""
    print_info "Changement vers la branche : ${BOLD}$target_branch${RESET}"

    if git checkout "$target_branch" 2>&1; then
        print_ok "Branche changée avec succès : ${BOLD}$target_branch${RESET}"
    else
        # La branche locale n'existe peut-être pas encore
        if git checkout -b "$target_branch" --track "origin/$target_branch" 2>&1; then
            print_ok "Branche locale créée et trackée : ${BOLD}$target_branch${RESET}"
        else
            print_error "Échec du checkout vers '$target_branch' sur le repo '$repo_name'."
            continue
        fi
    fi

    print_info "Mise à jour de la branche ${BOLD}$target_branch${RESET}..."
    if git pull 2>&1; then
        print_ok "Branche ${BOLD}$target_branch${RESET} mise à jour."
    else
        print_error "Échec du pull sur la branche '$target_branch'."
    fi
done

echo ""
print_ok "Traitement terminé pour tous les repos."
