// Unit tests for client-side auth validators + error mapping.

import { describe, it, expect } from 'vitest'

import {
  checkEmail,
  checkUsername,
  checkPassword,
  checkPasswordMatch,
  estimateStrength,
  describeAuthError,
} from '../src/lib/auth-validators'

describe('checkEmail', () => {
  it('rejects empty', () => {
    expect(checkEmail('').ok).toBe(false)
  })

  it('rejects malformed', () => {
    expect(checkEmail('not-an-email').ok).toBe(false)
    expect(checkEmail('foo@bar').ok).toBe(false)
    expect(checkEmail('foo @bar.com').ok).toBe(false)
  })

  it('accepts a valid email', () => {
    expect(checkEmail('user@example.com').ok).toBe(true)
    expect(checkEmail(' USER@example.io ').ok).toBe(true)
  })
})

describe('checkUsername', () => {
  it('rejects too short / too long', () => {
    expect(checkUsername('ab').ok).toBe(false)
    expect(checkUsername('x'.repeat(33)).ok).toBe(false)
  })

  it('rejects forbidden characters', () => {
    expect(checkUsername('foo bar').ok).toBe(false)
    expect(checkUsername('foo@bar').ok).toBe(false)
  })

  it('accepts allowed charset', () => {
    expect(checkUsername('alice_42').ok).toBe(true)
    expect(checkUsername('Foo.Bar-baz').ok).toBe(true)
  })
})

describe('checkPassword', () => {
  it('rejects empty', () => {
    expect(checkPassword('').ok).toBe(false)
  })

  it('enforces 8 char minimum', () => {
    expect(checkPassword('1234567').ok).toBe(false)
    expect(checkPassword('12345678').ok).toBe(true)
  })
})

describe('checkPasswordMatch', () => {
  it('flags mismatches', () => {
    expect(checkPasswordMatch('hunter2!', 'hunter2.').ok).toBe(false)
  })

  it('accepts equal strings', () => {
    expect(checkPasswordMatch('hunter2!', 'hunter2!').ok).toBe(true)
  })

  it('rejects empty confirm', () => {
    expect(checkPasswordMatch('hunter2!', '').ok).toBe(false)
  })
})

describe('estimateStrength', () => {
  it('returns 0 for empty input', () => {
    expect(estimateStrength('').level).toBe(0)
  })

  it('downgrades repeating-char passwords', () => {
    expect(estimateStrength('aaaaaaaa').level).toBeLessThanOrEqual(1)
  })

  it('downgrades common patterns', () => {
    expect(estimateStrength('password123').level).toBeLessThanOrEqual(1)
    expect(estimateStrength('qwerty!!!').level).toBeLessThanOrEqual(1)
  })

  it('rates a long mixed password highly', () => {
    expect(estimateStrength('Cr0codile-D1ndon!').level).toBeGreaterThanOrEqual(3)
  })
})

describe('describeAuthError', () => {
  it('maps 409 conflict', () => {
    expect(describeAuthError(409)).toMatch(/d\u00e9j\u00e0/)
  })

  it('maps 401 unauthorized', () => {
    expect(describeAuthError(401)).toMatch(/incorrect/i)
  })

  it('maps 429 rate-limit', () => {
    expect(describeAuthError(429)).toMatch(/tentatives/)
  })

  it('maps network failure', () => {
    expect(describeAuthError(0, 'network')).toMatch(/r\u00e9seau/)
  })

  it('falls back to a generic message', () => {
    expect(describeAuthError(418)).toMatch(/erreur/i)
  })

  it('forwards 5xx', () => {
    expect(describeAuthError(503)).toMatch(/momentan\u00e9ment/)
  })
})
