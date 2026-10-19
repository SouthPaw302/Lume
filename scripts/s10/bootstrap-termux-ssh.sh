#!/data/data/com.termux/files/usr/bin/bash
set -eu

PREFIX="/data/data/com.termux/files/usr"
PUBLIC_KEY_SOURCE="/sdcard/lume-s10-usb.pub"
RECOVERY_SOURCE="/sdcard/lume-services-watchdog.sh"
BOOT_SCRIPT="$HOME/.termux/boot/10-lume-services"

pkg install -y openssh

mkdir -p "$HOME/.ssh" "$HOME/.termux/boot"
chmod 700 "$HOME/.ssh" "$HOME/.termux" "$HOME/.termux/boot"
cp "$PUBLIC_KEY_SOURCE" "$HOME/.ssh/authorized_keys"
chmod 600 "$HOME/.ssh/authorized_keys"
cp "$RECOVERY_SOURCE" "$BOOT_SCRIPT"
chmod 700 "$BOOT_SCRIPT"

printf '%s\n' "$(whoami)" > /sdcard/lume-termux-user.txt

pkill -x sshd >/dev/null 2>&1 || true
sshd -p 8022 \
  -o ListenAddress=127.0.0.1 \
  -o PasswordAuthentication=no \
  -o KbdInteractiveAuthentication=no \
  -o PubkeyAuthentication=yes

bash "$BOOT_SCRIPT"
