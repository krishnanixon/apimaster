import type { CSSProperties } from 'react'
import type { ResizeHandle } from '../lib/canvas-transform'

const HANDLE_SIZE = 10

const HANDLE_STYLES: Record<ResizeHandle, CSSProperties> = {
  nw: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nwse-resize' },
  n: { top: -HANDLE_SIZE / 2, left: '50%', marginLeft: -HANDLE_SIZE / 2, cursor: 'ns-resize' },
  ne: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nesw-resize' },
  e: { top: '50%', right: -HANDLE_SIZE / 2, marginTop: -HANDLE_SIZE / 2, cursor: 'ew-resize' },
  se: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'nwse-resize' },
  s: { bottom: -HANDLE_SIZE / 2, left: '50%', marginLeft: -HANDLE_SIZE / 2, cursor: 'ns-resize' },
  sw: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nesw-resize' },
  w: { top: '50%', left: -HANDLE_SIZE / 2, marginTop: -HANDLE_SIZE / 2, cursor: 'ew-resize' }
}

export function SelectionHandles({ showRotate = true }: { showRotate?: boolean }) {
  return (
    <>
      {(Object.keys(HANDLE_STYLES) as ResizeHandle[]).map((handle) => (
        <span
          key={handle}
          data-resize-handle={handle}
          style={{
            position: 'absolute',
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            borderRadius: 999,
            border: '2px solid white',
            background: '#0d99ff',
            boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)',
            zIndex: 20,
            ...HANDLE_STYLES[handle]
          }}
        />
      ))}
      {showRotate ? (
        <>
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: -28,
              left: '50%',
              width: 1,
              height: 20,
              marginLeft: -0.5,
              background: '#0d99ff',
              pointerEvents: 'none'
            }}
          />
          <span
            data-rotate-handle
            title="Rotate"
            style={{
              position: 'absolute',
              top: -38,
              left: '50%',
              marginLeft: -8,
              width: 16,
              height: 16,
              borderRadius: 999,
              border: '2px solid white',
              background: '#0d99ff',
              boxShadow: '0 1px 3px rgb(0 0 0 / 0.2)',
              cursor: 'grab',
              zIndex: 21
            }}
          />
        </>
      ) : null}
    </>
  )
}
