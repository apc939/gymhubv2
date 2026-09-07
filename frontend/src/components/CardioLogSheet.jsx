import { useState, useRef } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { todayISO } from '../lib/format.js'
import { useSheetKeyboard } from '../lib/use-sheet-keyboard.js'
import Icon from './Icon.jsx'
import { Button } from './ui.jsx'

const COMMON_TYPES = ['Caminata', 'Bicicleta', 'Elíptica', 'Natación', 'Trote Suave']

export default function CardioLogSheet({ close, prescription }) {
  const update = useStore(s => s.update)
  const toast = useUI(s => s.toast)
  const sheetRef = useRef(null)
  const onFocus = useSheetKeyboard(sheetRef)

  const defaultType = prescription?.type || 'Caminata'
  const defaultMinutes = Number(prescription?.targetMinutes) || 30

  const [type, setType] = useState(defaultType)
  const [customType, setCustomType] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [minutes, setMinutes] = useState(defaultMinutes)
  const [effort, setEffort] = useState('good') // 'easy' | 'good' | 'hard'

  const typesList = COMMON_TYPES.includes(defaultType) ? COMMON_TYPES : [defaultType, ...COMMON_TYPES]

  const handleSave = () => {
    if (isCustom && !customType.trim()) {
      toast('Por favor, indica el nombre de la actividad')
      return
    }

    const parsedMin = Math.round(Number(minutes))
    if (!Number.isFinite(parsedMin) || parsedMin <= 0) {
      toast('Por favor, ingresa una duración válida en minutos')
      return
    }

    const activeType = isCustom && customType.trim() ? customType.trim() : type
    const minNum = Math.min(360, parsedMin)
    const log = {
      id: 'c_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      type: activeType,
      minutes: minNum,
      effort,
      date: todayISO(),
      ts: Date.now()
    }

    update(s => {
      s.cardioLogs = s.cardioLogs || []
      s.cardioLogs.push(log)
    })

    toast(`¡Excelente trabajo! ${minNum} min de ${activeType} registrados.`)
    close?.()
  }

  return (
    <div ref={sheetRef} onFocus={onFocus} style={{ textAlign: 'left', padding: '6px 0' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Registrar Cardio Realizado</h3>
          <div className="dim small" style={{ marginTop: 2 }}>
            Reporte rápido de tu sesión aeróbica
          </div>
        </div>
        {close && (
          <button
            type="button"
            className="iconbtn"
            onClick={close}
            aria-label="Cerrar"
            style={{ width: 32, height: 32 }}
          >
            <Icon name="xmark" />
          </button>
        )}
      </div>

      {/* Tipo de actividad */}
      <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
        Actividad Realizada:
      </label>
      <div className="chips" style={{ marginBottom: 12 }}>
        {typesList.map(t => (
          <button
            key={t}
            type="button"
            className={'chip' + (!isCustom && type.toLowerCase() === t.toLowerCase() ? ' on' : '')}
            onClick={() => { setType(t); setIsCustom(false) }}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          className={'chip' + (isCustom ? ' on' : '')}
          onClick={() => setIsCustom(true)}
        >
          Otro...
        </button>
      </div>

      {isCustom && (
        <div style={{ marginBottom: 14 }}>
          <input
            type="text"
            className="input"
            placeholder="Nombre de la actividad (ej. Remo, Senderismo)"
            value={customType}
            onChange={e => setCustomType(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
          />
        </div>
      )}

      {/* Duración en minutos */}
      <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
        Tiempo completado (minutos):
      </label>
      <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 18 }}>
        <button
          type="button"
          className="btn"
          style={{ width: 44, height: 44, fontSize: 18, fontWeight: 700 }}
          onClick={() => setMinutes(m => Math.max(1, (Number(m) || 30) - 5))}
        >
          -5
        </button>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type="number"
            className="input"
            value={minutes}
            min={1}
            max={300}
            onChange={e => setMinutes(e.target.value)}
            style={{ textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: '.04em' }}
          />
          <span className="dim small" style={{ position: 'absolute', right: 14, top: 14 }}>min</span>
        </div>
        <button
          type="button"
          className="btn"
          style={{ width: 44, height: 44, fontSize: 18, fontWeight: 700 }}
          onClick={() => setMinutes(m => Math.min(300, (Number(m) || 30) + 5))}
        >
          +5
        </button>
      </div>

      {/* Sensación de esfuerzo */}
      <label className="small muted" style={{ display: 'block', marginBottom: 6, fontWeight: 600 }}>
        ¿Cómo sentiste el esfuerzo?
      </label>
      <div className="row" style={{ gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          className={'btn' + (effort === 'easy' ? ' on' : '')}
          data-effort="easy"
          style={{
            flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
            border: effort === 'easy' ? '2px solid var(--green)' : '1px solid var(--sep)',
            background: effort === 'easy' ? 'color-mix(in srgb, var(--green) 14%, transparent)' : 'var(--surface-2)'
          }}
          onClick={() => setEffort('easy')}
        >
          <div style={{ fontSize: 18, marginBottom: 2 }}>😊</div>
          Fácil / Ligero
        </button>
        <button
          type="button"
          className={'btn' + (effort === 'good' ? ' on' : '')}
          data-effort="good"
          style={{
            flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
            border: effort === 'good' ? '2px solid var(--acc)' : '1px solid var(--sep)',
            background: effort === 'good' ? 'color-mix(in srgb, var(--acc) 14%, transparent)' : 'var(--surface-2)'
          }}
          onClick={() => setEffort('good')}
        >
          <div style={{ fontSize: 18, marginBottom: 2 }}>👍</div>
          Adecuado / Bien
        </button>
        <button
          type="button"
          className={'btn' + (effort === 'hard' ? ' on' : '')}
          data-effort="hard"
          style={{
            flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: 600,
            border: effort === 'hard' ? '2px solid var(--orange)' : '1px solid var(--sep)',
            background: effort === 'hard' ? 'color-mix(in srgb, var(--orange) 14%, transparent)' : 'var(--surface-2)'
          }}
          onClick={() => setEffort('hard')}
        >
          <div style={{ fontSize: 18, marginBottom: 2 }}>🥵</div>
          Muy exigente
        </button>
      </div>

      <Button
        variant="primary"
        onClick={handleSave}
        style={{ width: '100%', height: 48, fontSize: 16 }}
      >
        Guardar Registro
      </Button>
    </div>
  )
}

export function cardioLogSheet(prescription) {
  return useUI.getState().openSheet(close => <CardioLogSheet close={close} prescription={prescription} />)
}
