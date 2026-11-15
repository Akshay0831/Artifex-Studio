import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

interface ThemeContextType {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  isDark: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const THEME_COLORS = {
  light: {
    'studio-bg': '248 250 252',
    'studio-bg-hover': '226 232 240',
    'studio-background': '241 245 249',
    'studio-panel': '255 255 255',
    'studio-panel-bg': '255 255 255',
    'studio-panel-darker': '226 232 240',
    'studio-panel-d': '203 213 225',
    'studio-panel-border': '203 213 225',
    'studio-panel-hover': '241 245 249',
    'studio-panel-selected': '219 234 254',
    'studio-header': '248 250 252',
    'studio-card': '255 255 255',
    'studio-card-hover': '241 245 249',
    'studio-border': '203 213 225',
    'studio-border-bright': '148 163 184',
    'studio-accent-default': '37 99 235',
    'studio-accent-hover': '29 78 216',
    'studio-accent-orange': '234 88 12',
    'studio-primary': '79 70 229',
    'studio-secondary': '124 58 237',
    'studio-text': '15 23 42',
    'studio-text-dim': '71 85 105',
    'studio-text-secondary': '71 85 105',
    'studio-hover': '226 232 240',
    'studio-muted': '100 116 139',
    'studio-light': '248 250 252',
    'studio-dark': '15 23 42',
    'studio-pro': '124 58 237',
    'studio-language': '37 99 235',
    'studio-shadow': '15 23 42',
    'studio-error': '220 38 38',
    'studio-success': '5 150 105',
    'studio-warning': '217 119 6',
    'studio-info': '37 99 235',
    'studio-input-bg': '255 255 255',
    'studio-input-border': '148 163 184',
    'studio-sidebar-bg': '241 245 249',
  },
  dark: {
    'studio-bg': '15 23 42',
    'studio-bg-hover': '51 65 85',
    'studio-background': '30 41 59',
    'studio-panel': '30 41 59',
    'studio-panel-bg': '30 41 59',
    'studio-panel-darker': '15 23 42',
    'studio-panel-d': '51 65 85',
    'studio-panel-border': '51 65 85',
    'studio-panel-hover': '51 65 85',
    'studio-panel-selected': '30 58 138',
    'studio-header': '30 41 59',
    'studio-card': '30 41 59',
    'studio-card-hover': '51 65 85',
    'studio-border': '51 65 85',
    'studio-border-bright': '71 85 105',
    'studio-accent-default': '59 130 246',
    'studio-accent-hover': '96 165 250',
    'studio-accent-orange': '251 146 60',
    'studio-primary': '99 102 241',
    'studio-secondary': '139 92 246',
    'studio-text': '241 245 249',
    'studio-text-dim': '148 163 184',
    'studio-text-secondary': '203 213 225',
    'studio-hover': '51 65 85',
    'studio-muted': '148 163 184',
    'studio-light': '241 245 249',
    'studio-dark': '15 23 42',
    'studio-pro': '167 139 250',
    'studio-language': '96 165 250',
    'studio-shadow': '0 0 0',
    'studio-error': '248 113 113',
    'studio-success': '74 222 128',
    'studio-warning': '251 191 36',
    'studio-info': '96 165 250',
    'studio-input-bg': '51 65 85',
    'studio-input-border': '71 85 105',
    'studio-sidebar-bg': '15 23 42',
  },
} as const

const isThemeMode = (value: string | null): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'auto'

const getInitialTheme = (): ThemeMode => {
  try {
    const savedTheme = localStorage.getItem('theme')
    return isThemeMode(savedTheme) ? savedTheme : 'auto'
  } catch {
    return 'auto'
  }
}

const resolveDarkMode = (theme: ThemeMode) =>
  theme === 'dark' || (
    theme === 'auto' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme)
  const [isDark, setIsDark] = useState(() => resolveDarkMode(theme))

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const applyTheme = () => {
      const dark = resolveDarkMode(theme)
      const root = document.documentElement
      setIsDark(dark)
      root.classList.toggle('dark', dark)
      root.classList.toggle('light', !dark)
      root.style.colorScheme = dark ? 'dark' : 'light'
      Object.entries(THEME_COLORS[dark ? 'dark' : 'light']).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value)
      })
      try {
        localStorage.setItem('theme', theme)
      } catch {
        // Theme changes still apply for this session when storage is unavailable.
      }
    }

    applyTheme()
    if (theme !== 'auto') return
    mediaQuery.addEventListener('change', applyTheme)
    return () => mediaQuery.removeEventListener('change', applyTheme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}

export function useThemeValue(key: keyof typeof THEME_COLORS.light) {
  const { isDark } = useTheme()
  return THEME_COLORS[isDark ? 'dark' : 'light'][key]
}

export function useThemeShortcuts() {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'u') {
        event.preventDefault()
        if (event.shiftKey) {
          setTheme(theme === 'dark' ? 'light' : 'dark')
        } else {
          const themes: ThemeMode[] = ['light', 'dark', 'auto']
          setTheme(themes[(themes.indexOf(theme) + 1) % themes.length])
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [setTheme, theme])
}
