import { useRef } from 'react'

interface ResizableDividerProps {
  label: string
  size: number
  minSize: number
  maxSize: number
  side: 'left' | 'right'
  onResize: (size: number) => void
}

export function ResizableDivider({
  label,
  size,
  minSize,
  maxSize,
  side,
  onResize,
}: ResizableDividerProps) {
  const dragStart = useRef<{ pointerX: number; size: number } | null>(null)

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      aria-valuenow={size}
      tabIndex={0}
      className={`group pointer-events-auto absolute top-0 z-30 flex h-full w-2 touch-none cursor-col-resize items-center justify-center outline-none ${
        side === 'right' ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
      }`}
      onPointerDown={event => {
        event.preventDefault()
        dragStart.current = { pointerX: event.clientX, size }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={event => {
        if (!dragStart.current) return
        const direction = side === 'right' ? 1 : -1
        onResize(dragStart.current.size + (event.clientX - dragStart.current.pointerX) * direction)
      }}
      onPointerUp={event => {
        dragStart.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={() => {
        dragStart.current = null
      }}
      onKeyDown={event => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault()
          const change = event.key === 'ArrowRight' ? 8 : -8
          onResize(size + change * (side === 'right' ? 1 : -1))
        } else if (event.key === 'Home') {
          event.preventDefault()
          onResize(minSize)
        } else if (event.key === 'End') {
          event.preventDefault()
          onResize(maxSize)
        }
      }}
    >
      <span className="h-10 w-0.5 rounded-full bg-studio-border-bright opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100" />
    </div>
  )
}
