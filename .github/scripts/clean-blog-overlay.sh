#!/bin/sh
# Retain only the hash-verified media manifest; the new overlay supplies all pages.
set -eu
root=$(cd "${1:?site root required}" && pwd -P)
manifest=${2:?media manifest required}
[ "$root" != / ] && [ -s "$manifest" ] || exit 2
[ -z "$(find "$root" -type l -print -quit)" ] || { echo 'Symlinked site rejected'; exit 2; }
# Validate the complete manifest before removing any file.
while IFS= read -r relative; do
  case "$relative" in ''|/*|*'\'*|..|../*|*/../*|*/..|./*|*/./*|*/.) echo 'Unsafe media path'; exit 2 ;; esac
  [ -f "$root/$relative" ] || { echo 'Missing verified media'; exit 2; }
done < "$manifest"
find "$root" -type f -exec sh -c '
  root=$1; manifest=$2; shift 2
  for file do
    relative=${file#"$root"/}
    if ! grep -Fqx -- "$relative" "$manifest"; then rm -- "$file"; fi
  done
' sh "$root" "$manifest" {} +
# Empty article directories must not turn a removed directory URL into a 403.
find "$root" -depth -type d -empty ! -path "$root" -exec rmdir -- {} \;
