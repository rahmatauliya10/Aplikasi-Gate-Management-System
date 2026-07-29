# SSL / TLS Certificates Directory for GMS Production Nginx

Place your production SSL certificate and private key in this directory:

- Certificate file: `server.crt` (or fullchain.pem)
- Private key file: `server.key` (or privkey.pem)

## How to Generate a Self-Signed Certificate for Testing:

Run the following command in terminal:

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/nginx/ssl/server.key \
  -out deploy/nginx/ssl/server.crt \
  -subj "/C=ID/ST=Indonesia/L=Jakarta/O=GMS Enterprise/OU=IT/CN=gms.local"
```
