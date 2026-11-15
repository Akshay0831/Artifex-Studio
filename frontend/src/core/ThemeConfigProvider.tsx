import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ACCENT_VARIABLES,
  BORDER_RADIUS,
  loadSavedTheme,
  SPACING_MULTIPLIERS,
  SPACING_SCALES,
  ThemeConfigContext,
  type MaterialTheme
} from './ThemeConfigContext';

export function ThemeConfigProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<MaterialTheme>(loadSavedTheme);

  const globalSpacingScale = useMemo(() => SPACING_SCALES[theme.spacing], [theme.spacing]);

  useEffect(() => {
    const root = document.documentElement;
    Object.entries(SPACING_SCALES[theme.spacing]).forEach(([key, value]) => {
      root.style.setProperty(`--spacing-${key}`, value);
    });
    Object.entries(BORDER_RADIUS[theme.borderRadius]).forEach(([key, value]) => {
      root.style.setProperty(`--radius-${key}`, value);
    });

    root.style.setProperty('--studio-spacing-scale', String(SPACING_MULTIPLIERS[theme.spacing]));
    root.style.setProperty('--studio-accent', `var(${ACCENT_VARIABLES[theme.accentColor]})`);
    root.dataset.spacing = theme.spacing;
    root.dataset.borderRadius = theme.borderRadius;
    root.dataset.animations = theme.animations;

    const densityScale = {
      compact: 0.8,
      normal: 1,
      comfortable: 1.2
    };
    root.style.setProperty('--density-scale', densityScale[theme.density].toString());

    try {
      localStorage.setItem('material-theme', JSON.stringify(theme));
    } catch {
      // Appearance changes still apply for this session when storage is unavailable.
    }
  }, [theme]);

  const setThemeProperty = (updates: Partial<MaterialTheme>) => {
    setTheme(prev => ({ ...prev, ...updates }));
  };

  return (
    <ThemeConfigContext.Provider value={{
      theme,
      setTheme: setThemeProperty,
      globalSpacingScale
    }}>
      {children}
    </ThemeConfigContext.Provider>
  );
}
