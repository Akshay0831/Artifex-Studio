import { useCallback, useEffect, useState } from 'react'

export function usePersistentPanelWidth(
  storageKey: string,
  initialWidth: number,
  minWidth: number,
  maxWidth: number,
) {
  const [width, setWidth] = useState(() => {
    try {
      const savedWidth = Number(localStorage.getItem(storageKey))
      if (Number.isFinite(savedWidth) && savedWidth > 0) {
        return Math.min(maxWidth, Math.max(minWidth, savedWidth))
      }
    } catch {
      // Use the default panel width when browser storage is unavailable.
    }
    return Math.min(maxWidth, Math.max(minWidth, initialWidth))
  })

  const resize = useCallback((nextWidth: number) => {
    setWidth(Math.min(maxWidth, Math.max(minWidth, Math.round(nextWidth))))
  }, [maxWidth, minWidth])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width))
    } catch {
      // Resizing still works for the current session when storage is unavailable.
    }
  }, [storageKey, width])

  return [width, resize] as const
}
