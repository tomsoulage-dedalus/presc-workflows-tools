# GitHub Team Reviewers

Extension Chrome (Manifest V3) qui affiche les membres de ton equipe sous forme de **boutons cliquables**
sur les pages de Pull Request GitHub. Un clic suffit pour ajouter la personne : plus besoin de taper son login
dans le selecteur GitHub.

Par defaut un clic ajoute la personne **comme reviewer et comme assignee** (configurable dans les options).

## Installation

1. Ouvrir `chrome://extensions`.
2. Activer le **Mode developpeur** (en haut a droite).
3. Cliquer sur **Charger l'extension non empaquetee** et selectionner le dossier
   `extensions/github-team-reviewers`.

## Configuration

Clic droit sur l'icone de l'extension > **Options** (ou lien *Options* dans la popup).

| Option | Description |
| --- | --- |
| Token GitHub (PAT) | Requis pour appeler l'API. Stocke dans `chrome.storage.local`. |
| Membres de l'equipe | Un par ligne : `login` ou `login=Nom affiche`. L'ordre des lignes = l'ordre des boutons. |
| En conges / indisponibles | Logins grises dans la liste (toujours cliquables, simple garde-fou visuel). |
| Demander une revue au clic | Ajoute la personne aux reviewers demandes. Active par defaut. |
| Assigner la PR au clic | Ajoute la personne aux assignees. Active par defaut. |
| Masquer l'auteur de la PR | Retire l'auteur de la liste des boutons. Active par defaut. |

Au moins une des deux actions (revue / assignation) doit rester cochee.

### Token requis

- Token classique : scope `repo`.
- Token fine-grained : `Pull requests: Read and write` + `Issues: Read and write` sur les depots concernes.

Le token n'est jamais envoye ailleurs que vers `https://api.github.com`.

## Utilisation

Sur une page `https://github.com/<owner>/<repo>/pull/<n>` :

- un panneau **Equipe** est injecte dans la barre laterale (section *Reviewers*), avec repli en panneau
  flottant en bas a droite si la sidebar n'est pas trouvee ;
- chaque membre est un bouton avec son **avatar** et son **nom** ;
- les boutons portent un badge d'etat : `reviewer`, `assigne`, `reviewer + assigne`, `a relu`, `auteur`,
  `indisponible` ;
- les membres deja sur la PR (reviewer, assignee, ou ayant deja relu) et l'auteur sont **desactives** :
  cliquer dessus ne fait rien ;
- au clic sur un membre disponible, l'appel API est fait puis le panneau se met a jour en place
  (pas de rechargement de page) et un toast confirme l'action ;
- le bouton `↻` force un rafraichissement de l'etat de la PR.

La meme liste est disponible dans la popup de l'extension (icone de la barre d'outils).

## Icones

Les PNG de `icons/` sont generes par un script sans dependance :

```bash
python3 icons/generate-icons.py
```

## Limites

- GitHub.com uniquement (pas de GitHub Enterprise Server ; adapter `API_ROOT` dans `background.js` si besoin).
- Un utilisateur ne peut pas etre reviewer de sa propre PR.
- Le membre clique doit avoir acces au depot, sinon GitHub ignore l'assignement.
- Les demandes de revue par **equipe GitHub** (`team_reviewers`) ne sont pas gerees, uniquement les
  utilisateurs individuels.
