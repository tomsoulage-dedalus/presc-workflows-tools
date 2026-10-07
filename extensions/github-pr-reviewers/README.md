# GitHub PR Reviewers

Extension Chrome (Manifest V3) qui ajoute un reviewer / assignee sur une Pull Request GitHub,
soit en **cliquant sur un membre de l'equipe**, soit par **tirage au hasard**.

Les deux modes partagent la **meme liste de membres** et la **meme liste d'indisponibles** ;
on choisit dans les options lequel (ou les deux) afficher.

> Cette extension remplace `github-team-reviewers` et `github-random-reviewer`, qui ont ete fusionnees.

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode developpeur** (en haut a droite).
3. Cliquer sur **Charger l'extension non empaquetee** et selectionner le dossier
   `extensions/github-pr-reviewers`.

## Configuration

Clic droit sur l'icone de l'extension > **Options** (ou lien *Options* dans la popup).

| Option | Description |
| --- | --- |
| Token GitHub (PAT) | Requis pour appeler l'API. Stocke dans `chrome.storage.local`. |
| Membres de l'equipe | Un par ligne : `login` ou `login=Nom affiche`. L'ordre des lignes = l'ordre des boutons. Sert aussi de vivier pour le tirage. |
| En conges / indisponibles | Logins grises dans la liste et **exclus du tirage**. |
| Afficher la liste des membres | Affiche les boutons par membre. Active par defaut. |
| Afficher le tirage au hasard | Affiche le bouton `🎲 Au hasard`. Active par defaut. |
| Demander une revue | Ajoute la personne aux reviewers demandes. Active par defaut. |
| Assigner la PR | Ajoute la personne aux assignees. Active par defaut. |
| Exclure l'auteur de la PR | Retire l'auteur de la liste et du tirage. Active par defaut. |
| Tirage : remplacer les assignes existants | Supprime les assignes actuels avant d'assigner la personne tiree. |

Au moins un affichage (liste / hasard) et au moins une action (revue / assignation) doivent rester coches.

Le tirage se fait parmi `membres - indisponibles - auteur - personnes deja sur la PR (reviewer, assignee ou ayant relu)`.

### Token requis

- Token classique : scope `repo`.
- Token fine-grained : `Pull requests: Read and write` + `Issues: Read and write` sur les depots concernes.

Le token n'est jamais envoye ailleurs que vers `https://api.github.com`.

## Utilisation

Sur une page `https://github.com/<owner>/<repo>/pull/<n>` :

- un panneau **Equipe** est injecte dans la barre laterale (section *Reviewers*), avec repli en panneau
  flottant en bas a droite si la sidebar n'est pas trouvee ;
- le bouton `🎲 Au hasard` fait defiler les logins candidats pendant ~1s (le de tourne), puis affiche
  le gagnant en vert ;
- chaque membre est un bouton avec son **avatar** et son **nom**, et porte un badge d'etat :
  `reviewer`, `assigne`, `reviewer + assigne`, `a relu`, `auteur`, `indisponible` ;
- les membres deja sur la PR et l'auteur sont **desactives** ;
- apres chaque action, le panneau se met a jour en place (pas de rechargement de page) et un toast
  confirme le resultat avec l'avatar de la personne ;
- le bouton `↻` force un rafraichissement de l'etat de la PR.

Les memes controles sont disponibles dans la popup de l'extension (icone de la barre d'outils).

Les animations sont desactivees si le systeme est en `prefers-reduced-motion`.

## Icones

Les PNG de `icons/` sont generes par un script sans dependance :

```bash
python3 icons/generate-icons.py
```

## Limites

- GitHub.com uniquement (pas de GitHub Enterprise Server ; adapter `API_ROOT` dans `background.js` si besoin).
- Un utilisateur ne peut pas etre reviewer de sa propre PR.
- La personne choisie doit avoir acces au depot, sinon GitHub ignore l'assignement.
- Les demandes de revue par **equipe GitHub** (`team_reviewers`) ne sont pas gerees, uniquement les
  utilisateurs individuels.
