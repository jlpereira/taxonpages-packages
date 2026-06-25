import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import yaml from 'js-yaml'
import { loadEnv } from 'vite'

/**
 * Basic HTTP authentication plugin for TaxonPages.
 *
 * Protects the whole site with the browser's native Basic Auth dialog
 * (triggered by a 401 + WWW-Authenticate response).
 *
 * Configuration:
 *   - config/basic_auth.yml  → enabled, realm (non-sensitive)
 *   - environment variables  → credentials (server-side only)
 *       TAXONPAGES_BASIC_AUTH_USERNAME
 *       TAXONPAGES_BASIC_AUTH_PASSWORD
 *
 * The TAXONPAGES_ prefix ensures the credentials are never exposed to the
 * client bundle (Vite's default envPrefix is VITE_).
 */
export default function ({ projectRoot, logger }) {
  return {
    name: 'basic-auth',

    server(app) {
      const config = loadAuthConfig(projectRoot)

      if (!config.enabled) {
        logger.info('Disabled via config/basic_auth.yml (basic_auth.enabled: false).')
        return
      }

      // Load TAXONPAGES_* vars from .env files into process.env, mirroring
      // the framework's own behaviour. Does not overwrite existing vars.
      const mode = process.env.NODE_ENV || 'development'
      const env = loadEnv(mode, projectRoot, 'TAXONPAGES_')

      const username =
        process.env.TAXONPAGES_BASIC_AUTH_USERNAME ??
        env.TAXONPAGES_BASIC_AUTH_USERNAME
      const password =
        process.env.TAXONPAGES_BASIC_AUTH_PASSWORD ??
        env.TAXONPAGES_BASIC_AUTH_PASSWORD

      if (!username || !password) {
        logger.warn(
          'Missing TAXONPAGES_BASIC_AUTH_USERNAME or TAXONPAGES_BASIC_AUTH_PASSWORD. ' +
            'Authentication is NOT active. Set both in your .env file.'
        )
        return
      }

      const realm = config.realm.replace(/"/g, '')
      const expectedUser = Buffer.from(username)
      const expectedPass = Buffer.from(password)

      app.use((req, res, next) => {
        // Let the healthcheck through unauthenticated.
        if (req.path === '/ping') return next()

        const header = req.headers.authorization || ''
        const [scheme, encoded] = header.split(' ')

        if (scheme === 'Basic' && encoded) {
          const decoded = Buffer.from(encoded, 'base64').toString('utf8')
          const sep = decoded.indexOf(':')
          const user = decoded.slice(0, sep)
          const pass = decoded.slice(sep + 1)

          if (
            safeEqual(Buffer.from(user), expectedUser) &&
            safeEqual(Buffer.from(pass), expectedPass)
          ) {
            return next()
          }
        }

        res
          .status(401)
          .set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`)
          .type('text/plain')
          .end('Authentication required.')
      })

      logger.info(`Enabled (realm: "${realm}", user: "${username}").`)
    }
  }
}

/**
 * Read and normalise config/basic_auth.yml.
 *
 * @param {string} projectRoot
 * @returns {{ enabled: boolean, realm: string }}
 */
function loadAuthConfig(projectRoot) {
  const defaults = { enabled: true, realm: 'TaxonPages' }
  const filePath = path.resolve(projectRoot, 'config', 'basic_auth.yml')

  let parsed
  try {
    parsed = yaml.load(fs.readFileSync(filePath, 'utf8'))
  } catch {
    // No config file → fall back to defaults (still requires env credentials).
    return defaults
  }

  const section = (parsed && parsed.basic_auth) || {}

  return {
    enabled: section.enabled !== false,
    realm: typeof section.realm === 'string' ? section.realm : defaults.realm
  }
}

/**
 * Constant-time comparison that doesn't leak length via early return.
 *
 * @param {Buffer} a
 * @param {Buffer} b
 * @returns {boolean}
 */
function safeEqual(a, b) {
  // timingSafeEqual requires equal-length buffers; hash first to equalise.
  const ha = crypto.createHash('sha256').update(a).digest()
  const hb = crypto.createHash('sha256').update(b).digest()
  return crypto.timingSafeEqual(ha, hb)
}
