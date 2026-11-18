import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { feedbackFormUrl, GAME_NAME_ON_FORM } from './feedbackForm.ts'

const BASE =
  'https://docs.google.com/forms/d/e/1FAIpQLSeeleFRJ3PbTeX9nmxFtfqF_3VMD6bBGixNGFODEtqjbHGK9A/viewform'

describe('feedbackFormUrl', () => {
  it('fills the game name field, as the example in the fair notice does', () => {
    expect(feedbackFormUrl('Ouroboros')).toBe(`${BASE}?entry.52413313=Ouroboros`)
  })

  it('encodes a name that is not plain ascii', () => {
    expect(feedbackFormUrl('shōbu & co')).toBe(`${BASE}?entry.52413313=sh%C5%8Dbu%20%26%20co`)
  })

  it('refuses an empty name, which would leave the form unattributed', () => {
    expect(() => feedbackFormUrl('  ')).toThrow('"  "')
  })

  it('signs this game up as Shōbu', () => {
    expect(feedbackFormUrl(GAME_NAME_ON_FORM)).toBe(`${BASE}?entry.52413313=Sh%C5%8Dbu`)
  })
})

describe('the feedback links in index.html', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const hrefs = [...html.matchAll(/class="feedback-qr-link" href="([^"]+)"/g)].map((m) => m[1])

  // o QR sai de `feedbackFormUrl`; o link é escrito à mão no html, e é aqui
  // que os dois não podem divergir.
  it('point at the same form the QR encodes, on the MVP screen and in the menu', () => {
    expect(hrefs).toEqual([feedbackFormUrl(GAME_NAME_ON_FORM), feedbackFormUrl(GAME_NAME_ON_FORM)])
  })
})
