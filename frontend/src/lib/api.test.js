// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { webauthnOK } from './api.js'

const originalPublicKeyCredential = window.PublicKeyCredential
const originalCredentials = navigator.credentials

function setCapability(target, property, value) {
  Object.defineProperty(target, property, { configurable: true, value })
}

afterEach(() => {
  setCapability(window, 'PublicKeyCredential', originalPublicKeyCredential)
  setCapability(navigator, 'credentials', originalCredentials)
})

describe('webauthnOK', () => {
  it('accepts WebAuthn when PublicKeyCredential is exposed', () => {
    setCapability(window, 'PublicKeyCredential', class PublicKeyCredential {})
    setCapability(navigator, 'credentials', {})
    expect(webauthnOK()).toBe(true)
  })

  it('does not reject WebAuthn when the generic credentials check is unavailable', () => {
    setCapability(window, 'PublicKeyCredential', class PublicKeyCredential {})
    setCapability(navigator, 'credentials', undefined)
    expect(webauthnOK()).toBe(true)
  })

  it('rejects browsers without the WebAuthn credential type', () => {
    setCapability(window, 'PublicKeyCredential', undefined)
    setCapability(navigator, 'credentials', {})
    expect(webauthnOK()).toBe(false)
  })
})

describe('api timeout', () => {
  it('aborts hanging fetch requests after timeout', async () => {
    const { api } = await import('./api.js')
    const hangingFetch = (_url, opts) => new Promise((_, reject) => {
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted', 'AbortError')))
      }
    })
    const origFetch = window.fetch
    window.fetch = hangingFetch
    try {
      await expect(api('/test-hang', { timeout: 50 })).rejects.toThrow('aborted')
    } finally {
      window.fetch = origFetch
    }
  })
})

