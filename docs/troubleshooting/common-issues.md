# Pannes courantes

Seules des pannes réellement rencontrées pendant la construction du laboratoire figurent ici, avec
le message observé, la cause identifiée et la commande qui remet en marche. Les pannes propres à un
outil restent documentées dans son guide ; cette page renvoie vers lui plutôt que de le recopier.

## Docker Desktop et WSL2

### Le moteur Docker ne répond plus (HTTP 500)

**Symptôme.** Toute commande `docker` échoue :

```text
request returned 500 Internal Server Error for API route and version
http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.55/version
```

`wsl --list --verbose` finit par ne plus répondre, et le journal
`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log` répète
`still waiting for the engine to respond to _ping` puis
`waiting for wsl-keepalive to be ready: wsl-keepalive failed to start`.

**Cause.** Le sous-système WSL2 est figé. Ni `wsl --shutdown`, ni `wsl --shutdown --force`, ni un
redémarrage de Docker Desktop ne le débloquent : ces commandes se bloquent à leur tour.

**Résolution.** Dans une console PowerShell **administrateur** :

```powershell
Restart-Service -Name WslService -Force
```

puis relancer Docker Desktop et attendre que le moteur réponde.

**Preuve.** `docker version` renvoie la version du serveur, et `docker info` répond immédiatement.

### Docker Desktop n'est pas lancé

**Symptôme.**

```text
open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**Cause.** Le named pipe n'existe pas : l'application n'est pas démarrée, à distinguer du cas
précédent où le pipe existe mais renvoie 500.

**Résolution.** Démarrer Docker Desktop, puis attendre que `docker version` réponde.

**Preuve.** `docker version` affiche la version du serveur.

### `kubectl` échoue en `TLS handshake timeout`

**Symptôme.** `kubectl` expire alors que le contexte `docker-desktop` est bien sélectionné.

**Cause.** Même gel WSL2 que ci-dessus ; le nœud Kubernetes vit dans la même VM.

**Résolution.** Identique : redémarrer `WslService` depuis une console administrateur, puis Docker
Desktop, et attendre que le nœud repasse `Ready`.

**Preuve.** `kubectl get nodes` liste `desktop-control-plane` en `Ready`.

## Git Bash et Windows

### Les chemins passés à Docker sont réécrits

**Symptôme.** Un montage `-v` ou un argument commençant par `/` arrive dans le conteneur sous la
forme `C:/Program Files/Git/...`, et la commande échoue sur un chemin inexistant.

**Cause.** Git Bash convertit automatiquement les chemins de style POSIX en chemins Windows.

**Résolution.** Préfixer la commande rejouée à la main :

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/input:ro" -w /input <image> <args>
```

**Preuve.** Le conteneur voit bien `/input` et la commande se termine normalement.

### GNU Make est absent du `PATH`

**Symptôme.** `make` est introuvable, alors que la documentation décrit des cibles Make.

**Cause.** GNU Make n'est pas installé sur le poste Windows.

**Résolution.** Exécuter la recette équivalente directement (chaque cible du `Makefile` est une
commande `docker` ou `docker compose` lisible), ou valider la syntaxe dans un conteneur éphémère
disposant de `make`.

**Preuve.** La commande sous-jacente produit le même résultat que la cible annoncée. Ne jamais
déclarer une cible Make validée sans exécution réelle.

## Docker Compose

### Le nom de projet dérive depuis un worktree

**Symptôme.** Compose crée un projet `devops-store_application` au lieu de
`devops-store-application`, et les volumes ou réseaux existants ne sont pas retrouvés.

**Cause.** Le nom de projet par défaut vient du nom du répertoire courant, qui diffère dans
`.worktrees/<nom>`.

**Résolution.** Forcer le répertoire historique :

```powershell
docker compose --project-directory <chemin-du-checkout-principal> ps
```

**Preuve.** `docker compose ps` retrouve les conteneurs et volumes attendus.

### Healthcheck en échec avec `grep --quiet`

**Symptôme.** Un conteneur reste `unhealthy` alors que le service répond ; le healthcheck signale
une option `grep` inconnue.

**Cause.** BusyBox, utilisé par les images Alpine, n'accepte pas la forme longue `--quiet`.

**Résolution.** Utiliser `grep -q` dans les healthchecks.

**Preuve.** `docker compose ps` affiche le service en `healthy`.

## Application

### Login ou refresh refusé en HTTP 403

**Symptôme.** `POST /api/v1/auth/login`, `/refresh` ou `/logout` répond 403 alors que les
identifiants sont bons.

**Cause.** L'en-tête `Origin` de la requête ne correspond pas exactement à `CORS_ALLOWED_ORIGIN`.
Pour `refresh` et `logout`, la cause peut aussi être l'absence de concordance entre le cookie
`XSRF-TOKEN` et l'en-tête `X-XSRF-TOKEN`.

**Résolution.** Envoyer l'origine attendue, et renvoyer le jeton XSRF sur les deux appels
protégés :

```powershell
curl.exe -i -X POST http://localhost:8080/api/v1/auth/login `
  -H 'Origin: http://localhost:4200' -H 'Content-Type: application/json' `
  --data '{"email":"<email>","password":"<mot-de-passe>"}'
```

**Preuve.** La réponse est 200 et porte les cookies `DEVOPS_REFRESH` et `XSRF-TOKEN`.

### Suppression d'un produit avec images en HTTP 500

**Symptôme.** `DELETE /api/v1/products/{id}` répond 500 lorsque le produit porte au moins une
image ; le journal montre `TransientPropertyValueException`.

**Cause.** Le service chargeait les images pour publier l'événement de suppression, puis
supprimait le produit : au flush, Hibernate voyait une image gérée pointant vers un produit
supprimé. Le `ON DELETE CASCADE` de PostgreSQL ne couvre pas ce cas, qui se joue dans la session.

**Résolution.** Corrigé par la PR #46 : les images sont explicitement supprimées avant leur
produit, avec un test d'intégration dédié. Aucun contournement n'est nécessaire sur `main`.

**Preuve.** `DELETE` répond 204, un `GET` du produit répond 404 et l'objet a disparu du bucket.

## Sécurité des dépendances

### La CI Trivy passe au rouge sans changement de code

**Symptôme.** Une Pull Request qui ne touche pas les dépendances échoue sur le gate Trivy.

**Cause.** Une CVE vient d'être publiée sur une dépendance transitive : c'est arrivé avec
`bcprov-jdk18on` 1.84, tiré par le client MinIO (CVE-2026-8763, CVE-2026-13506).

**Résolution.** Forcer la version corrigée dans le `dependencyManagement` de `backend/pom.xml`,
avec un commentaire qui nomme la CVE, puis retirer la surcharge dès que la dépendance amont la
fournit. Voir [Règles de sécurité](../security/security-guidelines.md#dépendances).

**Preuve.** `./mvnw dependency:tree` montre la version corrigée, et `make trivy-fs` repasse à zéro
finding bloquant.

### Trivy échoue sur un HTTP 429 de Maven Central

**Symptôme.** Le scan s'arrête sur une limite de débit, sans finding réel.

**Cause.** Trivy résout les dépendances en ligne alors que le cache local n'est pas monté.

**Résolution.** Laisser `make trivy-fs` remplir le cache Maven et rejouer le scan en réutilisant
ce cache, sans retirer le montage en lecture seule. Voir [Trivy](../devops/trivy.md#dépannage).

**Preuve.** Le scan se termine et le rapport est produit.

## Kubernetes

Détail et commandes dans [Kubernetes local](../infrastructure/kubernetes.md#pannes-rencontrées) :

- `ErrImagePull` sur `devops-store-*:local` : image absente du magasin containerd du nœud,
  corrigée par `make k8s-images`.
- AIStor en `CrashLoopBackOff` avec `read-only file system` sur `/run/secrets` : la licence est
  montée sur `/etc/minio-license` et le token ServiceAccount est désactivé.
- StatefulSet non mis à jour après correction : `OrderedReady` attend le pod précédent, supprimer
  le pod bloqué.
- `namespaces "devops-store" not found` en dry-run serveur : créer le namespace d'abord avec
  `make k8s-config`.
- `port-forward` perdu après suppression d'un pod : relancer `make k8s-forward`.
