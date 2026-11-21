#!/usr/bin/env bash

# Copyright (c) 2026 Kalinewb
# License: MIT | https://github.com/Kalinewb/kaiju-planner/raw/main/LICENSE
# Source: https://github.com/Kalinewb/kaiju-planner

source /dev/stdin <<<"$FUNCTIONS_FILE_PATH"
color
verb_ip6
catch_errors
setting_up_container
network_check
update_os

msg_info "Installing Dependencies"
$STD apt-get install -y git openssl
msg_ok "Installed Dependencies"

NODE_VERSION="24" setup_nodejs

msg_info "Creating service user"
useradd --system --home-dir /var/lib/kaiju-planner --shell /usr/sbin/nologin kaiju
mkdir -p /var/lib/kaiju-planner
chown kaiju:kaiju /var/lib/kaiju-planner
chmod 750 /var/lib/kaiju-planner
msg_ok "Created service user"

msg_info "Downloading Kaiju Planner"
$STD git clone --depth 1 --branch main https://github.com/Kalinewb/kaiju-planner.git /opt/kaiju-planner
msg_ok "Downloaded Kaiju Planner"

msg_info "Building Kaiju Planner (this takes a minute)"
cd /opt/kaiju-planner || exit
$STD npm ci
$STD npm run build
$STD npm prune --omit=dev
msg_ok "Built Kaiju Planner"

msg_info "Configuring"
# Forwarded headers (real client address, HTTPS or not) are only believed from the proxies listed here.
# Leave empty until a reverse proxy is in place. Pass KAIJU_TRUSTED_PROXIES=<ip> when installing to set it now.
cat <<EOT >/etc/kaiju-planner.env
KAIJU_DATA=/var/lib/kaiju-planner
PORT=3210
HOST=0.0.0.0
KAIJU_TRUSTED_PROXIES=${KAIJU_TRUSTED_PROXIES:-}
KAIJU_SESSION_DAYS=14
EOT
chown root:kaiju /etc/kaiju-planner.env
chmod 640 /etc/kaiju-planner.env

KAIJU_PASSWORD="$(openssl rand -base64 24 | tr -d '/+=' | cut -c1-20)"
runuser -u kaiju -- env KAIJU_DATA=/var/lib/kaiju-planner KAIJU_NEW_PASSWORD="$KAIJU_PASSWORD" \
  node --disable-warning=ExperimentalWarning /opt/kaiju-planner/server/cli.ts set-password >/dev/null
{
  echo "Kaiju Planner login"
  echo "Password: ${KAIJU_PASSWORD}"
  echo "Change it after your first login: Settings > Change password"
} >/root/kaiju-planner.creds
chmod 600 /root/kaiju-planner.creds
unset KAIJU_PASSWORD

# Reset a forgotten password from the container's console
cat <<'EOT' >/usr/local/bin/kaiju-set-password
#!/usr/bin/env bash
set -e
set -a; . /etc/kaiju-planner.env; set +a
cd /opt/kaiju-planner
exec runuser -u kaiju -- env KAIJU_DATA="$KAIJU_DATA" node --disable-warning=ExperimentalWarning server/cli.ts set-password
EOT
chmod 755 /usr/local/bin/kaiju-set-password
msg_ok "Configured"

msg_info "Creating Service"
cat <<EOT >/etc/systemd/system/kaiju-planner.service
[Unit]
Description=Kaiju Planner
After=network.target

[Service]
Type=simple
User=kaiju
Group=kaiju
WorkingDirectory=/opt/kaiju-planner
EnvironmentFile=/etc/kaiju-planner.env
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning /opt/kaiju-planner/server/index.ts
Restart=on-failure
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOT
systemctl enable -q --now kaiju-planner
msg_ok "Created Service"

motd_ssh
customize
cleanup_lxc
