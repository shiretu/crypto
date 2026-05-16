#!/bin/sh

set -e

symbol="$1"
if [ -z "${symbol}" ]; then
    echo "usage: $0 <symbol>  (e.g., binance:btc:usdc)" >&2
    exit 2
fi

# Encode symbol → service name. "binance:eth:usdc" → "ob_binance_eth_usdc"
serviceName="ob_$(echo "${symbol}" | tr ':' '_')"
serviceFileName="${serviceName}.service"

# Resolve root path two levels up from this script
rootPath=$(realpath "$(dirname "$(realpath "$0")")/../..")
srcServicePath="${rootPath}/deployments/ubuntu/ob.service.template"
destService="/etc/systemd/system/${serviceFileName}"

# Substitute placeholders and install systemd service
cat "${srcServicePath}" |
    sed "s|root_replace|${rootPath}|g" |
    sed "s|user_replace|${SUDO_USER}|g" |
    sed "s|node_replace|$(dirname $(which node))|g" |
    sed "s|symbol_replace|${symbol}|g" \
        >/tmp/service
sudo mv /tmp/service "${destService}"
sudo chmod 644 "${destService}"
echo "${destService} created"

# Reload and activate service
sudo systemctl daemon-reexec
sudo systemctl daemon-reload
sudo systemctl enable "${serviceName}"
sudo systemctl restart "${serviceName}"
sudo service "${serviceName}" status
