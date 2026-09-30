import { rmSync } from 'node:fs'
import { OfflineStore } from './store.js'
import { RemoteClient } from './remote.js'
import { readMisses } from './misses.js'
import { describePacing, describeScope, syncScope } from './config.js'

/**
 * Commands:
 *
 *   taxonpages offline:sync [--root <id...>] [--fresh] [--missing] [--json]
 *   taxonpages offline:status
 *   taxonpages offline:misses [--clear]
 *   taxonpages offline:images
 *   taxonpages offline:prune
 */
export function registerCommands(program, { config, configuration, projectRoot, packageRoot, logger }) {
  program
    .command('offline:sync')
    .description('Build or update the local database from the TaxonWorks API')
    .option('--root <ids...>', 'OTU ids to sync the subtrees of (default: offline.roots)')
    .option('--area <ids...>', 'geographic area ids to sync the OTUs recorded in (default: offline.geographic_areas)')
    .option('--fresh', 'start a new run instead of resuming an interrupted one')
    .option('--missing', 'fetch only what the database does not hold yet (to add datasets)')
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
        ...config.sync.api,
        retries: config.sync.retries
      })

      // Paced apart: media are most of the requests, and would otherwise use
      // the API's budget.
      const mediaRemote = new RemoteClient({
        url: config.source.url,
        token: config.source.token,
        ...config.sync.media,
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
      log(`Pacing: ${describePacing(config.sync)}`)

      try {
        const result = await runSync({
          config: runConfig,
          store,
          remote,
          mediaRemote,
          configuration,
          packageRoot,
          projectRoot,
          fresh: Boolean(options.fresh),
          missing: Boolean(options.missing),
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
          log(`${result.phase === 'completed' ? 'Completed' : 'Stopped'} in ${formatDuration(result.elapsed)}`)
          const { files, bytesBefore, bytesAfter } = result.converted
          if (files) {
            const saved = Math.round((1 - bytesAfter / bytesBefore) * 100)
            log(`Images converted: ${files}, ${formatBytes(bytesBefore)} → ${formatBytes(bytesAfter)} (${saved}% smaller)`)
          }
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
    .action(async () => {
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
        if (run.elapsedMs) console.log(`Took:         ${formatDuration(run.elapsedMs)}${run.completedAt ? '' : ' so far'}`)
        console.log(`Scope:        ${describeScope(run.scope)}`)
      }

      printStats(store.stats())

      const { loadSiteDatasets } = await import('./sync/sync.js')
      const datasets = await loadSiteDatasets({ config, configuration, packageRoot, projectRoot, logger })
      printDatasets(datasets, store.datasetSizes())

      store.close()
    })

  program
    .command('offline:images')
    .description('Convert the images already downloaded, as offline.images says')
    .action(async () => {
      const { convertStoredImages } = await import('./convertImages.js')
      const { describeConversion } = await import('./images.js')

      const store = OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })
      if (!store) {
        console.log('No database yet. Run `taxonpages offline:sync`.')
        return
      }

      try {
        console.log(`Converting ${config.images.fields.join(', ')} images: ${describeConversion(config.images)}`)

        const { total, converted, bytesBefore, bytesAfter } = await convertStoredImages({
          store,
          config,
          concurrency: config.sync.parallelDownloads,
          logger,
          onProgress: ({ done, total }) => process.stdout.write(`\r${done} of ${total} images`)
        })

        process.stdout.write('\n')
        const saved = bytesBefore ? ` · ${formatBytes(bytesBefore)} → ${formatBytes(bytesAfter)} (${Math.round((1 - bytesAfter / bytesBefore) * 100)}% smaller)` : ''
        console.log(`${converted} converted, ${total - converted} already as configured${saved}`)
      } catch (err) {
        logger.error(err.message)
        process.exitCode = 1
      } finally {
        store.close()
      }
    })

  program
    .command('offline:prune')
    .description('Delete what the database holds for datasets left out in offline.include')
    .action(async () => {
      const store = OfflineStore.openExisting(config.database, { mediaDir: config.mediaDir })
      if (!store) {
        console.log('No database yet. Run `taxonpages offline:sync`.')
        return
      }

      try {
        const { loadSiteDatasets } = await import('./sync/sync.js')
        const { pruneDatasets } = await import('./prune.js')
        const datasets = await loadSiteDatasets({ config, configuration, packageRoot, projectRoot, logger })
        const before = store.stats().databaseBytes

        const result = pruneDatasets({ store, datasets })

        if (!result.datasets.length) {
          console.log('Every dataset is included: nothing to delete.')
          return
        }

        console.log(`Left out:     ${result.datasets.join(', ')}`)
        console.log(`Deleted:      ${result.responses} responses, ${result.media} media (${result.files} files), ${result.blobs} shared pieces`)
        if (result.tables.length) console.log(`Emptied:      ${result.tables.join(', ')}`)
        console.log(`Database:     ${formatBytes(before)} → ${formatBytes(store.stats().databaseBytes)}`)
      } catch (err) {
        logger.error(err.message)
        process.exitCode = 1
      } finally {
        store.close()
      }
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

      for (const { key, count, resolved, reason } of misses) {
        console.log(`${String(count).padStart(5)}  ${resolved === 'proxy' ? 'proxied' : 'missing'}  ${key}`)
        if (reason) console.log(`${' '.repeat(16)}${reason}`)
      }
    })
}

function formatProgress(p) {
  const total = p.queued ? ` of ${p.queued}` : ''
  const pending = p.mediaPending ? ` (${p.mediaPending} to go)` : ''
  return `[${p.phase}] OTUs ${p.done + p.skipped}${total} (${p.failed} failed) · ${p.requests} requests · ${p.media} media${pending} · ${formatDuration(p.elapsed)}`
}

function printDatasets(datasets, sizes) {
  console.log('Datasets:')
  for (const { id, included } of datasets.list) {
    const size = sizes[id]
    const held = size ? `${size.items} items, ${formatBytes(size.bytes)}` : 'nothing stored'
    console.log(`  ${included ? '✓' : '·'} ${id.padEnd(28)} ${held}`)
  }
}

function printStats(stats) {
  console.log(`OTUs synced:  ${stats.syncedOtus} (${stats.failedOtus} failed)`)
  console.log(`Responses:    ${stats.responses} (${stats.blobs} shared pieces)`)
  console.log(`Search:       ${stats.otus} OTUs, ${stats.sources} sources, ${stats.news} news`)
  console.log(`Media:        ${stats.media} files, ${formatBytes(stats.mediaBytes)}`)
  console.log(`Database:     ${formatBytes(stats.databaseBytes)}`)
}

/** 2h 03m 09s, 3m 09s, 9s */
export function formatDuration(ms = 0) {
  const total = Math.round(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n) => String(n).padStart(2, '0')

  if (h) return `${h}h ${pad(m)}m ${pad(s)}s`
  if (m) return `${m}m ${pad(s)}s`
  return `${s}s`
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
