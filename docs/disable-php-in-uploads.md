Disable PHP execution in uploads (recommended)

Overview

If attackers can upload files, ensure uploaded files cannot be executed as PHP. Defense-in-depth:

1) Store uploads outside the webroot (done in this repo: /uploads)
2) Scan uploaded file contents for PHP tags server-side (implemented)
3) Configure webserver to never execute PHP from upload locations

Nginx snippet (recommended)

# Deny access to PHP files under /uploads and never pass them to PHP-FPM
location ~* ^/uploads/.*\.(php|phtml|phar)$ {
  return 404;
}

# Optionally serve/uploads via the app (proxy) rather than static from nginx
# Do NOT include fastcgi_pass in any /uploads location block.

Apache (.htaccess or virtualhost)

# Place in the uploads directory or inside <Directory> for uploads
<IfModule mod_php7.c>
  php_flag engine off
</IfModule>
RemoveHandler .php .phtml .php3 .php4 .php5
RemoveType .php .phtml .php3 .php4 .php5

# Deny direct access to PHP-like files
<FilesMatch "\.(php|phtml|phar)$">
  Require all denied
</FilesMatch>

Deployment checklist

- Apply Nginx snippet to your site config and reload nginx
- If using Apache, add the .htaccess or configure the Directory directive
- Verify uploads are stored outside webroot and are served by the application with safe headers
- Re-scan your webroot and uploads for PHP tags and quarantine/remove any matches
- Consider re-encoding images with sharp on upload to strip embedded payloads and metadata

Example verification (on server):

# Find files with PHP tags
grep -RIl "<?php" /var/www/html /path/to/uploads || true

# Check that /uploads URLs do not execute PHP (use curl -I)
curl -I https://yourdomain.example/uploads/somefile.php

Notes

These measures are layered: server config + app-level scanning + storing outside webroot gives strong protection against webshells and polyglot uploads.
