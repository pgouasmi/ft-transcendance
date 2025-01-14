#!/bin/sh
set -e  # Arrête le script si une commande échoue

# Vérifier si le certificat existe
if [ ! -f /etc/nginx/ssl/nginx.crt ]; then
    echo "Certificate not found in /etc/nginx/ssl/nginx.crt"
    ls -la /etc/nginx/ssl
    exit 1
fi

# Copier le certificat avec vérification
echo "Copying certificate..."
cp /etc/nginx/ssl/nginx.crt /usr/local/share/ca-certificates/ || {
    echo "Failed to copy certificate"
    exit 1
}

# Mettre à jour les certificats avec vérification
echo "Updating certificates..."
update-ca-certificates || {
    echo "Failed to update certificates"
    exit 1
}

# Vérifier que nginx est installé
if ! command -v nginx >/dev/null 2>&1; then
    echo "nginx not found"
    exit 1
fi

# Vérifier la configuration nginx
echo "Testing nginx configuration..."
nginx -t || exit 1

# Démarrer nginx
echo "Starting nginx..."
exec nginx -g 'daemon off;'