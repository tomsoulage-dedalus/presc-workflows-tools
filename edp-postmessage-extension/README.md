# EDP PostMessage Debugger

Extension Chrome (Manifest V3) pour envoyer facilement les `postMessage` de debug de
l'Externally Driven Prescription (EDP), sans repasser par la console à chaque fois.

Basé sur la doc EDP :
- `orme.drug.add`
- `orme.drug.delete`
- `orme.prescription_line.stop`
- `orme.sign` / `orme.sign_on_behalf`
- `orme.save`
- `orme.cancel`

## Installation (mode développeur, aucun build nécessaire)

1. Ouvre `chrome://extensions`
2. Active le **mode développeur** (toggle en haut à droite)
3. Clique sur **Charger l'extension non empaquetée**
4. Sélectionne le dossier `edp-postmessage-extension/`
5. Épingle l'extension dans la barre d'outils Chrome

## Utilisation

1. Ouvre ta page EDP (ex: `.../#/externally-driven-prescription?caseId=...`)
2. Clique sur l'icône de l'extension → renseigne les champs → clique sur le bouton d'action
3. Le message envoyé (JSON complet) s'affiche en bas du popup pour vérification

## Notes

- Le "Add drug" avec le champ Product ID vide envoie un `content` vide (`""`) → ouvre la recherche produit, comme `window.postMessage('{"type":"orme.drug.add", "content":"" }', '*')` dans la doc.
- La suppression (`orme.drug.delete`) ne fonctionne que sur les lignes **non signées** ; si plusieurs lignes existent avec le même produit, la suppression n'est pas effectuée (comportement de l'app, pas de l'extension).
- Le message est injecté via `chrome.scripting.executeScript` (`world: "MAIN"`) sur l'onglet actif, ce qui équivaut exactement à taper `window.postMessage(...)` dans la console de cet onglet.
- Cette extension ne modifie rien côté serveur/app : elle se contente d'émettre le même `postMessage` que tu ferais manuellement.
