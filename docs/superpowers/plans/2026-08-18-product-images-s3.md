# Product Images S3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Ajouter jusqu'à cinq images produits privées, ordonnées, avec une principale et des URLs présignées courtes.

**Architecture:** PostgreSQL porte les métadonnées et contraintes ; un port ObjectStorage isole l'API S3. L'adaptateur MinIO Java envoie les objets vers un serveur MinIO-compatible privé. Les écritures utilisent compensation et suppression après commit.

**Tech Stack:** Java 25, Spring Boot 4.1, PostgreSQL 18, Flyway, MinIO Java SDK 9.0.1, Testcontainers 2.0.5, MinIO AIStor Free single-node maintenu.

**Spec:** [Console produits sécurisée](../specs/2026-08-18-secure-product-console-design.md)

## Global Constraints

- Ce plan commence seulement après l'Acceptance Gate du plan authentication-rbac.
- Ne pas utiliser l'image communautaire minio/minio finale : le dépôt est archivé et des vulnérabilités restent non corrigées.
- Avant Task 1, le propriétaire doit accepter ou refuser explicitement la licence AIStor Free. En cas d'acceptation, le fichier minio.license reste hors Git et MINIO_LICENSE_FILE pointe vers lui.
- Revérifier les avis officiels au moment d'exécuter Task 1, puis épingler une version corrigée au minimum égale à RELEASE.2026-04-14T21-32-45Z, jamais latest.
- Si AIStor Free est refusé, arrêter ce plan et rédiger une décision d'architecture pour un autre stockage S3 maintenu ; ne pas substituer silencieusement un produit.
- JPEG, PNG et WebP seulement ; 5 MiB, 4096×4096, cinq images maximum, jamais de SVG.
- Les noms originaux ne deviennent jamais des clés objet. Utiliser products/{productId}/{uuid}.
- Aucun secret, fichier de licence, objet ou volume de données n'entre dans Git.
- Respecter les règles de commits définies dans AGENTS.md.

---

## Task 1: Valider le runtime S3 maintenu et le Compose local

**Files:**
- Create: docker-compose.yml
- Create: .env.example
- Modify: .gitignore
- Modify: docs/IMPLEMENTATION_PLAN.md
- Modify: AGENTS.md
- Create: docs/architecture/object-storage-decision.md

- [ ] Consigner la décision explicite du propriétaire sur AIStor Free, sa licence single-node et l'absence de SLA.
- [ ] Ajouter minio.license et tout chemin local de licence à .gitignore ; documenter MINIO_LICENSE_FILE sans valeur réelle.
- [ ] Écrire docker-compose.yml avec postgres et service object-storage épinglé ; monter la licence en lecture seule ; volume de données nommé ; ports 9000/9001 ; healthcheck.
- [ ] Vérifier :

~~~powershell
docker compose config
docker compose up -d postgres object-storage
docker compose ps
docker compose logs --tail 50 object-storage
~~~

- [ ] Créer un bucket privé manuellement via le client uniquement pour ce test ; vérifier PUT/GET puis le supprimer. La création applicative idempotente sera faite Task 3.
- [ ] Exécuter git diff --check et vérifier que git status n'affiche ni licence ni données.
- [ ] Commit : git commit -m "build: add maintained S3 service".

---

## Task 2: Créer les métadonnées d'images

**Files:**
- Modify: backend/pom.xml
- Create: backend/src/main/resources/db/migration/V4__create_product_images.sql
- Create: backend/src/main/java/com/molo/devopsstore/product/domain/ProductImage.java
- Create: backend/src/main/java/com/molo/devopsstore/product/infrastructure/ProductImageRepository.java
- Create: backend/src/test/java/com/molo/devopsstore/product/infrastructure/ProductImageRepositoryTest.java

- [ ] Écrire les tests PostgreSQL : cascade produit, object_key unique, position 0..4, position unique par produit et au plus une image principale.
- [ ] Lancer et constater l'échec.
- [ ] Ajouter io.minio:minio:9.0.1 et un décodeur ImageIO WebP maintenu, avec version explicite.
- [ ] V4 crée product_images avec id, product_id FK cascade, object_key, content_type, size_bytes, width, height, position, is_primary, created_at ; ajouter contraintes et index partiel.
- [ ] Implémenter ProductImage encapsulée avec moveTo et makePrimary.
- [ ] Faire passer test ciblé puis toute la suite backend.
- [ ] Commit : git commit -m "feat: persist product image metadata".

---

## Task 3: Isoler et tester le stockage objet

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/product/application/ObjectStorage.java
- Create: backend/src/main/java/com/molo/devopsstore/product/application/StoredObject.java
- Create: backend/src/main/java/com/molo/devopsstore/product/infrastructure/MinioProperties.java
- Create: backend/src/main/java/com/molo/devopsstore/product/infrastructure/MinioObjectStorage.java
- Modify: backend/src/main/resources/application.yml
- Create: backend/src/test/java/com/molo/devopsstore/product/infrastructure/MinioObjectStorageIntegrationTest.java
- Create: backend/src/test/java/com/molo/devopsstore/testsupport/S3ContainerSupport.java

- [ ] Définir le port avec ensureBucket, put, delete et presignGet(Duration).
- [ ] Écrire le test d'intégration contre le conteneur AIStor épinglé : bucket créé idempotemment, round-trip, suppression et URL GET valable cinq minutes.
- [ ] Faire échouer le test avant l'adaptateur.
- [ ] S3ContainerSupport lit MINIO_LICENSE_FILE, monte le fichier en lecture seule et échoue clairement si absent ; aucune licence factice n'est ajoutée.
- [ ] Binder MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET. Les logs n'exposent jamais les credentials ni les URLs signées.
- [ ] Implémenter MinioObjectStorage et faire passer le test.
- [ ] Commit : git commit -m "feat: add S3 storage adapter".

---

## Task 4: Valider et uploader une image avec compensation

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/product/application/{ImageInspector,ProductImageService,InvalidImageException,ImageLimitExceededException,StorageException}.java
- Create: backend/src/main/java/com/molo/devopsstore/product/api/dto/ProductImageResponse.java
- Create: backend/src/test/java/com/molo/devopsstore/product/application/ProductImageServiceTest.java
- Create: backend/src/test/resources/images/{valid.jpg,valid.png,valid.webp,oversized-dimensions.png,animated.webp}

- [ ] Tester signatures réelles, fichiers tronqués, faux content-type, SVG, animé, >5 MiB, dimensions >4096 et sixième image.
- [ ] Tester que l'échec repository après put déclenche delete par compensation.
- [ ] Lancer et constater l'échec.
- [ ] ImageInspector décode le flux avec ImageIO/plugins WebP, impose une limite en streaming et retourne type/dimensions fiables.
- [ ] ProductImageService génère une UUID, choisit la première image comme principale et verrouille les images du produit avant de compter/positionner.
- [ ] Faire passer tests ciblés et régression.
- [ ] Commit : git commit -m "feat: validate and upload product images".

---

## Task 5: Exposer galerie, ordre, principale et suppression

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/product/api/ProductImageController.java
- Create: backend/src/main/java/com/molo/devopsstore/product/api/dto/ReorderProductImagesRequest.java
- Modify: backend/src/main/java/com/molo/devopsstore/identity/infrastructure/SecurityConfig.java
- Modify: backend/src/main/java/com/molo/devopsstore/product/api/ApiExceptionHandler.java
- Create: backend/src/test/java/com/molo/devopsstore/product/api/ProductImageApiIntegrationTest.java

- [ ] Tester GET pour tous rôles ; POST/PUT/DELETE pour EDITOR+ADMIN ; 403 VIEWER.
- [ ] Tester multipart, ordre contenant exactement les IDs existants, principale unique, suppression principale qui promeut la première restante, produit/image inconnus.
- [ ] Implémenter les cinq routes prévues par la spécification avec Problem Details typés et requestId.
- [ ] Les URLs signées ne sont émises qu'après vérification du droit de lecture et expirent après cinq minutes.
- [ ] Faire passer tests ciblés puis clean verify.
- [ ] Commit : git commit -m "feat: expose product image gallery".

---

## Task 6: Garantir le nettoyage après commit

**Files:**
- Create: backend/src/main/java/com/molo/devopsstore/product/application/{ObjectDeletionRequested,ObjectDeletionListener,OrphanObjectReconciler}.java
- Modify: backend/src/main/java/com/molo/devopsstore/product/application/ProductImageService.java
- Modify: backend/src/main/java/com/molo/devopsstore/product/application/ProductService.java
- Create: backend/src/test/java/com/molo/devopsstore/product/application/ObjectDeletionListenerTest.java
- Create: backend/src/test/java/com/molo/devopsstore/product/application/OrphanObjectReconcilerTest.java

- [ ] Tester que delete objet se produit après commit, jamais après rollback, et qu'un échec est retenté sans rendre l'objet accessible.
- [ ] Tester la suppression produit avec plusieurs images et la réconciliation d'un objet orphelin.
- [ ] Publier l'événement dans la transaction et traiter avec TransactionalEventListener AFTER_COMMIT.
- [ ] Ajouter retry borné et métriques ; la réconciliation compare par préfixe et ne supprime que les objets plus anciens qu'une fenêtre de sécurité.
- [ ] Faire passer clean verify, docker compose config et git diff --check.
- [ ] Mettre à jour README/docs/AGENTS/.env.example.
- [ ] Commit : git commit -m "feat: reconcile product image storage".

## Acceptance Gate

- [ ] La décision/licence du runtime S3 est explicite et aucun fichier de licence n'est suivi.
- [ ] PostgreSQL et le stockage objet passent les tests d'intégration.
- [ ] Les limites type/taille/dimensions/nombre sont testées.
- [ ] Upload, compensation, ordre, principale, suppression et nettoyage après commit passent.
- [ ] La matrice de rôles des images passe.
