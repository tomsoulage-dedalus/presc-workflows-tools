---
name: "lint-check"
description: "Lance ESLint sur les fichiers modifiés uniquement. Si tout est propre, effectue le git push."
---

# Lint Check Skill

## Required configuration

Aucune variable d'environnement requise.

Prérequis : ESLint configuré dans le projet (`.eslintrc.json` ou `eslint.config.js`).

## Available commands

### `/lint-check`

Vérifie la qualité du code avec ESLint sur les fichiers modifiés, puis push si tout est propre.

---

## Detailed behaviour

### Step 1 — Lister les fichiers modifiés à analyser

```bash
git diff main...HEAD --name-only | grep -E '\.(ts|html)$'
```

Si aucun fichier `.ts` ou `.html` modifié, afficher :
```
ℹ️  Aucun fichier TypeScript ou HTML modifié détecté.
```
Et stopper.

### Step 2 — Lancer ESLint sur ces fichiers uniquement

```bash
npx eslint <fichier1> <fichier2> ... --max-warnings=0
```

L'option `--max-warnings=0` traite les warnings comme des erreurs — zéro tolérance.

### Step 3 — Analyser les résultats

#### Si des erreurs sont détectées

Afficher le rapport par fichier :

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
❌ ESLint — Erreurs trouvées
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📄 <fichier1.ts>
  Ligne <N> : [<règle>] <message>
  Ligne <N> : [<règle>] <message>

📄 <fichier2.html>
  Ligne <N> : [<règle>] <message>

Total : <N> erreur(s), <N> warning(s)
```

Puis afficher :
```
⛔ Lint échoué. Corriger les erreurs avant de push.
   Ne pas passer à /create-pr sans avoir relancé /lint-check avec succès.
```

**Bloquer le push.**

#### Si tout est propre

Afficher :
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ ESLint — Aucune erreur
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Fichiers vérifiés : <N>
```

### Step 4 — Git push (si lint OK)

```bash
git push origin HEAD
```

Afficher :
```
🚀 Push effectué sur origin/<branche>
   ➡️  Prochaine étape : /create-pr
```

---

## Error handling

| Situation | Comportement |
|-----------|-------------|
| ESLint non installé | Afficher `❌ ESLint introuvable. Vérifier node_modules.` et stopper |
| Lint échoue | Bloquer le push, lister les erreurs par fichier et ligne |
| `git push` échoue | Afficher l'erreur git et stopper |
| Aucun fichier `.ts`/`.html` modifié | Informer et stopper sans erreur |
