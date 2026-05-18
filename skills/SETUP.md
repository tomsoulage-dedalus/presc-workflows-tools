# Setup — Utiliser les skills depuis orme-prescription

Ces skills sont développés dans `presc-workflows-tools` mais peuvent être utilisés directement depuis `orme-prescription` via un symlink local, sans laisser de trace dans le repo partagé.

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

C'est tout. Les skills sont maintenant disponibles quand tu lances Copilot CLI depuis `orme-prescription`, et `git status` reste propre.

## Vérification

```bash
ls orme-prescription/skills/
# → task-start  task-analyze  task-implement  test-check  test-implement  code-review  code-lint  pr-create  pr-fix-comment  pr-fix-build
```

## Supprimer le lien

```bash
rm orme-prescription/skills
```
