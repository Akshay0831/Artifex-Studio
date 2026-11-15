import React, { Children, isValidElement, useEffect, useMemo, useState } from 'react'
import { DockSectionContext } from './DockSectionContext'

interface DockSectionStackProps {
  storageKey: string
  children: React.ReactNode
  className?: string
}

interface DockSectionState {
  order: string[]
  collapsed: Record<string, boolean>
}

interface SectionElementProps {
  id?: string
  title?: string
}

function getSectionIds(children: React.ReactNode): string[] {
  return Children.toArray(children).flatMap(child => {
    if (!isValidElement<SectionElementProps>(child)) return []
    const id = child.props.id || child.props.title
    return id ? [id] : []
  })
}

function readState(storageKey: string, sectionIds: string[]): DockSectionState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (typeof parsed === 'object' && parsed !== null) {
      const saved = parsed as Partial<DockSectionState>
      const savedOrder = Array.isArray(saved.order)
        ? saved.order.filter((id): id is string => typeof id === 'string' && sectionIds.includes(id))
        : []
      return {
        order: [...new Set([...savedOrder, ...sectionIds])],
        collapsed: saved.collapsed && typeof saved.collapsed === 'object'
          ? saved.collapsed
          : {},
      }
    }
  } catch {
    // Keep the declared section order when storage is unavailable or invalid.
  }
  return { order: sectionIds, collapsed: {} }
}

export function DockSectionStack({ storageKey, children, className }: DockSectionStackProps) {
  const sectionIds = getSectionIds(children)
  const sectionIdsKey = JSON.stringify(sectionIds)
  const [state, setState] = useState(() => readState(storageKey, sectionIds))
  const [draggedSection, setDraggedSection] = useState<string | null>(null)

  useEffect(() => {
    const currentSectionIds: string[] = JSON.parse(sectionIdsKey)
    setState(current => ({
      ...current,
      order: [...current.order.filter(id => currentSectionIds.includes(id)), ...currentSectionIds.filter(id => !current.order.includes(id))],
    }))
  }, [sectionIdsKey])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch {
      // Section layout remains available for the current session.
    }
  }, [state, storageKey])

  const context = useMemo(() => ({
    canMove: (sectionId: string) => state.order.includes(sectionId),
    collapsed: (sectionId: string) => state.collapsed[sectionId] === true,
    toggleCollapsed: (sectionId: string) => {
      setState(current => ({
        ...current,
        collapsed: { ...current.collapsed, [sectionId]: !current.collapsed[sectionId] },
      }))
    },
    move: (sectionId: string, offset: number) => {
      setState(current => {
        const order = [...current.order]
        const index = order.indexOf(sectionId)
        const nextIndex = index + offset
        if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return current
        const nextId = order[nextIndex]
        order[nextIndex] = order[index]
        order[index] = nextId
        return { ...current, order }
      })
    },
    startDragging: (sectionId: string, event: React.DragEvent<HTMLElement>) => {
      setDraggedSection(sectionId)
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', sectionId)
    },
    dropOn: (sectionId: string, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      event.stopPropagation()
      const sourceId = event.dataTransfer.getData('text/plain') || draggedSection
      setDraggedSection(null)
      if (!sourceId || sourceId === sectionId) return
      setState(current => {
        const order = current.order.filter(id => id !== sourceId)
        const targetIndex = order.indexOf(sectionId)
        if (targetIndex < 0) return current
        order.splice(targetIndex, 0, sourceId)
        return { ...current, order }
      })
    },
  }), [draggedSection, state])

  const orderedChildren = Children.toArray(children)
    .map((child, index) => {
      const id = isValidElement<SectionElementProps>(child)
        ? child.props.id || child.props.title
        : undefined
      return { child, index, order: id ? state.order.indexOf(id) : -1 }
    })
    .sort((left, right) => {
      if (left.order < 0 || right.order < 0) return left.index - right.index
      return left.order - right.order
    })

  return (
    <DockSectionContext.Provider value={context}>
      <div className={className}>{orderedChildren.map(({ child }, index) => (
        <React.Fragment key={isValidElement(child) ? child.key ?? index : index}>
          {child}
        </React.Fragment>
      ))}</div>
    </DockSectionContext.Provider>
  )
}
