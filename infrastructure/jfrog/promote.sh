#!/bin/sh
set -eu

: "${JFROG_INTERNAL_URL:?JFROG_INTERNAL_URL is required}"
: "${JFROG_ADMIN_TOKEN:?JFROG_ADMIN_TOKEN is required}"
: "${VERSION:?VERSION=X.Y.Z is required}"
echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
    echo 'VERSION must match X.Y.Z and must not be a snapshot' >&2
    exit 1
}

artifact=devops-store-backend
path="com/molo/${artifact}/${VERSION}"
candidate_repo=devops-store-candidates-local
release_repo=devops-store-releases-local
auth="Authorization: Bearer ${JFROG_ADMIN_TOKEN}"
response=/tmp/jfrog-response

status() {
    curl --silent --show-error --output "$response" --write-out '%{http_code}' \
        --header "$auth" "$1"
}

candidate_code=$(status "${JFROG_INTERNAL_URL}/api/storage/${candidate_repo}/${path}")
[ "$candidate_code" = 200 ] || {
    echo "Candidate ${VERSION} does not exist" >&2
    exit 1
}

existing=0
for extension in pom jar
do
    filename="${artifact}-${VERSION}.${extension}"
    source_url="${JFROG_INTERNAL_URL}/api/storage/${candidate_repo}/${path}/${filename}"
    source_code=$(status "$source_url")
    [ "$source_code" = 200 ] || {
        echo "Candidate file ${filename} does not exist" >&2
        exit 1
    }
    checksum=$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' "$response" | head -n 1)
    echo "$checksum" | grep -Eq '^[0-9a-fA-F]{64}$' || {
        echo "Cannot read SHA-256 for ${filename}" >&2
        exit 1
    }
    printf '%s' "$checksum" > "/tmp/${extension}.sha256"

    target_url="${JFROG_INTERNAL_URL}/api/storage/${release_repo}/${path}/${filename}"
    target_code=$(status "$target_url")
    case "$target_code" in
        200)
            target_checksum=$(sed -n 's/.*"sha256"[[:space:]]*:[[:space:]]*"\([0-9a-fA-F]*\)".*/\1/p' "$response" | head -n 1)
            [ "$target_checksum" = "$checksum" ] || {
                echo "Release file ${filename} already exists with a different checksum" >&2
                exit 1
            }
            printf existing > "/tmp/${extension}.state"
            existing=$((existing + 1))
            ;;
        404)
            printf missing > "/tmp/${extension}.state"
            ;;
        *)
            echo "Cannot inspect release file ${filename}: HTTP ${target_code}" >&2
            exit 1
            ;;
    esac
done

[ "$existing" -lt 2 ] || {
    echo "Release ${VERSION} already exists" >&2
    exit 1
}

for extension in pom jar
do
    [ "$(cat "/tmp/${extension}.state")" = missing ] || continue
    filename="${artifact}-${VERSION}.${extension}"
    checksum=$(cat "/tmp/${extension}.sha256")
    attempt=1
    while :
    do
        deploy_code=$(curl --silent --show-error --output "$response" --write-out '%{http_code}' \
            --request PUT \
            --header "$auth" \
            --header 'X-Checksum-Deploy: true' \
            --header "X-Checksum-Sha256: ${checksum}" \
            "${JFROG_INTERNAL_URL}/${release_repo}/${path}/${filename}")
        [ "$deploy_code" = 201 ] && break
        case "$deploy_code" in
            400|404)
                [ "$attempt" -lt 3 ] || break
                attempt=$((attempt + 1))
                sleep 2
                ;;
            *) break ;;
        esac
    done
    [ "$deploy_code" = 201 ] || {
        echo "Promotion of ${filename} failed: HTTP ${deploy_code}" >&2
        exit 1
    }
done

release_code=$(status "${JFROG_INTERNAL_URL}/api/storage/${release_repo}/${path}")
[ "$release_code" = 200 ] || {
    echo "Promoted release ${VERSION} cannot be verified" >&2
    exit 1
}

echo "Release ${VERSION} promoted by checksum deployment"
