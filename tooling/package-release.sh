#!/bin/sh
set -eu
version=${1:?v-prefixed release required}
case "$version" in v[0-9]*.[0-9]*.[0-9]*) ;; *) exit 1;; esac
case "$version" in *[!a-zA-Z0-9.-]*) exit 1;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
image="mail-web:${version#v}"
destination="$root/build/release/$version"
mkdir -p "$destination/package"
test "$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$image")" = linux/amd64
docker save "$image" -o "$destination/package/image.tar"
runtime=$(docker run --rm --pull never "$image" --runtime-info)
image_id=$(docker image inspect --format '{{.Id}}' "$image")
commit=$(git rev-parse HEAD)
jq -n --arg version "$version" --arg commit "$commit" --arg image "$image" --arg id "$image_id" --argjson runtime "$runtime" '{version:$version,sourceCommit:$commit,architecture:"linux/amd64",image:$image,imageId:$id,sqliteVersion:$runtime.sqlite,database:{engine:"sqlite",migrationVersion:6,rollback:"restore-matching-backup"}}' > "$destination/package/release-manifest.json"
cp compose.yaml .env.example README.md "$destination/package/"
cp -R deploy "$destination/package/"
cp -R docs "$destination/package/"
cp -R backend/contract "$destination/package/"
(cd "$destination/package"; sha256sum image.tar > image.sha256)
tar -czf "$destination/mail-web-linux-amd64.tar.gz" -C "$destination/package" .
cp "$destination/package/release-manifest.json" "$destination/"
(cd "$destination"; sha256sum mail-web-linux-amd64.tar.gz release-manifest.json > SHA256SUMS)
printf '%s\n' "$destination"
