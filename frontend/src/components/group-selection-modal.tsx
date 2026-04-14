'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, X, Check, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MagneticButton } from '@/components/effects/magnetic-button'
import { cn } from '@/lib/utils'

interface Group {
  id: string
  name: string
  memberCount?: number
}

interface GroupSelectionModalProps {
  open: boolean
  onClose: () => void
  onConfirm: (selectedIds: string[]) => void
  selectedIds: string[]
  groups: Group[]
}

export function GroupSelectionModal({
  open,
  onClose,
  onConfirm,
  selectedIds,
  groups,
}: GroupSelectionModalProps) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds))
  const [animateIn, setAnimateIn] = useState(false)

  useEffect(() => {
    setSelected(new Set(selectedIds))
  }, [selectedIds])

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setAnimateIn(true))
    } else {
      setAnimateIn(false)
    }
  }, [open])

  const filteredGroups = useMemo(
    () =>
      groups.filter((g) =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.id.toLowerCase().includes(search.toLowerCase())
      ),
    [groups, search]
  )

  const allFilteredSelected = filteredGroups.length > 0 && filteredGroups.every((g) => selected.has(g.id))

  function toggleGroup(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        filteredGroups.forEach((g) => next.delete(g.id))
      } else {
        filteredGroups.forEach((g) => next.add(g.id))
      }
      return next
    })
  }

  function handleConfirm() {
    onConfirm(Array.from(selected))
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      dir="rtl"
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'backdrop-blur-xl bg-black/50',
        'transition-opacity duration-300',
        animateIn ? 'opacity-100' : 'opacity-0'
      )}
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          'relative w-full max-w-lg mx-4',
          'bg-white/10 backdrop-blur-2xl',
          'border border-white/20 rounded-2xl shadow-2xl',
          'flex flex-col max-h-[80vh]',
          'transition-all duration-300 ease-out',
          animateIn
            ? 'scale-100 opacity-100 translate-y-0'
            : 'scale-95 opacity-0 translate-y-4'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/30 to-blue-500/30 border border-white/10">
              <Users className="w-5 h-5 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">בחירת קבוצות יעד</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/60 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Search */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חפש קבוצה..."
              className={cn(
                'pr-10 bg-white/5 border-white/10 text-white placeholder:text-white/30',
                'rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20',
                'transition-colors'
              )}
            />
          </div>
        </div>

        {/* Select All */}
        <div className="px-6 pt-3 pb-2">
          <button
            onClick={toggleAll}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-xl',
              'text-white/80 hover:bg-white/5 transition-colors text-sm font-medium'
            )}
          >
            <div
              className={cn(
                'flex items-center justify-center w-5 h-5 rounded-md border transition-all duration-200',
                allFilteredSelected
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 border-transparent'
                  : 'border-white/30 bg-white/5'
              )}
            >
              {allFilteredSelected && <Check className="w-3.5 h-3.5 text-white" />}
            </div>
            <span>בחר הכל</span>
            <Badge
              variant="secondary"
              className="mr-auto bg-white/10 text-white/60 border-white/10 text-xs"
            >
              {filteredGroups.length} קבוצות
            </Badge>
          </button>
        </div>

        {/* Group List */}
        <div className="flex-1 overflow-y-auto px-6 pb-2 min-h-0">
          <div className="space-y-1">
            {filteredGroups.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 text-white/30">
                <Users className="w-10 h-10 mb-3" />
                <p className="text-sm">לא נמצאו קבוצות</p>
              </div>
            )}
            {filteredGroups.map((group) => {
              const isSelected = selected.has(group.id)
              return (
                <button
                  key={group.id}
                  onClick={() => toggleGroup(group.id)}
                  className={cn(
                    'flex items-center gap-3 w-full px-3 py-2.5 rounded-xl transition-all duration-200',
                    isSelected
                      ? 'bg-purple-500/10 border border-purple-500/20'
                      : 'hover:bg-white/5 border border-transparent'
                  )}
                >
                  <div
                    className={cn(
                      'flex items-center justify-center w-5 h-5 rounded-md border transition-all duration-200 shrink-0',
                      isSelected
                        ? 'bg-gradient-to-br from-purple-500 to-blue-500 border-transparent'
                        : 'border-white/30 bg-white/5'
                    )}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                  </div>
                  <div className="flex flex-col items-start min-w-0">
                    <span className="text-sm font-medium text-white truncate max-w-full">
                      {group.name}
                    </span>
                    <span className="text-xs text-white/30 truncate max-w-full">
                      {group.id}
                    </span>
                  </div>
                  {group.memberCount !== undefined && (
                    <Badge
                      variant="secondary"
                      className="mr-auto bg-white/5 text-white/40 border-white/10 text-xs shrink-0"
                    >
                      {group.memberCount} חברים
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 p-6 pt-4 border-t border-white/10 bg-white/5 backdrop-blur-xl rounded-b-2xl">
          <div className="flex items-center justify-between">
            <Badge
              variant="secondary"
              className={cn(
                'bg-gradient-to-r from-purple-500/20 to-blue-500/20',
                'text-white border-white/10 px-3 py-1 text-sm'
              )}
            >
              נבחרו {selected.size} קבוצות
            </Badge>
            <MagneticButton>
              <button
                onClick={handleConfirm}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl hover:from-purple-500 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-purple-500/25"
              >
                <Check className="w-4 h-4" />
                סיום
              </button>
            </MagneticButton>
          </div>
        </div>
      </div>
    </div>
  )
}
