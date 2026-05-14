#!/usr/bin/env bash

set -euo pipefail

REPO=""
VERSION="latest"
INSTALL_DIR="${HOME}/.local/share/cycleview"
BIN_DIR="${HOME}/.local/bin"
BROWSER_BIN="chromium-browser"
USER_DATA_DIR="${HOME}/.config/cycleview-chromium"
SETTINGS_PATH=""
SHOW_HELP=0

usage() {
  cat <<'EOF'
Usage:
  install-cycleview.sh --repo <owner/repo> [options]

Options:
  --repo <owner/repo>       GitHub repository, for example: example/cycleview
  --version <tag|latest>    Release tag such as v0.1.1, or "latest" (default)
  --install-dir <path>      Destination directory for the unpacked extension
  --bin-dir <path>          Directory where the kiosk launcher script is created
  --browser <command>       Browser command to use in the launcher
  --user-data-dir <path>    Chromium user data directory for kiosk mode
  --settings <path>         JSON settings file to import on first launch
  --help                    Show this message

What it does:
  1. Downloads cycleview.zip from GitHub Releases
  2. Unpacks it into <install-dir>/dist
  3. Optionally copies a bootstrap settings JSON file
  4. Creates <bin-dir>/cycleview-kiosk

Examples:
  ./install-cycleview.sh --repo your-org/cycleview
  ./install-cycleview.sh --repo your-org/cycleview --version v0.1.1
  ./install-cycleview.sh --repo your-org/cycleview --browser chromium
  ./install-cycleview.sh --repo your-org/cycleview --settings ./cycleview-settings.json
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      REPO="${2:-}"
      shift 2
      ;;
    --version)
      VERSION="${2:-}"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="${2:-}"
      shift 2
      ;;
    --bin-dir)
      BIN_DIR="${2:-}"
      shift 2
      ;;
    --browser)
      BROWSER_BIN="${2:-}"
      shift 2
      ;;
    --user-data-dir)
      USER_DATA_DIR="${2:-}"
      shift 2
      ;;
    --settings)
      SETTINGS_PATH="${2:-}"
      shift 2
      ;;
    --help|-h)
      SHOW_HELP=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ "${SHOW_HELP}" -eq 1 ]]; then
  usage
  exit 0
fi

if [[ -z "${REPO}" ]]; then
  echo "--repo is required." >&2
  usage
  exit 1
fi

if [[ -n "${SETTINGS_PATH}" && ! -f "${SETTINGS_PATH}" ]]; then
  echo "Settings file not found: ${SETTINGS_PATH}" >&2
  exit 1
fi

for required_command in curl unzip mktemp; do
  if ! command -v "${required_command}" >/dev/null 2>&1; then
    echo "Required command not found: ${required_command}" >&2
    exit 1
  fi
done

if ! command -v "${BROWSER_BIN}" >/dev/null 2>&1; then
  echo "Browser command not found: ${BROWSER_BIN}" >&2
  echo "Pass --browser <command> if your Chromium executable has a different name." >&2
  exit 1
fi

if [[ "${VERSION}" == "latest" ]]; then
  ZIP_URL="https://github.com/${REPO}/releases/latest/download/cycleview.zip"
else
  ZIP_URL="https://github.com/${REPO}/releases/download/${VERSION}/cycleview.zip"
fi

TMP_DIR="$(mktemp -d)"
ZIP_PATH="${TMP_DIR}/cycleview.zip"
UNPACK_DIR="${TMP_DIR}/unpacked"
TARGET_DIST_DIR="${INSTALL_DIR}/dist"
LAUNCHER_PATH="${BIN_DIR}/cycleview-kiosk"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

echo "Downloading ${ZIP_URL}"
curl -fL "${ZIP_URL}" -o "${ZIP_PATH}"

rm -rf "${UNPACK_DIR}"
mkdir -p "${UNPACK_DIR}"
unzip -q "${ZIP_PATH}" -d "${UNPACK_DIR}"

mkdir -p "${INSTALL_DIR}"
rm -rf "${TARGET_DIST_DIR}"
mkdir -p "${TARGET_DIST_DIR}"
cp -R "${UNPACK_DIR}/." "${TARGET_DIST_DIR}/"

if [[ -n "${SETTINGS_PATH}" ]]; then
  cp "${SETTINGS_PATH}" "${TARGET_DIST_DIR}/bootstrap-settings.json"
fi

mkdir -p "${BIN_DIR}"
mkdir -p "${USER_DATA_DIR}"

cat > "${LAUNCHER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

exec "${BROWSER_BIN}" \\
  --user-data-dir="${USER_DATA_DIR}" \\
  --kiosk \\
  --start-fullscreen \\
  --disable-session-crashed-bubble \\
  --no-first-run \\
  --disable-infobars \\
  --load-extension="${TARGET_DIST_DIR}" "\$@"
EOF

chmod +x "${LAUNCHER_PATH}"

cat <<EOF
Installed cycleview.

Extension directory:
  ${TARGET_DIST_DIR}

Kiosk launcher:
  ${LAUNCHER_PATH}

Next step:
  Run '${LAUNCHER_PATH}'

Notes:
  - If --settings was provided, cycleview imports that JSON automatically on first launch when its local settings are still empty.
  - Without --settings, the first run still requires you to configure cycleview inside the browser.
  - If your browser command is not '${BROWSER_BIN}', rerun this script with --browser.
  - This script installs the latest release zip unless --version is specified.
EOF
