## Catalogue des scripts

| Script                     | Commande                                               | Quand | Avantage                                                                   | Description                                                                                                                                                |
|----------------------------|--------------------------------------------------------|---|----------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **create-war-and-deploy**  | `create-war-and-deploy <TICKET> [options] [mvn args]`  | n'importe quelle branche | Build + deploy ORME packagés avec mapping de version configurable          | Résout le bon snapshot Nexus via une ligne de version (`--version-line`), construit `orbis-medication.war`, puis lance le script de déploiement configuré |
| **merge-commit-to-branch** | `merge-commit-to-branch <TICKET> [--repo]`             | n'importe quelle branche | Merge un defect dans une autre version dans un worktree distinct           | Merge les commits d'un defect/story dans une autre version. Repo utilisé: `orme-prescription` par défaut, `--repo` propose une liste des repos disponibles |
| **switch-branch-all-repos** | `switch-branch-all-repos`                             | n'importe quelle branche | Modifie la branche courante de tous les repos locaux en une seule commande | Modifie et met à jour la branche courante de tous les repos locaux                                                                                         |

## Exemples d'utilisation

### `create-war-and-deploy`
> Le script lit une seule config : `scripts/create-war-and-deploy.env`. Cette config porte les chemins et commandes de build/deploy (`PACKAGING_REPO`, `PACKAGING_WORKTREE_BASE`, `BUILD_COMMAND`, `DEPLOY_WORKDIR`, `DEPLOY_COMMANDS`). Les options CLI priment sur cette config. Les arguments Maven passés en fin de commande **s'ajoutent** à `DEFAULT_MAVEN_ARGS` ; utilise `--replace-maven-args` si tu veux repartir d'une base vide.

Le flux par défaut :

1. Accepte un ticket `ORBISBUG-<numéro>` ou `HORME-<numéro>`, ainsi que les variantes avec espace ou suffixe comme `ORBISBUG 12345_2`.
2. Demande la ligne de version dans le shell si `--version-line` ou `--version-prefix` n'est pas fourni.
3. Résout la version snapshot correspondant au ticket et à la ligne de version choisie.
4. Prépare une worktree temporaire de `orme-medication-packaging` sur la branche configurée pour cette version.
5. Lance Maven avec `-U` pour vérifier sur Nexus la dernière version des snapshots.
6. Construit `orbis-medication.war`.
7. Lance la cible de déploiement `quick`, soit `bash ./wsl/quick.sh deploy {war}`.

Le placeholder `{war}` est remplacé par le chemin du WAR qui vient d'être construit.

> L'étape de déploiement reste affichée au premier plan pour permettre à `quick.sh` d'ouvrir `fzf` ou de demander un mot de passe `sudo`. Le spinner est uniquement utilisé pendant le build Maven.

> Après le build, le script affiche aussi un bloc d'observabilité avec les artefacts prescription réellement embarqués côté back/front et les fichiers Maven locaux associés.

#### Référence de configuration

| Variable | Rôle |
|---|---|
| `REPOS_DIR` | Racine commune des repos locaux |
| `PACKAGING_REPO` | Repo source `orme-medication-packaging` utilisé pour créer les worktrees de build |
| `PACKAGING_WORKTREE_BASE` | Répertoire parent des worktrees temporaires de build |
| `PACKAGING_WORKTREE_FETCH` | `1` pour fetch `origin` avant de préparer la worktree, `0` sinon |
| `WAR_RELATIVE_PATH` | Chemin du WAR produit à partir du répertoire de build |
| `MAVEN_LOCAL_REPOSITORY` | Repo Maven local utilisé pour afficher les artefacts résolus |
| `BUILD_COMMAND` | Commande de build de base |
| `DEFAULT_MAVEN_ARGS` | Args Maven ajoutés au build sauf avec `--replace-maven-args` |
| `DEPLOY_WORKDIR` | Répertoire depuis lequel la commande de déploiement est lancée |
| `DEFAULT_DEPLOY_TARGET` | Clé de déploiement sélectionnée par défaut |
| `DEPLOY_COMMANDS` | Tableau associatif `clé -> commande` |
| `DEPLOY_ARGUMENTS` | Tableau associatif `clé -> arguments`, avec placeholders `{war}`, `{ticket}`, `{version}` |
| `VERSION_PREFIXES` | Tableau associatif Bash `ligne -> préfixe` pour calculer la version snapshot |
| `PACKAGING_BRANCHES` | Tableau associatif Bash `ligne -> branche packaging` pour sélectionner la worktree de build |

Les versions supportées se déclarent directement dans le fichier `.env` :

```bash
declare -A VERSION_PREFIXES=(
  ["3.22"]="3.3220000.9999"
  ["4.0"]="3.4000000.9999"
  ["4.01"]="3.4000100.9999"
)

declare -A PACKAGING_BRANCHES=(
  ["4.0"]="40000XX/develop"
  ["4.01"]="400XXXX/develop"
)
```

Les outils de déploiement se déclarent de la même manière :

```bash
DEFAULT_DEPLOY_TARGET="quick"

declare -A DEPLOY_COMMANDS=(
  ["quick"]="bash ./wsl/quick.sh"
)

declare -A DEPLOY_ARGUMENTS=(
  ["quick"]="deploy {war}"
)
```

Pour ajouter un autre outil de déploiement, ajoute la même clé dans `DEPLOY_COMMANDS` et `DEPLOY_ARGUMENTS`, puis sélectionne-la avec `--deploy <clé>`.

#### Options CLI

| Option | Comportement |
|---|---|
| `--verbose` | Affiche toute la sortie du build Maven au lieu du spinner |
| `--version-line <ligne>` | Sélectionne une entrée de `VERSION_PREFIXES` |
| `--version-prefix <préfixe>` | Utilise directement un préfixe sans passer par `VERSION_PREFIXES` |
| `--packaging-branch <branche>` | Utilise ponctuellement une branche packaging différente de `PACKAGING_BRANCHES` |
| `--build-only` | Construit la WAR sans lancer de déploiement |
| `--replace-maven-args` | Remplace `DEFAULT_MAVEN_ARGS` par les arguments Maven fournis |
| `--deploy <clé>` | Sélectionne une entrée du catalogue de déploiement |
| `--deploy-script <chemin>` | Utilise ponctuellement un script absent du catalogue |
| `--deploy-arg <argument>` | Ajoute un argument de déploiement ; option répétable |
| `-h`, `--help` | Affiche l'aide intégrée |

#### Règles de comportement

1. Les overrides CLI priment toujours sur `create-war-and-deploy.env`.
2. Les args Maven passés en fin de commande s'ajoutent à `DEFAULT_MAVEN_ARGS`.
3. `--replace-maven-args` remplace complètement `DEFAULT_MAVEN_ARGS`.
4. `--deploy <clé>` sélectionne une entrée de `DEPLOY_COMMANDS` et `DEPLOY_ARGUMENTS`.
5. `--deploy-arg` ajoute un argument à ceux de l'entrée sélectionnée.
6. `--deploy-script` ignore le catalogue et utilise uniquement les `--deploy-arg` explicitement fournis.
7. Le script calcule toujours lui-même `-Dversion.orme-prescription=<prefix-ticket-SNAPSHOT>`.
8. Si une branche packaging est configurée, le build se fait dans une worktree temporaire créée depuis `origin/<branche>`, puis supprimée à la fin.
9. `Ctrl+C` arrête la commande en cours, affiche le résumé et retourne le code `130`.

```
./scripts/create-war-and-deploy.sh ORBISBUG-40966
```
> Utilise la config du fichier `scripts/create-war-and-deploy.env` : demande la ligne de version dans le shell, prépare une worktree packaging temporaire, build Maven ciblé sur `deployment/orbis-medication-war`, puis déploiement avec `quick.sh deploy`. En mode normal, le build affiche une animation de chargement concise et le déploiement reste interactif.
```
./scripts/create-war-and-deploy.sh ORBISBUG-40966 --verbose
```
> Désactive l'animation du build et affiche sa sortie complète. La sortie du déploiement est toujours visible.
```
./scripts/create-war-and-deploy.sh ORBISBUG-40966 --version-line 4.0
```
> Charge la config depuis `scripts/create-war-and-deploy.env`, résout le prefix `4.0 -> 3.4000000.9999`, puis construit `orbis-medication.war` avec les args Maven par défaut.
```
./scripts/create-war-and-deploy.sh HORME-7167 --version-line 3.22 --build-only
```
> Construit uniquement la WAR avec la ligne de version `3.22`, sans lancer le déploiement.
```
./scripts/create-war-and-deploy.sh ORBISBUG-40966 --replace-maven-args -U -Ppresc-dev
```
> Ignore `DEFAULT_MAVEN_ARGS` et n'utilise que les args Maven passés sur la ligne de commande.
---

### `merge-commit-to-branch`
```
./scripts/merge-commit-to-branch.sh ORBISBUG-123
```
> Trouve la/les branche liée au bug dans le repo `orme-prescription`, demande de choisir la version de destination, crée la nouvelle branche, merge le/les commit, propose d'ouvrir l'interface de résolution Intellij en cas de conflit et push
```
./scripts/merge-commit-to-branch.sh ORBISBUG-123 --repo
```
> N'utilise pas le repo `orme-prescription` mais propose de choisir dans la liste des repos disponibles dans le dossier /home/orbisu/work
---

### `switch-branch-all-repos`
```
./scripts/switch-branch-all-repos.sh
```
> Pour chaque repo local, propose de changer la branche courante en listant les branches dev existantes et de mettre à jour la branche
---
