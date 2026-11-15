import { useEffect, useState, type ReactNode } from 'react';
import {
  getInitialTheme,
  resolveDarkMode,
  ThemeContext,
  THEME_COLORS,
  type ThemeMode
} from './ThemeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [isDark, setIsDark] = useState(() => resolveDarkMode(theme));

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const dark = resolveDarkMode(theme);
      const root = document.documentElement;
      setIsDark(dark);
      root.classList.toggle('dark', dark);
      root.classList.toggle('light', !dark);
      root.style.colorScheme = dark ? 'dark' : 'light';
      Object.entries(THEME_COLORS[dark ? 'dark' : 'light']).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
      try {
        localStorage.setItem('theme', theme);
      } catch {
        // Theme changes still apply for this session when storage is unavailable.
      }
    };

    applyTheme();
    if (theme !== 'auto') return;
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}
