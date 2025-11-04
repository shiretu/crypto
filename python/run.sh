#!/bin/bash

# bail on error
set -e

# get current folder and exec name
current_folder=$(realpath "$(dirname "$0")")
root_folder=$(realpath "${current_folder}"/..)
exec_name=$(echo "$(basename "$0")" | sed 's/\.sh$//')

# Setup Python virtual environment
VENV_DIR="${root_folder}"/.venv
packages="matplotlib torch black"
packages_hash=$(echo "${packages}" | md5sum | awk '{print $1}')

# Create venv if needed
if [ ! -d "${VENV_DIR}" ]; then
    python3 -m venv "${VENV_DIR}"
fi

# Always activate venv before pip install or running python
source "${VENV_DIR}"/bin/activate

# Install packages if not already installed (marker file)
if [ ! -f "${VENV_DIR}/${packages_hash}" ]; then
    "${VENV_DIR}/bin/pip" install --upgrade pip
    "${VENV_DIR}/bin/pip" install ${packages}
    touch "${VENV_DIR}/${packages_hash}"
fi

# Run the target Python script
python3 "${current_folder}"/"${exec_name}".py "$@"
