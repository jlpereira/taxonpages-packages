# TaxonPages Basic Auth Plugin

Protects an entire TaxonPages site with HTTP **Basic authentication**. When a
visitor opens the site, the browser shows its native login dialog asking for a
username and password. This is implemented via the standard `401` +
`WWW-Authenticate: Basic` response — no custom UI is needed.

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-plugin-basic-auth
```

TaxonPages picks up the plugin automatically through the `taxonpages` field
declared in its `package.json`.

### Manual

Copy the `basic-auth/` folder into your project's `plugins/` directory:

```
plugins/
  basic-auth/
    plugin.js
    package.json
```

The plugin is discovered automatically on the next server start.

## Configuration

Settings are split between a YAML file (non-sensitive) and environment
variables (the credentials).

### `config/basic_auth.yml`

```yaml
basic_auth:
  enabled: true
  realm: "TaxonPages"
```

| Key       | Default        | Description                                            |
| --------- | -------------- | ------------------------------------------------------ |
| `enabled` | `true`         | Set to `false` to turn auth off without removing files |
| `realm`   | `"TaxonPages"` | Text shown in the browser's login dialog               |

### Credentials (`.env`)

The username **and** password are read from environment variables. They must
use the `TAXONPAGES_` prefix so they stay **server-side only** and are never
bundled into the client (Vite's default `envPrefix` is `VITE_`).

```
TAXONPAGES_BASIC_AUTH_USERNAME=admin
TAXONPAGES_BASIC_AUTH_PASSWORD=changeme
```

> If either variable is missing, the plugin logs a warning and authentication
> stays **off** (the site is not protected). Set both to activate it.

## How it works

1. On server start, the plugin's `server(app)` hook reads `config/basic_auth.yml`
   and loads `TAXONPAGES_*` variables from `.env`.
2. It registers an Express middleware ahead of all routes (SSR pages, static
   assets, and `/api`).
3. Each request must carry a valid `Authorization: Basic` header. Credentials
   are compared in constant time (`crypto.timingSafeEqual`) to avoid timing
   attacks.
4. Requests without valid credentials get a `401` with `WWW-Authenticate`,
   which makes the browser prompt for username/password.
5. `/ping` (healthcheck) is always allowed through.

## Notes

- This is a single-user gate intended for staging/preview sites. Basic auth
  sends credentials base64-encoded on every request, so always serve over
  HTTPS.

## License

MIT
