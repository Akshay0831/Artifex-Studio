import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme, useThemeShortcuts, type ThemeMode } from '../../core/ThemeContext'
import { Button } from './Button'

const themes: { id: ThemeMode; icon: typeof Sun; label: string }[] = [
  { id: 'light', icon: Sun, label: 'Light' },
  { id: 'dark', icon: Moon, label: 'Dark' },
  { id: 'auto', icon: Monitor, label: 'Auto' },
]

export function ThemeToggle() {
  const { theme, setTheme, isDark } = useTheme()
  useThemeShortcuts()

  const currentIndex = themes.findIndex(item => item.id === theme)
  const currentTheme = themes[currentIndex] || themes[0]
  const CurrentIcon = currentTheme.icon

  return (
    <div className="flex w-full min-w-0 justify-center">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(themes[(currentIndex + 1) % themes.length].id)}
        aria-label={`Switch theme. Current theme: ${currentTheme.label}`}
        title={`Current theme: ${currentTheme.label}. Click to switch.`}
        className="transition-colors hover:bg-studio-hover"
      >
        <CurrentIcon size={18} className={isDark ? 'text-yellow-400' : 'text-blue-600'} />
      </Button>

    </div>
  )
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme()
  return (
    <label className="flex items-center gap-2 text-sm text-studio-text">
      Theme
      <select
        value={theme}
        onChange={event => setTheme(event.target.value as ThemeMode)}
        className="min-w-0 rounded border border-studio-border bg-studio-panel px-2 py-1 text-studio-text"
      >
        {themes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </label>
  )
}

export function ThemeInfo() {
  const { theme, isDark } = useTheme()
  return (
    <div className="text-xs text-studio-text-dim p-3 bg-studio-card rounded-lg border border-studio-border">
      <div className="font-medium text-studio-text mb-1">Theme Information</div>
      <div className="space-y-1">
        <div>Current: <span className="text-studio-accent font-medium">{theme}</span></div>
        <div>Resolved: <span className="text-studio-accent font-medium">{isDark ? 'Dark' : 'Light'}</span></div>
      </div>
    </div>
  )
}
