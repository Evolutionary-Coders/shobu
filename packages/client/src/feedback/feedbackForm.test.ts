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
