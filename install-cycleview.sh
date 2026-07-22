#!/usr/bin/env bash

set -euo pipefail

REPO="mzks/cycleview"
VERSION="latest"
INSTALL_DIR="${HOME}/.local/share/cycleview"
BIN_DIR="${HOME}/.local/bin"
BROWSER_BIN=""
BROWSER_WAS_SPECIFIED=0
USER_DATA_DIR="${HOME}/.config/cycleview-chromium"
SETTINGS_PATH=""
SHOW_HELP=0

usage() {
  cat <<'EOF'
Usage:
  install-cycleview.sh [options]

Options:
  --repo <owner/repo>       GitHub repository (default: mzks/cycleview)
  --version <tag|latest>    Release tag such as v0.1.2, or "latest" (default)
  --install-dir <path>      Destination directory for the unpacked extension
  --bin-dir <path>          Directory where the kiosk launcher script is created
  --browser <command>       Browser command to use in the launcher (auto-detected by default)
  --user-data-dir <path>    Chromium user data directory for kiosk mode
  --settings <path>         JSON settings file to import after installation
  --help                    Show this message

What it does:
  1. Downloads cycleview.zip from GitHub Releases
  2. Unpacks it into <install-dir>/dist
  3. Optionally copies settings and marks them for import
  4. Creates <bin-dir>/cycleview-kiosk

Examples:
  ./install-cycleview.sh
  ./install-cycleview.sh --version v0.1.2
  ./install-cycleview.sh --browser chromium
  ./install-cycleview.sh --settings ./cycleview-settings.json
  ./install-cycleview.sh --repo your-org/cycleview
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
      BROWSER_WAS_SPECIFIED=1
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

detect_browser() {
  local candidate
  local -a candidates=(
    chromium-browser
    chromium
    google-chrome
    google-chrome-stable
    brave-browser
    microsoft-edge
    microsoft-edge-stable
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/Applications/Chromium.app/Contents/MacOS/Chromium"
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  )

  for candidate in "${candidates[@]}"; do
    if [[ "${candidate}" == /* ]]; then
      if [[ -x "${candidate}" ]]; then
        BROWSER_BIN="${candidate}"
        return 0
      fi
    elif command -v "${candidate}" >/dev/null 2>&1; then
      BROWSER_BIN="${candidate}"
      return 0
    fi
  done

  return 1
}

if [[ "${BROWSER_WAS_SPECIFIED}" -eq 0 ]]; then
  if ! detect_browser; then
    echo "Could not find a supported Chromium-based browser." >&2
    echo "Install Chromium, Chrome, Brave, or Edge, or pass --browser <command>." >&2
    exit 1
  fi
  echo "Using detected browser: ${BROWSER_BIN}"
fi

if [[ "${BROWSER_BIN}" == /* ]]; then
  if [[ ! -x "${BROWSER_BIN}" ]]; then
    echo "Browser command not found: ${BROWSER_BIN}" >&2
    echo "Pass --browser <command> if your Chromium executable has a different name." >&2
    exit 1
  fi
elif ! command -v "${BROWSER_BIN}" >/dev/null 2>&1; then
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
  printf '%s-%s-%s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "${RANDOM}" "${RANDOM}" > "${TARGET_DIST_DIR}/bootstrap-settings-version.txt"
fi

mkdir -p "${BIN_DIR}"
mkdir -p "${USER_DATA_DIR}"

cat > "${LAUNCHER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

MODE="kiosk"
PASSTHROUGH_ARGS=()

while [[ \$# -gt 0 ]]; do
  case "\$1" in
    --maintenance|--maintainance)
      MODE="maintenance"
      shift
      ;;
    *)
      PASSTHROUGH_ARGS+=("\$1")
      shift
      ;;
  esac
done

CHROME_ARGS=(
  "--user-data-dir=${USER_DATA_DIR}"
  "--disable-session-crashed-bubble"
  "--hide-crash-restore-bubble"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-infobars"
  "--disable-translate"
  "--disable-translate-new-ux"
  "--disable-prompt-on-repost"
  "--noerrdialogs"
  "--load-extension=${TARGET_DIST_DIR}"
)

if [[ "\${MODE}" == "kiosk" ]]; then
  CHROME_ARGS+=(
    "--kiosk"
    "--start-fullscreen"
  )
else
  CHROME_ARGS+=(
    "--start-maximized"
  )
fi

exec "${BROWSER_BIN}" \\
"\${CHROME_ARGS[@]}" "\${PASSTHROUGH_ARGS[@]}"
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
  Run '${LAUNCHER_PATH} --maintenance' for a non-kiosk maintenance session.

Notes:
  - If --settings was provided, cycleview imports that JSON automatically after this installation. Re-running the installer with --settings replaces the browser's cycleview settings with that file.
  - Without --settings, the first run still requires you to configure cycleview inside the browser.
  - Browser: ${BROWSER_BIN} (override with --browser <command>).
  - This script installs the latest release zip unless --version is specified.
EOF
