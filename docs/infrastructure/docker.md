# Images et stack Docker Compose

La stack locale exécute quatre services durables : le frontend Nginx, le backend Spring Boot,
PostgreSQL et AIStor. Un cinquième conteneur initialise les permissions du volume AIStor puis se
termine avec le code 0.

## Prérequis et configuration

- Docker Desktop avec Docker Compose ;
- une licence AIStor Free locale, conservée hors Git ;
- un fichier `.env` créé depuis `.env.example`.

Renseigner dans `.env` les valeurs laissées vides : `DB_PASSWORD`, `MINIO_LICENSE_FILE`,
`MINIO_SECRET_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` et
`BOOTSTRAP_ADMIN_NAME`. `MINIO_LICENSE_FILE` accepte un chemin absolu ou un chemin relatif à la
racine du dépôt. `docker compose config` échoue explicitement si une valeur obligatoire manque.

`MINIO_ENDPOINT` désigne AIStor depuis le backend. Compose impose donc
`http://object-storage:9000`. `MINIO_PUBLIC_ENDPOINT` désigne l'adresse incluse dans les URL
présignées retournées au navigateur et vaut `http://localhost:9000` par défaut. `MINIO_REGION`
vaut `us-east-1` par défaut et évite une découverte réseau lors de la signature.

Si `MINIO_API_PORT` change, adapter aussi le port de `MINIO_PUBLIC_ENDPOINT`. La politique CSP
Nginx autorise les images servies par `localhost` et `127.0.0.1` sur les ports locaux ; utiliser un
autre hôte exige d'adapter `img-src` dans `frontend/nginx.conf`, puis de reconstruire l'image.

## Démarrage et arrêt

Avec GNU Make :

```bash
make application
make status
make logs
make down
```

Équivalent direct, notamment sous PowerShell :

```powershell
docker compose config
docker compose build --pull
docker compose up -d --wait
docker compose ps
docker compose logs --follow --tail=200
docker compose down
```

`down` conserve les volumes PostgreSQL et AIStor. Leur suppression n'est jamais cachée dans une
cible Make et exige une commande Docker explicite.

## Images applicatives

Le backend utilise Maven 3.9.16/JDK 25 pour produire le jar, puis copie uniquement ce jar dans un
runtime Temurin JRE 25 exécuté par `10001:10001`. Maven, Javac, les sources et la licence AIStor ne
sont pas présents dans l'image finale.

Le frontend utilise Node 24.18.0 pour compiler Angular, puis copie uniquement `dist/frontend/browser`
dans Nginx unprivileged 1.29.4 exécuté par `101:101`. Node, npm et les sources ne sont pas présents
dans le runtime. Tous les `FROM` sont associés à un tag lisible et à un digest immuable.

## Réseau, santé et sécurité

Nginx écoute sur le port interne 8080, sert la SPA avec fallback vers `index.html` et transmet
`/api/` à `backend:8080`. Il propage ou crée `X-Request-ID` et ajoute des politiques de type,
framing, référent, permissions et contenu. HSTS est volontairement absent de cette stack HTTP
locale et appartient à une future terminaison TLS.

Le démarrage suit cet ordre :

1. PostgreSQL et l'initialiseur de permissions AIStor démarrent ;
2. AIStor attend la réussite de l'initialiseur ;
3. le backend attend PostgreSQL et AIStor sains ;
4. le frontend attend le backend sain.

Les ports sont liés uniquement à `127.0.0.1` : 4200, 8080, 5432, 9000 et 9001. Ils peuvent être
surchargés avec `FRONTEND_PORT`, `BACKEND_PORT`, `POSTGRES_PORT`, `MINIO_API_PORT` et
`MINIO_CONSOLE_PORT`. Les services disposent de limites CPU, mémoire et processus, de délais
d'arrêt bornés et de `no-new-privileges`. Les runtimes applicatifs et AIStor utilisent une racine en
lecture seule et suppriment toutes les capacités Linux. L'initialiseur conserve seulement `CHOWN`
et `DAC_READ_SEARCH` afin de rester idempotent sur un volume AIStor déjà rempli.

## Diagnostic

- Valeur manquante : exécuter `docker compose config` et compléter la variable nommée dans `.env`.
- Port occupé : identifier son propriétaire, puis modifier le port hôte correspondant dans `.env` ;
  ne pas arrêter un service étranger sans confirmation.
- Service unhealthy : lancer `docker compose ps`, puis
  `docker compose logs --tail=200 <service>` et inspecter son healthcheck.
- Réponse 502 sous `/api` : vérifier d'abord la santé et les journaux du backend.
- URL d'image inaccessible : vérifier que `MINIO_PUBLIC_ENDPOINT` est joignable par le navigateur,
  tandis que `MINIO_ENDPOINT` reste joignable par le backend.
- Erreur de licence AIStor : vérifier le chemin et les droits de lecture sans afficher le contenu du
  fichier.
