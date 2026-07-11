import React, { useState, useCallback } from 'react'

interface CharacterOption {
  id: string
  name: string
  engine: string
  available: boolean
}

interface SerifInputProps {
  currentCharacterId: string
  characters: CharacterOption[]
  onSelectCharacter: (id: string) => void
  onAddSerif: (text: string, characterId: string) => void
}

export default function SerifInput({
  currentCharacterId,
  characters,
  onSelectCharacter,
  onAddSerif,
}: SerifInputProps) {
  const [text, setText] = useState('')

  const currentChar = characters.find(c => c.id === currentCharacterId)

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onAddSerif(trimmed, currentCharacterId)
    setText('')
  }, [text, currentCharacterId, onAddSerif])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  return (
    <div className="ymm4-serif-input">
      {/* キャラクター選択 */}
      <div style={{ position: 'relative' }}>
        <select
          className="ymm4-serif-char-btn"
          value={currentCharacterId}
          onChange={e => onSelectCharacter(e.target.value)}
          style={{ maxWidth: 160, cursor: 'pointer' }}
        >
          {characters.length === 0 && (
            <option value="">キャラクターなし</option>
          )}
          {characters.map(c => (
            <option key={c.id} value={c.id} disabled={!c.available}>
              {c.engine === 'voicevox' ? '🎤' : '🔊'} {c.name}
            </option>
          ))}
        </select>
      </div>

      {/* テキスト入力 */}
      <input
        className="ymm4-serif-input-field"
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={
          currentChar
            ? `${currentChar.name} のセリフを入力...`
            : 'セリフを入力...'
        }
      />

      {/* 追加ボタン */}
      <button className="ymm4-serif-add-btn" onClick={handleSubmit} disabled={!text.trim()}>
        追加
      </button>
    </div>
  )
}
