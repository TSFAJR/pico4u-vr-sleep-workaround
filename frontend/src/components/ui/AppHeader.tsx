import { useEffect } from 'react'
import { Icon } from '@charcoal-ui/react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import packageJson from '../../../package.json'
import { useAppContext } from '../../context/AppContext'

interface AppHeaderProps {
  onOpenSettings: () => void
}

export function AppHeader({ onOpenSettings }: AppHeaderProps) {
  const { t } = useAppContext()
  const versionText = `v${packageJson.version}${import.meta.env.DEV ? '-dev' : ''}`
  const windowTitle = `${t('title')} ${versionText}`

  useEffect(() => {
    document.title = windowTitle
    try {
      void getCurrentWindow()
        .setTitle(windowTitle)
        .catch(() => {
          // Ignore when running outside Tauri webview
        })
    } catch {
      // Ignore when running outside Tauri webview
    }
  }, [windowTitle])

  return (
    <button
      type='button'
      onClick={onOpenSettings}
      aria-label={t('settings_title')}
      className='absolute top-3 right-4 z-10 p-1.5 rounded-lg text-[var(--app-text-muted)] hover:text-[var(--app-text)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer'
      title={t('settings_title')}
    >
      <Icon name='24/Settings' />
    </button>
  )
}
