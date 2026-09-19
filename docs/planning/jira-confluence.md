# Jira et Confluence

Le laboratoire n'est rattaché à aucun compte Atlassian : rien n'est synchronisé automatiquement.
Ce guide décrit les deux étapes manuelles à faire depuis un compte existant — importer le backlog
dans Jira, publier la documentation dans Confluence. **Ces étapes n'ont pas été exécutées ici.**

## Jira

### Prérequis

- un projet logiciel Jira Cloud, clé `DEVOPS` conseillée pour rester cohérent avec les
  identifiants `DEVOPS-n` du backlog ;
- les droits d'administration Jira nécessaires à l'import CSV externe ;
- le fichier [`jira-backlog.csv`](jira-backlog.csv), en UTF-8 sans BOM, séparateur virgule.

### Import

1. **Paramètres système → Importation externe → CSV**.
2. Charger `docs/planning/jira-backlog.csv`, encodage **UTF-8**, délimiteur **virgule**.
3. Sélectionner le projet cible.
4. Établir la correspondance des colonnes :

| Colonne du CSV | Champ Jira |
|---|---|
| `Issue Id` | Issue Id |
| `Parent` | Parent |
| `Issue Type` | Issue Type |
| `Summary` | Summary |
| `Description` | Description |
| `Labels` | Labels |
| `Status` | Status |

5. Pour `Status`, mapper les trois valeurs présentes : `To Do`, `In Progress` et `Done` vers les
   statuts correspondants du workflow du projet.
6. Lancer l'import.

### Contrôle après import

- 34 éléments créés ;
- 8 epics : EPIC-1 à EPIC-8 ;
- chaque story, tâche et bug rattaché à son epic par la colonne `Parent` ;
- un seul élément en `To Do` : « Appliquer Terraform sur Artifactory Pro », qui dépend d'une
  licence Artifactory Pro ;
- un seul epic en `In Progress` : EPIC-6 Infrastructure, pour la même raison.

### Mise à jour ultérieure

Le CSV est la source de vérité versionnée. Après une nouvelle phase, ajouter les lignes au fichier
puis réimporter uniquement les nouveaux éléments : un réimport complet créerait des doublons, les
`Issue Id` du CSV n'étant pas les clés Jira.

## Confluence

### Arborescence proposée

Une page par fichier, dans la même structure que `docs/` :

```text
DevOps Store (accueil = docs/README.md)
├── Architecture
│   ├── Vue d'ensemble
│   └── Décision stockage objet
├── DevOps
│   ├── Chaîne d'outils
│   ├── Workflow Git et GitHub
│   ├── GitHub Actions
│   ├── SonarQube
│   ├── Trivy
│   ├── JFrog Artifactory
│   └── Tests et couverture
├── Infrastructure
│   ├── Images et stack Docker Compose
│   ├── Terraform et JFrog
│   └── Kubernetes local
├── Opérations
│   └── Services et accès
├── Observabilité
│   ├── Prometheus
│   ├── Grafana
│   ├── Loki
│   └── Alloy
├── Sécurité
│   └── Règles de sécurité
├── Dépannage
│   └── Pannes courantes
└── Planification
    ├── Backlog Jira
    └── Plan d'implémentation
```

### Procédure de copie

1. Créer la page au bon endroit de l'arborescence.
2. Coller le contenu Markdown dans l'éditeur : Confluence le convertit en contenu riche.
3. Remplacer les liens relatifs (`../devops/trivy.md`) par des liens de page Confluence.
4. Les diagrammes Mermaid ne sont pas rendus nativement : utiliser une macro ou une application
   Mermaid du Marketplace, sinon insérer une capture du diagramme et conserver le bloc source en
   dessous.
5. Les blocs de commandes restent des blocs de code, avec le langage indiqué.

### Ordre de mise à jour

Le dépôt reste la source de vérité. Quand un document change :

1. modifier le fichier dans `docs/` et faire passer `make docs-check` ;
2. fusionner la Pull Request ;
3. reporter le contenu sur la page Confluence correspondante ;
4. si la structure change, mettre à jour l'index `docs/README.md` **et** l'arborescence des pages.
