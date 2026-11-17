#!/usr/bin/env bash
# Creates the Precon app's private release signing key, ONCE.
#
#   bash scripts/create-signing-key.sh
#
# Writes, outside the repo (never commit these):
#   ~/.precon-signing/precon-release.jks      the key (PKCS12, RSA 4096, valid ~30 years)
#   ~/.precon-signing/signing.properties      where it is and its password, read by the build
#
# Android only installs an update if it's signed with the SAME key as the app
# already on the phone. Lose this key and existing installs can never be updated
# (everyone would have to uninstall and reinstall). Back both files up off this
# Mac (password manager / encrypted storage). See README.md "Signing".
set -euo pipefail

DIR="${PRECON_SIGNING_DIR:-$HOME/.precon-signing}"
KEYSTORE="$DIR/precon-release.jks"
PROPS="$DIR/signing.properties"
ALIAS="precon-release"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"

if [[ -e "$KEYSTORE" || -e "$PROPS" ]]; then
  echo "A signing key already exists in $DIR. Not overwriting it: replacing the key would stop app updates installing." >&2
  exit 1
fi

umask 077
mkdir -p "$DIR"
chmod 700 "$DIR"
PASSWORD="$(openssl rand -base64 33 | tr -d '/+=' | cut -c1-32)"

"$JAVA_HOME/bin/keytool" -genkeypair -v \
  -storetype PKCS12 -keystore "$KEYSTORE" -alias "$ALIAS" \
  -keyalg RSA -keysize 4096 -validity 11000 \
  -dname "CN=Precon Sump, O=Precon, L=Coimbatore, ST=Tamil Nadu, C=IN" \
  -storepass "$PASSWORD" -keypass "$PASSWORD" >/dev/null 2>&1

cat > "$PROPS" <<EOF
# Precon Sump release signing (read by mobile/plugins/with-release-signing.js). Never commit.
storeFile=$KEYSTORE
storePassword=$PASSWORD
keyAlias=$ALIAS
keyPassword=$PASSWORD
EOF
chmod 600 "$KEYSTORE" "$PROPS"

echo "Created $KEYSTORE and $PROPS (readable only by you)."
echo "Certificate fingerprint (SHA-256), to recognise this key later:"
"$JAVA_HOME/bin/keytool" -list -v -keystore "$KEYSTORE" -storepass "$PASSWORD" -alias "$ALIAS" | grep -E "SHA256:" | sed 's/^[[:space:]]*/  /'
