import { createContext, type DragEvent } from 'react'

export interface DockSectionContextValue {
  canMove: (sectionId: string) => boolean
  collapsed: (sectionId: string) => boolean
  toggleCollapsed: (sectionId: string) => void
  move: (sectionId: string, offset: number) => void
  startDragging: (sectionId: string, event: DragEvent<HTMLElement>) => void
  dropOn: (sectionId: string, event: DragEvent<HTMLElement>) => void
}

export const DockSectionContext = createContext<DockSectionContextValue | null>(null)
