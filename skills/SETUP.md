# Setup — Utiliser les skills depuis orme-prescription

Ces skills sont développés dans `presc-workflows-tools`. Le script de setup crée
un lien local dans `orme-prescription` et un lien par skill dans
`~/.copilot/skills/`, sans ajouter de fichier suivi dans le repo partagé.

## Prérequis

- Avoir les deux repos clonés **dans le même dossier parent** :
  ```
  work/
  ├── orme-prescription/
  └── presc-workflows-tools/
  ```

## Installation (à faire une seule fois par machine)

Depuis la racine de `presc-workflows-tools` :

```bash
bash skills/setup.sh
```

Le script :

- crée `orme-prescription/skills` vers le dossier `skills/` de ce dépôt ;
- ajoute `skills` à `orme-prescription/.git/info/exclude` ;
- lie chaque dossier de skill dans `~/.copilot/skills/`, pour les rendre aussi
  disponibles depuis les autres projets.

**Attention :** si un dossier de même nom existe déjà dans `~/.copilot/skills/`
et n'est pas un lien symbolique, le script le supprime et le remplace par un
lien. Sauvegarde tes éventuelles copies personnalisées avant de lancer le setup.

Conserve les deux dépôts à leur emplacement après l'installation. Les modifications
des skills sont prises en compte via les liens, sans relancer le script ; relance-le
si un nouveau dossier de skill est ajouté.

## Vérification

```bash
ls ../orme-prescription/skills/
ls -l ~/.copilot/skills/
# → code-lint, code-review, gsupport-analyze, pr-create, pr-fix-build,
#   story-architecture-diagram, task-analyze, task-implement,
#   task-start, test-check, test-implement
```

Ces commandes sont à exécuter depuis la racine de `presc-workflows-tools`.

## Alternative : copie locale dans un autre projet

Le script `install-skills.sh` copie le contenu de `skills/` dans
`.copilot/skills/` du **répertoire courant** :

```bash
cd /chemin/vers/le/projet
bash /chemin/vers/presc-workflows-tools/install-skills.sh
```

Contrairement aux liens, ces copies ne suivent pas les mises à jour du dépôt.
Cette méthode ne configure pas d'exclusion Git : vérifie le statut du projet
avant de committer.

## Désinstallation

Depuis la racine de `presc-workflows-tools`, supprimer le lien local :

```bash
unlink ../orme-prescription/skills
```

Supprimer aussi, avec `unlink`, chaque lien de `~/.copilot/skills/` qui pointe
vers ce dépôt, par exemple `unlink ~/.copilot/skills/task-start`.
Ne pas supprimer les skills provenant d'autres sources.
La ligne `skills` ajoutée à `../orme-prescription/.git/info/exclude` peut
ensuite être retirée si elle n'est plus utile.
