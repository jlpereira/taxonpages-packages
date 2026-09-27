import { API_PREFIX, MEDIA_PREFIX, resolveOfflineConfig } from './src/config.js'
import { OfflineStore } from './src/store.js'
import { RemoteClient } from './src/remote.js'
import { createMissLogger } from './src/misses.js'
import { createHandlers } from './src/server/handler.js'
import { registerCommands } from './src/cli.js'
import { registerSetupRoutes } from './src/setupServer.js'

/**
 * TaxonPages plugin: serve the site from a local SQLite copy of its
 * TaxonWorks data.
 *
 * When `offline.enabled` is set, the site's API url is pointed at a local API
 * mounted by this plugin, which answers from the database (and, in proxy mode,
 * from the remote API for whatever the database lacks). The database is built
 * with `taxonpages offline:sync` or from the setup wizard.
 */
export default function offlinePlugin({ projectRoot, packageRoot, configuration, logger }) {
  const config = resolveOfflineConfig(configuration, projectRoot)
  let runtime = null

  function getRuntime() {
    if (runtime) return runtime

    const store = new OfflineStore(config.database, { mediaDir: config.mediaDir })
    const remote =
      config.mode === 'proxy' && config.source.url
        ? new RemoteClient({
            url: config.source.url,
            token: config.source.token,
            // Someone is waiting for the page: don't pace, retry once.
            requestsPerSecond: 50,
            retries: 1,
            timeout: 30000
          })
        : null

    runtime = {
      store,
      handlers: createHandlers({
        config,
        store,
        remote,
        logMiss: createMissLogger(config.missesFile, config.logMisses),
        logger
      })
    }

    logger.info(
      `Serving the API from ${config.database} (${config.mode} mode${config.logMisses ? ', logging misses' : ''})`
    )

    return runtime
  }

  function mount(use) {
    const { handlers } = getRuntime()
    use(API_PREFIX, handlers.api)
    use(MEDIA_PREFIX, handlers.media)
  }

  return {
    name: 'offline',

    vite() {
      if (!config.enabled) return {}

      return {
        plugins: [
          {
            name: 'taxonpages-plugin-offline',

            // Point the site at the local API. Mutated in place rather than
            // returned: returning `ssr_url: null` would be skipped by Vite's
            // config merge, and a configured ssr_url would keep server
            // renders on the remote API.
            config(viteConfig) {
              const env = viteConfig.define?.__APP_ENV__
              if (!env || typeof env !== 'object') return

              const { ssr_url, ...rest } = env
              viteConfig.define.__APP_ENV__ = { ...rest, url: API_PREFIX }
            },

            // `taxonpages dev` (no SSR) has no Express server, so the API is
            // mounted on Vite's own. In dev:ssr Vite runs in middleware mode
            // inside the Express server, and server() below mounts it there.
            configureServer(server) {
              if (server.config.server.middlewareMode) return
              mount((prefix, handler) => server.middlewares.use(prefix, handler))
            }
          }
        ]
      }
    },

    server(app) {
      if (!config.enabled) return
      mount((prefix, handler) => app.use(prefix, handler))
    },

    cli(program) {
      registerCommands(program, { config, configuration, projectRoot, packageRoot, logger })
    },

    setupServer(router, { projectRoot: root, packageRoot: pkgRoot }) {
      registerSetupRoutes(router, {
        config,
        projectRoot: root || projectRoot,
        packageRoot: pkgRoot || packageRoot
      })
    }
  }
}
