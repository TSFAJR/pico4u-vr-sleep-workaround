import { useAppContext } from '../context/AppContext'

export function Logs() {
  const { logs, t, sleep, isDebug } = useAppContext()

  return (
    <div className='flex flex-col gap-3'>
      {isDebug && sleep.status && (
        <details>
          <summary>{t('sleep_debug')}</summary>
          <p>{t('sleep_progress', { seconds: sleep.status.detection.elapsed_secs, total: 0 })}</p>
          {sleep.status.detection.windows.map((w, i) => (
            <p key={i}>
              {w.seconds}s: {w.distance.toFixed(4)} m / {w.rotation.toFixed(2)}°
            </p>
          ))}
          <p>
            {t('sleep_threshold')}: {sleep.status.detection.distance_threshold.toFixed(4)} m /{' '}
            {sleep.status.detection.rotation_threshold.toFixed(2)}°
          </p>
          <p>
            {sleep.status.reason} · {sleep.status.changed_at}
          </p>
        </details>
      )}

      <div className='bg-gray-900 dark:bg-black text-gray-200 p-4 rounded-lg h-[45vh] min-h-[260px] select-text overflow-y-auto font-mono text-xs leading-relaxed border border-gray-800 dark:border-gray-800'>
        {logs.map((log, i) => (
          <div key={i} className='mb-1 break-all'>
            {log}
          </div>
        ))}
        {logs.length === 0 && <div className='text-gray-500 italic'>{t('logs_empty')}</div>}
      </div>
    </div>
  )
}
