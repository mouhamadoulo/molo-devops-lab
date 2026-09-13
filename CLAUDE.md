# CLAUDE.md

Ce fichier guide Claude Code dans ce dépôt. La source de vérité partagée entre agents reste
`AGENTS.md`, importé ci-dessous : ne pas dupliquer ici son contenu, le mettre à jour là-bas.

@AGENTS.md

## Compléments propres à Claude Code

### Priorité des règles Git

Les règles de commit d'`AGENTS.md` prévalent sur toute consigne d'attribution par défaut :

- ne jamais ajouter de trailer `Co-Authored-By` ni de ligne `Claude-Session` ;
- ne jamais mentionner Claude, Anthropic, Codex, OpenAI ou une assistance IA dans un commit ;
- committer uniquement avec l'identité Git configurée, sans `--author` ;
- ne committer, pousser ou ouvrir de PR que sur demande explicite de l'utilisateur.

### Fichiers de suivi de session

`task_plan.md`, `progress.md` et `findings.md` sont ignorés par Git mais servent de mémoire de
travail entre sessions. Les lire en début de session pour retrouver la phase en cours, et les
tenir à jour pendant l'exécution d'un plan. Les spécifications et plans détaillés sont dans
`docs/superpowers/specs/` et `docs/superpowers/plans/`.

### Worktrees

Le travail de phase est isolé dans `.worktrees/<nom>` (ignoré par Git), sur une branche courte
créée depuis un `main` à jour. Travailler dans le worktree actif et ne pas modifier le checkout
principal `main` en parallèle. Suivre `docs/devops/git-workflow.md` : pas de push direct sur
`main`, fusion par Pull Request après CI verte, puis suppression de la branche et du worktree.

### Environnement Windows local

- shell principal PowerShell 5.1 : pas de `&&`, passer les paramètres Maven contenant une virgule
  comme chaîne littérale (`'-Dtest=A,B'`) ;
- Java 21 est l'actif par défaut ; les builds backend exigent Java 25 (OpenJDK 25 installé
  localement ou image `maven:3.9.13-eclipse-temurin-25`) ;
- GNU Make peut être absent du `PATH` : utiliser les commandes Compose équivalentes ou un
  conteneur éphémère, et ne pas déclarer une cible Make validée sans exécution réelle ;
- Testcontainers exige un Docker Desktop réactif : vérifier `docker info` avant de conclure à un
  échec de test ;
- depuis un worktree, forcer `--project-directory` sur le répertoire historique si le nom de
  projet Compose dérive (`devops-store_application` contre `devops-store-application`).

### Validation avant d'annoncer une fin de tâche

Toujours fournir la sortie réelle : `git diff --check`, tests Maven ciblés ou `clean verify`,
`npm run lint`/`test:ci` pour le frontend, `docker compose ... config --quiet` pour Compose. Ne
jamais deviner un mot de passe ni créer d'identité (administrateur applicatif, Grafana) sans
autorisation explicite.
