# GitHub Random Assignee

Extension Chrome (Manifest V3) qui ajoute un bouton **Assigner au hasard** sur les pages de Pull Request GitHub.
L'utilisateur tire au sort dans une liste configurable est :

- ajoute aux **assignees** de la PR ;
- ajoute aux **reviewers** demandes (optionnel, active par defaut).

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode developpeur** (en haut a droite).
3. Cliquer sur **Charger l'extension non empaquetee** et selectionner le dossier
   `tools/github-random-assignee`.

## Configuration

Clic droit sur l'icone de l'extension > **Options** (ou lien *Options* dans la popup).

| Option | Description |
| --- | --- |
| Token GitHub (PAT) | Requis pour appeler l'API. Stocke dans `chrome.storage.local`. |
| Utilisateurs candidats | Logins separes par virgules / espaces / retours a la ligne. |
| Exclure l'auteur | Retire l'auteur de la PR du tirage. |
| Demander aussi une revue | Ajoute l'utilisateur aux reviewers demandes. |
| Remplacer les assignes existants | Supprime les assignes actuels avant d'ajouter le nouveau. |

### Token requis

- Token classique : scope `repo`.
- Token fine-grained : `Pull requests: Read and write` + `Issues: Read and write` sur les depots concernes.

Le token n'est jamais envoye ailleurs que vers `https://api.github.com`.

## Utilisation

Sur une page `https://github.com/<owner>/<repo>/pull/<n>` :

- bouton `🎲 Assigner au hasard` injecte dans la barre laterale (section *Assignees*), avec repli en bouton
  flottant en bas a droite ;
- ou via la popup de l'extension dans la barre d'outils.

Au clic, les logins candidats defilent dans le bouton pendant ~1s (le de tourne), puis le gagnant s'affiche
en vert et un toast apparait en bas a droite avec son **avatar** et son login. La page est rechargee ensuite.
En cas d'erreur, le toast est rouge et detaille la cause. Les animations sont desactivees si le systeme est
en `prefers-reduced-motion`.

## Icones

Les PNG de `icons/` sont generes par un script sans dependance :

```bash
python3 icons/generate-icons.py
```

## Limites

- Les assignes actuels de la PR sont exclus du tirage (pas de doublon).
- GitHub.com uniquement (pas de GitHub Enterprise Server ; adapter `API_ROOT` dans `background.js` si besoin).
- Un utilisateur ne peut pas etre reviewer de sa propre PR : dans ce cas seul l'assignement est effectue.
- L'utilisateur tire doit avoir acces au depot, sinon GitHub ignore l'assignement.
