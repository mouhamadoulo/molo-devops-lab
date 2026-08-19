# Décision de stockage objet local

## Statut

Acceptée par le propriétaire du dépôt le 19 août 2026.

## Contexte

La galerie produit exige un stockage privé compatible S3 pour un laboratoire local ARM64. Le
dépôt communautaire `minio/minio` est archivé et ses anciennes images précompilées ne constituent
plus une base maintenue. Le contrat applicatif doit néanmoins rester portable vers une autre
implémentation S3.

## Décision

Le développement local utilise MinIO AIStor Free en mode standalone single-node :

- image `quay.io/minio/aistor/minio:RELEASE.2026-04-14T21-32-45Z`, épinglée par digest ;
- runtime UID/GID `1000:1000`, sans capability Linux et avec `no-new-privileges` ;
- licence montée en lecture seule depuis `MINIO_LICENSE_FILE` ;
- bucket privé `devops-store-products` créé de manière idempotente par l'application ;
- accès aux objets uniquement par URL GET présignée de courte durée.

Cette version est au moins celle recommandée par l'avis de sécurité
[GHSA-xh8f-g2qw-gcm7](https://github.com/minio/minio/security/advisories/GHSA-xh8f-g2qw-gcm7).

## Contraintes de licence

L'[accord AIStor Free](https://www.min.io/legal/aistor-free-agreement) autorise gratuitement les
usages standalone, y compris commerciaux, mais interdit le mode distribué, la redistribution et
la modification du logiciel. Le produit est fourni sans garantie, SLA ou SLO. Une licence active
est nécessaire ; son expiration peut rendre le service successivement read-only puis offline.

Le fichier `minio.license` et tout autre chemin local de licence restent hors Git. L'application ne
lit jamais ce fichier : seul le processus AIStor le reçoit.

## Conséquences

- Cette solution convient au laboratoire local, mais pas à une cible nécessitant haute
  disponibilité ou support contractuel.
- Le port applicatif `ObjectStorage` isole le SDK MinIO afin de préserver la portabilité S3.
- PostgreSQL reste la source d'accès : les suppressions d'objets sont demandées dans la transaction
  puis exécutées uniquement après commit, avec trois tentatives bornées et des métriques.
- L'application crée le bucket de manière idempotente au démarrage. Un échec de persistance ou un
  rollback tardif au commit déclenche la compensation de l'objet déjà envoyé.
- Une réconciliation planifiée limite son inventaire au préfixe `products/` et ne supprime qu'une
  clé absente de PostgreSQL depuis plus de `MINIO_ORPHAN_MIN_AGE` ; la valeur locale par défaut est
  de 24 heures.
- La liste produits joint les images principales en une requête batch et ne présigne que celles-ci ;
  la galerie complète conserve sa route dédiée.
- La phase Docker ultérieure étendra le même fichier Compose au backend et au frontend.
- Une autre implémentation S3 maintenue nécessiterait une nouvelle décision d'architecture et la
  relance des tests contractuels du port de stockage.

## Références

- [Licences AIStor](https://docs.min.io/aistor/operations/licenses/)
- [Déploiement conteneur AIStor](https://docs.min.io/aistor/installation/container/install/)
- [Dépôt communautaire MinIO archivé](https://github.com/minio/minio)
