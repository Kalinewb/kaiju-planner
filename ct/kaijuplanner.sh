#!/usr/bin/env bash
# Resolve ct/ and install/ scripts from this repo; the engine still comes from community-scripts/core.
export COMMUNITY_SCRIPTS_URL="${COMMUNITY_SCRIPTS_URL:-https://raw.githubusercontent.com/Kalinewb/kaiju-planner/main}"
source <(curl -fsSL "${COMMUNITY_SCRIPTS_CORE_URL:-https://raw.githubusercontent.com/community-scripts/core/main}/core/build.func")
# Copyright (c) 2026 Kalinewb
# License: MIT | https://github.com/Kalinewb/kaiju-planner/raw/main/LICENSE
# Source: https://github.com/Kalinewb/kaiju-planner

APP="Kaiju Planner"
var_tags="${var_tags:-planning;productivity}"
var_cpu="${var_cpu:-1}"
var_ram="${var_ram:-1024}"
var_disk="${var_disk:-4}"
var_os="${var_os:-debian}"
var_version="${var_version:-13}"
var_arm64="${var_arm64:-yes}"
var_unprivileged="${var_unprivileged:-1}"

# ── Banner ────────────────────────────────────────────────────────────────────
# The engine keeps its banners in its own repo, so this script draws its own.
header_info() {
  declare -f _cs_clear >/dev/null 2>&1 && _cs_clear || clear
  local art=(
    '██╗  ██╗  █████╗  ██╗      ██╗ ██╗   ██╗'
    '██║ ██╔╝ ██╔══██╗ ██║      ██║ ██║   ██║'
    '█████╔╝  ███████║ ██║      ██║ ██║   ██║'
    '██╔═██╗  ██╔══██║ ██║ ██   ██║ ██║   ██║'
    '██║  ██╗ ██║  ██║ ██║ ╚█████╔╝ ╚██████╔╝'
    '╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚════╝   ╚═════╝'
  )
  local shades=(93 99 105 111 117 123)
  local i
  echo
  for i in "${!art[@]}"; do
    if [[ -t 1 ]]; then printf '  \033[1;38;5;%sm%s\033[0m\n' "${shades[$i]}" "${art[$i]}"; else printf '  %s\n' "${art[$i]}"; fi
  done
  if [[ -t 1 ]]; then
    printf '  \033[38;5;245m%s\033[0m\n' 'P L A N N E R   ·   you decide, it organises'
    printf '  \033[38;5;240m%s\033[0m\n\n' '────────────────────────────────────────────'
  else
    printf '  P L A N N E R   ·   you decide, it organises\n\n'
  fi
}

header_info "$APP"
variables
color
catch_errors

function update_script() {
  header_info
  check_container_storage
  check_container_resources

  if [[ ! -d /opt/kaiju-planner/.git ]]; then
    msg_error "No ${APP} Installation Found!"
    exit
  fi

  cd /opt/kaiju-planner || exit
  msg_info "Checking for updates"
  $STD git fetch --depth 1 origin main
  if [[ "$(git rev-parse HEAD)" == "$(git rev-parse FETCH_HEAD)" ]]; then
    msg_ok "${APP} is already up to date"
    exit
  fi
  msg_ok "An update is available"

  msg_info "Stopping ${APP}"
  systemctl stop kaiju-planner
  msg_ok "Stopped ${APP}"

  # Keep a copy of the data before touching anything. -n: never overwrite an existing copy.
  msg_info "Saving a copy of your data"
  mkdir -p /var/lib/kaiju-planner/pre-update-copies
  if [[ -f /var/lib/kaiju-planner/kaiju.db ]]; then
    cp -n /var/lib/kaiju-planner/kaiju.db "/var/lib/kaiju-planner/pre-update-copies/kaiju-$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD).db"
  fi
  chown -R kaiju:kaiju /var/lib/kaiju-planner
  msg_ok "Saved a copy of your data"

  msg_info "Updating ${APP}"
  $STD git reset --hard FETCH_HEAD
  $STD npm ci
  $STD npm run build
  $STD npm prune --omit=dev
  msg_ok "Updated ${APP}"

  msg_info "Starting ${APP}"
  systemctl start kaiju-planner
  msg_ok "Started ${APP}"
  msg_ok "Updated successfully!"
  exit
}

start
build_container
description

msg_ok "Completed successfully!\n"
echo -e "${CREATING}${GN}${APP} setup has been successfully initialized!${CL}"
echo -e "${INFO}${YW}Open it on your network at:${CL}"
echo -e "${TAB}${GATEWAY}${BGN}http://${IP}:3210${CL}"
echo -e "${INFO}${YW}Your login password is stored inside the container:${CL}"
echo -e "${TAB}${BGN}pct exec ${CTID} -- cat /root/kaiju-planner.creds${CL}"
echo -e "${INFO}${YW}Going online? Put an HTTPS reverse proxy (e.g. Nginx) in front, then add its address to${CL}"
echo -e "${TAB}${BGN}KAIJU_TRUSTED_PROXIES${CL}${YW} in /etc/kaiju-planner.env (see the README).${CL}"
