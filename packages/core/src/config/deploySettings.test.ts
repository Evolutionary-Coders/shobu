import { describe, expect, it } from 'vitest'
import { gameplayConfigUrl, portSetting } from './deploySettings.ts'

const REPO_ROOT = new URL('file:///repo/')

describe('portSetting', () => {
  it('fica no padrão sem a variável, para o dev rodar como sempre', () => {
    expect(portSetting({}, 'PORT', 2567)).toBe(2567)
  })

  it('usa a porta da variável', () => {
    expect(portSetting({ PORT: '2577' }, 'PORT', 2567)).toBe(2577)
  })

  /** Cair no padrão em silêncio subiria uma pilha de teste na porta de outra. */
  it.each(['', 'abc', '0', '65536', '25.5', '-1', ' 2567'])(
    'rejeita %j citando o valor',
    (text) => {
      expect(() => portSetting({ PORT: text }, 'PORT', 2567)).toThrow(`PORT='${text}'`)
    },
  )
})

describe('gameplayConfigUrl', () => {
  it('aponta para o arquivo versionado sem a variável', () => {
    expect(gameplayConfigUrl({}, REPO_ROOT).href).toBe('file:///repo/config/gameplay.json')
  })

  it('resolve caminho relativo contra a raiz, não contra a pasta do pacote', () => {
    const env = { GAMEPLAY_CONFIG: 'tmp/stack1.json' }
    expect(gameplayConfigUrl(env, REPO_ROOT).href).toBe('file:///repo/tmp/stack1.json')
  })

  it('aceita caminho absoluto', () => {
    const env = { GAMEPLAY_CONFIG: '/tmp/stack1/gameplay.json' }
    expect(gameplayConfigUrl(env, REPO_ROOT).href).toBe('file:///tmp/stack1/gameplay.json')
  })

  it('rejeita a variável vazia citando o valor', () => {
    expect(() => gameplayConfigUrl({ GAMEPLAY_CONFIG: ' ' }, REPO_ROOT)).toThrow(
      "GAMEPLAY_CONFIG=' '",
    )
  })
})
