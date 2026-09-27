import { rmSync } from 'node:fs'
import { OfflineStore } from './store.js'
import { RemoteClient } from './remote.js'
import { readMisses } from './misses.js'
import { describeScope, syncScope } from './config.js'

/**
 * Commands:
 *
 *   taxonpages offline:sync [--root <id...>] [--fresh] [--json]
 *   taxonpages offline:status
 *   taxonpages offline:misses [--clear]
 */
export function registerCommands(program, { config, configuration, projectRoot, packageRoot, logger }) {
  program
    .command('offline:sync')
    .description('Build or update the local database from the TaxonWorks API')
    .option('--root <ids...>', 'OTU ids to sync the subtrees of (default: offline.roots)')
    .option('--area <ids...>', 'geographic area ids to sync the OTUs recorded in (default: offline.geographic_areas)')
    .option('--fresh', 'start a new run instead of resuming an interrupted one')
    .option('--json', 'print progress as JSON lines (used by the setup wizard)')
    .action(async (options) => {
      const { runSync } = await import('./sync/sync.js')

      const ids = (list) => list.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      const runConfig = {
        ...config,
        roots: options.root ? ids(options.root) : config.roots,
        geographicAreas: options.area ? ids(options.area) : config.geographicAreas
      }

      const remote = new RemoteClient({
        url: config.source.url,
        token: config.source.token,
        requestsPerSecond: config.sync.requestsPerSecond,
        retries: config.sync.retries
      })

      const store = new OfflineStore(config.database, { mediaDir: config.mediaDir })
      const controller = new AbortController()

      // With --json, stdout carries only progress lines; messages go to stderr.
      const log = (...args) => (options.json ? console.error(...args) : logger.info(...args))
      const syncLogger = { info: log, warn: log, error: log }

      // First Ctrl+C: finish the requests in flight and stop, so the run can
      // be resumed. Second: quit now.
      const onSignal = () => {
        if (controller.signal.aborted) process.exit(130)
        controller.abort()
        log('Stopping after the requests in flight… (Ctrl+C again to quit now)')
      }
      process.on('SIGINT', onSignal)
      process.on('SIGTERM', onSignal)

      log(`Syncing ${describeScope(syncScope(runConfig))} from ${config.source.url} into ${config.database}`)

      try {
        const result = await runSync({
          config: runConfig,
          store,
          remote,
          configuration,
          packageRoot,
          projectRoot,
          fresh: Boolean(options.fresh),
          signal: controller.signal,
          logger: syncLogger,
          onProgress: (progress) => {
            if (options.json) {
              process.stdout.write(JSON.stringify({ type: 'progress', ...progress }) + '\n')
            } else {
              process.stdout.write(`\r${formatProgress(progress)}   `)
            }
          }
        })

        if (options.json) {
          process.stdout.write(JSON.stringify({ type: 'done', ...result, stats: store.stats() }) + '\n')
        } else {
          process.stdout.write(`\r${formatProgress(result)}\n`)
          printStats(store.stats())
        }

        if (result.failed) process.exitCode = 1
      } catch (err) {
        if (options.json) {
          process.stdout.write(JSON.stringify({ type: 'error', message: err.message }) + '\n')
        }
        logger.error(err.message)
        process.exitCode = 1
      } finally {
        store.close()
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
      }
    })

  program
    .command('offline:status')
    .description('Show what the local database holds')
    .action(() => {
      const store = OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })

      console.log(`Offline mode: ${config.enabled ? 'enabled' : 'disabled'} (${config.mode})`)
      console.log(`Database:     ${config.database}`)

      if (!store) {
        console.log('No database yet. Run `taxonpages offline:sync`.')
        return
      }

      const run = store.getMeta('sync.run')
      if (run) {
        console.log(`Last run:     #${run.id}, started ${run.startedAt}, ${run.completedAt ? `completed ${run.completedAt}` : 'not completed'}`)
        console.log(`Scope:        ${describeScope(run.scope)}`)
      }

      printStats(store.stats())
      store.close()
    })

  program
    .command('offline:misses')
    .description('List requests the local database could not answer')
    .option('--clear', 'empty the miss log')
    .action((options) => {
      if (options.clear) {
        rmSync(config.missesFile, { force: true })
        console.log('Miss log cleared.')
        return
      }

      const misses = readMisses(config.missesFile)
      if (!misses.length) {
        console.log(config.logMisses ? 'No misses recorded.' : 'No misses recorded (offline.log_misses is off).')
        return
      }

      for (const { key, count, resolved } of misses) {
        console.log(`${String(count).padStart(5)}  ${resolved === 'proxy' ? 'proxied' : 'missing'}  ${key}`)
      }
    })
}

function formatProgress(p) {
  const total = p.queued ? ` of ${p.queued}` : ''
  return `[${p.phase}] OTUs ${p.done + p.skipped}${total} (${p.failed} failed) · ${p.requests} requests · ${p.media} media`
}

function printStats(stats) {
  console.log(`OTUs synced:  ${stats.syncedOtus} (${stats.failedOtus} failed)`)
  console.log(`Responses:    ${stats.responses} (${stats.blobs} shared pieces)`)
  console.log(`Search:       ${stats.otus} OTUs, ${stats.sources} sources, ${stats.news} news`)
  console.log(`Media:        ${stats.media} files, ${formatBytes(stats.mediaBytes)}`)
  console.log(`Database:     ${formatBytes(stats.databaseBytes)}`)
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit ? 1 : 0)} ${units[unit]}`
}
