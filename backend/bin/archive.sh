#!/bin/bash

set -eu

# Define directories
BIN_DIR="$(dirname "$(readlink -f "$0")")"
BACKEND_DIR="$(dirname "$BIN_DIR")"
STORAGE_DIR="$BACKEND_DIR/storage"
BACKUPS_DIR="$BACKEND_DIR/public/backups"

if [ ! -d "$STORAGE_DIR" ]; then
  echo "storage directory ($STORAGE_DIR) not found."
  exit 1
fi

if [ ! -d "$BACKUPS_DIR" ]; then
  echo "public directory ($BACKUPS_DIR) not found."
  exit 1
fi

# change to backend directory before compression
tar -czf archive.tar.gz -C "$BACKEND_DIR" storage

## make a dated copy of it
cp archive.tar.gz "$BACKUPS_DIR/archive_$(date +%Y%m%d).tar.gz"
mv archive.tar.gz "$BACKUPS_DIR"

echo -e "\e[32m\u2705 Archive created in $BACKUPS_DIR \e[0m"
