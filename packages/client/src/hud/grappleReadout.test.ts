import { describe, expect, it } from 'vitest'
import { GRAPPLE_READY_LABEL, grappleReadout } from './grappleReadout.ts'

const COOLDOWN_S = 5

describe('grappleReadout', () => {
  it('sem recarga pendente o gancho está pronto e a barra cheia', () => {
    expect(grappleReadout(0, COOLDOWN_S)).toEqual({
      state: 'ready',
      label: GRAPPLE_READY_LABEL,
      charge: 1,
    })
  })

  it('recarregando mostra os segundos com vírgula, arredondados para cima', () => {
    const readout = grappleReadout(3.14, COOLDOWN_S)
    expect(readout.state).toBe('cooling')
    expect(readout.label).toBe('3,2')
    expect(readout.charge).toBeCloseTo(0.372)
  })

  it('logo depois do disparo a barra está vazia e a conta mostra a recarga inteira', () => {
    expect(grappleReadout(COOLDOWN_S, COOLDOWN_S)).toMatchObject({ label: '5,0', charge: 0 })
  })

  /** Com o tempo bruto a tela passaria um quadro em `0,0` com o gancho travado. */
  it('fica pronto quando o décimo arredondado chega a zero, não antes', () => {
    expect(grappleReadout(0.01, COOLDOWN_S).label).toBe('0,1')
    expect(grappleReadout(-0.2, COOLDOWN_S).state).toBe('ready')
  })

  it('recusa tempo não finito citando o valor', () => {
    expect(() => grappleReadout(Number.NaN, COOLDOWN_S)).toThrow('seconds recebeu NaN')
  })

  it('com recarga zero no config o gancho está sempre pronto', () => {
    expect(grappleReadout(0, 0).state).toBe('ready')
  })

  it('recusa tempo restante numa recarga que não é positiva', () => {
    expect(() => grappleReadout(1, 0)).toThrow('max recebeu 0')
  })
})
