// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Admin from './Admin.jsx'
import { api } from '../lib/api.js'
import { todayISO } from '../lib/format.js'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn()
}))

vi.mock('../lib/api.js', () => ({
  api: vi.fn(() => Promise.resolve({}))
}))

vi.mock('../admin.css', () => ({}))
vi.mock('./AdminCoach.jsx', () => ({ default: () => <div data-testid="admin-coach" /> }))

const mounted = []

function renderAdmin() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(<Admin />))
  return { host, root }
}

describe('Admin view adherence and pain alerts', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    useStore.setState({ user: { id: 'admin1', name: 'Admin User', admin: true } })
    vi.clearAllMocks()
  })

  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    document.body.innerHTML = ''
  })

  it('renders adherence pills (Al día, En Riesgo, Inactivo) and pain alerts correctly', async () => {
    const today = todayISO()
    // Calculate past dates in UTC
    const d3Ago = new Date(Date.now() - 3 * 86400 * 1000).toISOString().slice(0, 10)
    const d5Ago = new Date(Date.now() - 5 * 86400 * 1000).toISOString().slice(0, 10)

    const mockUsers = [
      {
        id: 'u1',
        name: 'Patient Active',
        workouts: 5,
        lastWorkout: today,
        lastCardio: null,
        hasPain: false,
        lastPainArea: null,
        created: '2026-01-01',
        admin: false,
        disabled: false
      },
      {
        id: 'u2',
        name: 'Patient At Risk',
        workouts: 2,
        lastWorkout: d3Ago,
        lastCardio: null,
        hasPain: true,
        lastPainArea: 'Rodilla',
        created: '2026-01-01',
        admin: false,
        disabled: false
      },
      {
        id: 'u3',
        name: 'Patient Inactive',
        workouts: 0,
        lastWorkout: null,
        lastCardio: d5Ago,
        hasPain: false,
        lastPainArea: null,
        created: '2026-01-01',
        admin: false,
        disabled: false
      },
      {
        id: 'u4',
        name: 'Patient Cardio Rescued',
        workouts: 1,
        lastWorkout: d5Ago,
        lastCardio: today,
        hasPain: true,
        lastPainArea: 'Hombro',
        created: '2026-01-01',
        admin: false,
        disabled: false
      }
    ]

    api.mockImplementation(url => {
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({ users: mockUsers, invite_only: false })
      }
      if (url.includes('/api/admin/invites')) {
        return Promise.resolve({ invites: [] })
      }
      return Promise.resolve({})
    })

    let view
    await act(async () => {
      view = renderAdmin()
      // Allow microtasks to complete api fetch
      await new Promise(r => setTimeout(r, 50))
    })

    const text = view.host.textContent
    expect(text).toContain('Patient Active')
    expect(text).toContain('Patient At Risk')
    expect(text).toContain('Patient Inactive')
    expect(text).toContain('Patient Cardio Rescued')

    // Check adherence pills
    const pills = Array.from(view.host.querySelectorAll('.adm-pill'))
    const pillTexts = pills.map(p => ({ text: p.textContent, cls: p.className }))

    // Active patient: Al día (ok)
    expect(pillTexts.some(p => p.text === 'Al día' && p.cls.includes('ok'))).toBe(true)

    // At risk patient: En Riesgo (warn)
    expect(pillTexts.some(p => p.text === 'En Riesgo' && p.cls.includes('warn'))).toBe(true)

    // Inactive patient: Inactivo (bad)
    expect(pillTexts.some(p => p.text === 'Inactivo' && p.cls.includes('bad'))).toBe(true)

    // Cardio rescued patient: Al día (ok) because cardio was today
    const activePills = pillTexts.filter(p => p.text === 'Al día' && p.cls.includes('ok'))
    expect(activePills.length).toBe(2) // u1 and u4

    // Check pain alerts
    const painAlerts = Array.from(view.host.querySelectorAll('[aria-label="Alerta de dolor"]'))
    expect(painAlerts.length).toBe(2) // u2 and u4

    expect(painAlerts[0].getAttribute('title')).toContain('Rodilla')
    expect(painAlerts[1].getAttribute('title')).toContain('Hombro')

    // Check subtitle has cardio date
    expect(text).toContain('cardio')
  })

  it('renders adherence and pain alert pills in UserDetail sheet', async () => {
    const today = todayISO()
    const mockUserDetail = {
      user: {
        id: 'u2',
        name: 'Patient At Risk',
        workouts: 2,
        lastWorkout: '2026-09-01',
        lastCardio: today,
        hasPain: true,
        lastPainArea: 'Rodilla',
        created: '2026-01-01',
        admin: false,
        disabled: false
      },
      workouts: [],
      bodyweight: [],
      routines: [],
      lastSync: Date.now()
    }

    api.mockImplementation(url => {
      if (url.includes('/api/admin/users')) {
        return Promise.resolve({ users: [mockUserDetail.user], invite_only: false })
      }
      if (url.includes('/api/admin/user?id=')) {
        return Promise.resolve(mockUserDetail)
      }
      return Promise.resolve({})
    })

    let view
    await act(async () => {
      view = renderAdmin()
      await new Promise(r => setTimeout(r, 50))
    })

    // Click user row to open UserDetail modal
    const userRow = view.host.querySelector('.list .item')
    expect(userRow).toBeTruthy()

    await act(async () => {
      userRow.click()
    })

    const sheet = useUI.getState().sheets[0]
    expect(sheet).toBeTruthy()

    const sheetHost = document.createElement('div')
    document.body.appendChild(sheetHost)
    const sheetRoot = createRoot(sheetHost)
    mounted.push(sheetRoot)

    await act(async () => {
      sheetRoot.render(sheet.render(vi.fn()))
      await new Promise(r => setTimeout(r, 50))
    })

    const modalText = sheetHost.textContent
    expect(modalText).toContain('⚠️ Dolor: Rodilla')
    expect(modalText).toContain('last workout')
    expect(modalText).toContain('last cardio')
  })
})
