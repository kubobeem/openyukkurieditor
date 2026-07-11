import React, { useState, useCallback, useEffect, useRef } from 'react'

export interface MenuAction {
  label: string
  shortcut?: string
  disabled?: boolean
  action?: () => void
}

export interface MenuGroup {
  label: string
  items: (MenuAction | 'separator')[]
}

interface MenuBarProps {
  groups: MenuGroup[]
  brand?: string
}

export default function MenuBar({ groups, brand }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleClose = useCallback(() => setOpenMenu(null), [])

  useEffect(() => {
    if (openMenu === null) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openMenu, handleClose])

  return (
    <div className="ymm4-menubar" ref={menuRef}>
      {brand && <span className="ymm4-menubar-brand">{brand}</span>}
      {groups.map((group, gi) => (
        <div
          key={gi}
          className={`ymm4-menubar-item ${openMenu === gi ? 'open' : ''}`}
          onMouseDown={() => setOpenMenu(openMenu === gi ? null : gi)}
          onMouseEnter={() => openMenu !== null && setOpenMenu(gi)}
        >
          {group.label}
          {openMenu === gi && (
            <div className="ymm4-dropdown" onMouseDown={e => e.stopPropagation()}>
              {group.items.map((item, ii) => {
                if (item === 'separator') {
                  return <div key={`s-${ii}`} className="ymm4-dropdown-separator" />
                }
                return (
                  <div
                    key={ii}
                    className={`ymm4-dropdown-item ${item.disabled ? 'disabled' : ''}`}
                    onClick={() => {
                      if (!item.disabled) {
                        item.action?.()
                        handleClose()
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
