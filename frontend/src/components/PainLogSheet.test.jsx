// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PainLogSheet from './PainLogSheet.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const clone = o => JSON.parse(JSON.stringify(o))
const mounted = []

function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function renderPain(props = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<PainLogSheet {...props} />))
  return { host, root }
}

describe('PainLogSheet component', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({ S: clone(DEF), user: null })
    useUI.setState({ sheets: [], toastMsg: '' })
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    document.body.innerHTML = ''
  })

  it('renders with "Cero Dolor" option and saves pain-free daily report', () => {
    const close = vi.fn()
    const { host } = renderPain({ close })

    expect(host.textContent).toContain('Reporte Diario de Dolor y Molestias')
    expect(host.textContent).toContain('Cero Dolor')
    expect(host.textContent).toContain('Sin molestias reportadas')

    const buttons = [...host.querySelectorAll('button')]
    const saveBtn = buttons.find(b => b.textContent.includes('Guardar Reporte'))

    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.painLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].pain).toBe(false)
    expect(logs[0].level).toBe(0)
    expect(logs[0].area).toBeNull()
    expect(logs[0].date).toBeDefined()
    expect(logs[0].id).toMatch(/^p_/)
    expect(close).toHaveBeenCalledTimes(1)
    expect(useUI.getState().toastMsg).toContain('Cero Dolor')
  })

  it('allows reporting pain with anatomical zone and intensity', () => {
    const close = vi.fn()
    const { host } = renderPain({ close })

    const buttons = [...host.querySelectorAll('button')]
    const painToggle = buttons.find(b => b.textContent.includes('Molestia o Dolor'))
    expect(painToggle).toBeDefined()

    // Switch to pain mode
    act(() => { painToggle.click() })

    expect(host.textContent).toContain('Zona anatómica de la molestia')
    expect(host.textContent).toContain('Intensidad de la molestia')

    // Choose 'Hombro' zone chip
    const chips = [...host.querySelectorAll('.chip')]
    const hombroChip = chips.find(c => c.textContent.trim() === 'Hombro')
    expect(hombroChip).toBeDefined()
    act(() => { hombroChip.click() })

    // Choose 'Moderada' intensity
    const intensityBtns = [...host.querySelectorAll('button')]
    const modBtn = intensityBtns.find(b => b.textContent.includes('Moderada'))
    expect(modBtn).toBeDefined()
    act(() => { modBtn.click() })

    // Enter note
    const input = host.querySelector('input[placeholder*="Apareció"]')
    expect(input).toBeDefined()
    act(() => {
      type(input, 'Molestia al levantar peso')
    })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Reporte'))
    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.painLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].pain).toBe(true)
    expect(logs[0].area).toBe('Hombro')
    expect(logs[0].level).toBe('moderada')
    expect(logs[0].notes).toBe('Molestia al levantar peso')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('allows entering custom zone via "Otra zona..."', () => {
    const close = vi.fn()
    const { host } = renderPain({ close })

    const buttons = [...host.querySelectorAll('button')]
    const painToggle = buttons.find(b => b.textContent.includes('Molestia o Dolor'))
    act(() => { painToggle.click() })

    const chips = [...host.querySelectorAll('.chip')]
    const otherChip = chips.find(c => c.textContent.includes('Otra zona...'))
    expect(otherChip).toBeDefined()
    act(() => { otherChip.click() })

    const customInput = host.querySelector('input[placeholder*="Especifica"]')
    expect(customInput).not.toBeNull()
    act(() => {
      type(customInput, 'Tendón de Aquiles derecho')
    })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Reporte'))
    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.painLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].pain).toBe(true)
    expect(logs[0].area).toBe('Tendón de Aquiles derecho')
  })

  it('rejects saving when "Otra zona..." is selected but custom zone is empty', () => {
    const close = vi.fn()
    const { host } = renderPain({ close })

    const buttons = [...host.querySelectorAll('button')]
    const painToggle = buttons.find(b => b.textContent.includes('Molestia o Dolor'))
    act(() => { painToggle.click() })

    const chips = [...host.querySelectorAll('.chip')]
    const otherChip = chips.find(c => c.textContent.includes('Otra zona...'))
    act(() => { otherChip.click() })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Reporte'))
    act(() => { saveBtn.click() })

    // MUST NOT save and MUST NOT attribute pain to Rodilla!
    expect(useStore.getState().S.painLogs).toHaveLength(0)
    expect(close).not.toHaveBeenCalled()
    expect(useUI.getState().toastMsg).toContain('indica la zona')
  })

  it('clears notes and area when toggled back to Cero Dolor', () => {
    const close = vi.fn()
    const { host } = renderPain({ close })

    const buttons = [...host.querySelectorAll('button')]
    const painToggle = buttons.find(b => b.textContent.includes('Molestia o Dolor'))
    const zeroPainToggle = buttons.find(b => b.textContent.includes('Cero Dolor'))

    // Switch to pain, enter note
    act(() => { painToggle.click() })
    const noteInput = host.querySelector('input[placeholder*="Apareció"]')
    act(() => { type(noteInput, 'Dolor que luego se calmó') })

    // Switch back to Cero Dolor
    act(() => { zeroPainToggle.click() })

    const saveBtn = [...host.querySelectorAll('button')].find(b => b.textContent.includes('Guardar Reporte'))
    act(() => { saveBtn.click() })

    const logs = useStore.getState().S.painLogs
    expect(logs).toHaveLength(1)
    expect(logs[0].pain).toBe(false)
    expect(logs[0].area).toBeNull()
    expect(logs[0].notes).toBeNull()
  })
})

