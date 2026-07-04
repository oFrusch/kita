#!/usr/bin/env bash
# Install a rootless copy of valgrind into bench/.valgrind for machines without
# passwordless sudo. Uses apt-get download (no root) + dpkg-deb extraction.
set -euo pipefail

DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.valgrind"
mkdir -p "$DEST"
cd "$DEST"

echo "Downloading valgrind .deb (no root)..."
apt-get download valgrind
dpkg-deb -x valgrind_*.deb .
rm -f valgrind_*.deb

echo "Verifying..."
LIB="$DEST/usr/libexec/valgrind"; [ -d "$LIB" ] || LIB="$DEST/usr/lib/valgrind"
VALGRIND_LIB="$LIB" "$DEST/usr/bin/valgrind" --version
echo "valgrind ready at $DEST/usr/bin/valgrind (VALGRIND_LIB=$LIB)"
