---
name: "implement-task"
description: "Implémente le code Angular en s'appuyant sur les règles front, les leçons passées et le plan validé lors de /start-task"
---

# Implement Task Skill

## Required configuration

Aucune variable d'environnement requise.

Fichiers de référence attendus dans le repo :
- `.copilot/lessons.md` — erreurs passées à ne pas reproduire
- `.github/instructions/frontend/front-rules.instructions.md` — règles de code front à respecter

## Available commands

### `/implement-task`

Implémente les changements Angular décrits dans le plan validé lors de `/start-task`.

---

## Detailed behaviour

### Step 1 — Charger le contexte avant d'écrire la moindre ligne

#### 1a. Lire `.copilot/lessons.md`

Si le fichier n'existe pas, le créer avec ce contenu initial :
```markdown
# Lessons
```
Et continuer.

#### 1b. Lire `.github/instructions/frontend/front-rules.instructions.md`

Si le fichier est absent, afficher :
```
⚠️  .github/instructions/frontend/front-rules.instructions.md introuvable — implémentation sans règles custom.
```
Et continuer.

#### 1c. Relire le plan validé depuis l'ANALYZE.md

Déduire le ticket depuis la branche courante :

```bash
git branch --show-current
# ex: main/presc/bugfix/HDEFECT-177176 → ticket = HDEFECT-177176
```

Extraire le ticket = dernier segment du nom de branche (après le dernier `/`).

Lire le fichier :
```
<repo_root>/.copilot/analyses/<TICKET>-ANALYZE.md
```

Si le fichier est absent, afficher :
```
⚠️  Aucun ANALYZE.md trouvé pour <TICKET> — contexte limité.
    Lance /jira-analyze <TICKET> pour générer l'analyse.
```
Et continuer avec le contexte disponible en mémoire.

Rappeler les éléments clés extraits de l'ANALYZE.md :
- Ticket en cours
- Composants / services identifiés
- Hypothèses de fix / hints d'implémentation

### Step 2 — Implémenter les changements Angular

> ❌ **Ne pas générer de tests** — ni fichiers `.spec.ts`, ni modifications de tests existants.
> Les tests ont un skill dédié : `/test-check`.

Appliquer les changements décrits dans le plan :
- Créer ou modifier les composants, services, modèles, pipes, guards concernés
- Respecter la structure de fichiers Angular du projet (feature modules, standalone components, etc.)
- Respecter le style de code existant dans les fichiers voisins

### Step 3 — Auto-vérification sur chaque fichier avant de le finaliser

Avant de valider chaque fichier créé ou modifié, vérifier **obligatoirement** :

#### TypeScript
- [ ] Aucun `any` — si nécessaire, créer une interface dans `src/app/models/`
- [ ] Aucun `as` cast non justifié
- [ ] Toutes les propriétés de classe sont initialisées ou marquées `!`
- [ ] `readonly` sur les propriétés qui ne changent pas après init

#### Angular — Observables
- [ ] Toute subscription utilise `takeUntilDestroyed()` ou le `async` pipe en template
- [ ] Aucun `.subscribe()` imbriqué (utiliser `switchMap`, `combineLatest`, etc.)
- [ ] Aucun `Subject` exposé publiquement — exposer uniquement `.asObservable()`

#### Angular — Composants
- [ ] `ChangeDetectionStrategy.OnPush` présent sur les composants présentationnels
- [ ] Aucun appel HTTP direct dans un composant
- [ ] Logique métier dans les services, pas dans les composants

#### Règles `.github/instructions/frontend/front-rules.instructions.md`
- [ ] Aucune règle du fichier n'est violée

#### Leçons `.copilot/lessons.md`
- [ ] Aucune erreur listée dans le fichier n'est reproduite

#### Clean code
- [ ] Aucune méthode > 20 lignes (si dépassé, découper)
- [ ] Nommage explicite (pas de `data`, `res`, `tmp`, `obj`)
- [ ] Pas de code commenté laissé en place

### Step 4 — Résumer les changements

Afficher un résumé final :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Implémentation terminée
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📁 Fichiers créés :
  - <path> — <description courte>

✏️  Fichiers modifiés :
  - <path> — <ce qui a changé>

💡 Choix techniques notables :
  - <choix 1 et justification>
  - <choix 2 et justification>

➡️  Prochaine étape : /review-code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Error handling

| Situation | Comportement |
|-----------|-------------|
| `lessons.md` absent | Créer le fichier vide avec `# Lessons` et continuer |
| `front-rules.instructions.md` absent | Avertir et continuer sans règles custom |
| Auto-vérification échoue | Corriger le problème avant de finaliser le fichier |
