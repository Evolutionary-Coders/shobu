import { describe, expect, it } from 'vitest'
import {
  nodeBounds,
  nodesNamed,
  nodeVertices,
  parseGlb,
  readPublishedGlb,
} from './publishedArenaGlb.ts'

/**
 * Um glb de mentira: dois vértices em float a partir do byte 0, e dois em
 * short normalizado a partir do byte 24, intercalados com dois bytes de folga
 * (passo de 8) e com o acessor começando 2 bytes depois da vista.
 */
function syntheticGlb(json: object): Buffer {
  const bin = Buffer.alloc(48)
  for (const [index, value] of [0, 0, 0, 1, 1, 1].entries()) bin.writeFloatLE(value, index * 4)
  for (const [index, value] of [32767, 0, -32767, 0, 0, 0].entries()) {
    bin.writeInt16LE(value, 26 + Math.floor(index / 3) * 8 + (index % 3) * 2)
  }
  const text = Buffer.from(
    JSON.stringify(json).padEnd(Math.ceil(JSON.stringify(json).length / 4) * 4),
  )
  const header = Buffer.alloc(12)
  header.write('glTF', 0)
  const chunk = (length: number, kind: string) => {
    const head = Buffer.alloc(8)
    head.writeUInt32LE(length, 0)
    head.write(kind, 4)
    return head
  }
  return Buffer.concat([header, chunk(text.length, 'JSON'), text, chunk(bin.length, 'BIN\0'), bin])
}

const FLOAT_JSON = {
  nodes: [
    { name: 'peca-1', mesh: 0, translation: [1, 2, 3], scale: [2, 2, 2] },
    { name: 'peca-girada', mesh: 0, rotation: [0, 0, 0, 1] },
    { name: 'byte', mesh: 1 },
    { name: 'vazio' },
    { name: 'sem-malha', mesh: 9 },
    { name: 'curta', mesh: 2 },
    { name: 'inteira', mesh: 3 },
  ],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0 } }] },
    { primitives: [{ attributes: { POSITION: 1 } }] },
    { primitives: [{ attributes: { POSITION: 2 } }] },
    { primitives: [{ attributes: { POSITION: 3 } }] },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 2, min: [0, 0, 0], max: [1, 1, 1] },
    { bufferView: 0, componentType: 5121, count: 1, min: [0, 0, 0], max: [1, 1, 1] },
    {
      bufferView: 1,
      byteOffset: 2,
      componentType: 5122,
      normalized: true,
      count: 2,
      min: [0, 0, -32767],
      max: [32767, 0, 0],
    },
    { bufferView: 1, componentType: 5122, count: 1, min: [0, 0, 0], max: [1, 1, 1] },
  ],
  bufferViews: [{}, { byteOffset: 24, byteStride: 8 }],
}

describe('publishedArenaGlb', () => {
  const glb = parseGlb(syntheticGlb(FLOAT_JSON))

  it('acha os nós pelo começo do nome', () => {
    expect(nodesNamed(glb, 'peca').map((node) => node.name)).toEqual(['peca-1', 'peca-girada'])
  })

  it('põe o volume no lugar e espelha o x para o jogo', () => {
    const [node] = nodesNamed(glb, 'peca-1')
    expect(node && nodeBounds(glb, node)).toEqual({ min: [-3, 2, 3], max: [-1, 4, 5] })
  })

  it('lê cada vértice, no lugar e espelhado', () => {
    const [node] = nodesNamed(glb, 'peca-1')
    expect(node && nodeVertices(glb, node)).toEqual([
      [-1, 2, 3],
      [-3, 4, 5],
    ])
  })

  it('lê o short normalizado da quantização, no passo e no deslocamento da vista', () => {
    const [node] = nodesNamed(glb, 'curta')
    expect(node && nodeVertices(glb, node)).toEqual([
      [-1, 0, -1],
      [-0, 0, 0],
    ])
    expect(node && nodeBounds(glb, node)).toEqual({ min: [-1, 0, -1], max: [-0, 0, 0] })
  })

  it('recusa nó girado, sem malha ou com malha que não existe, com o nome dele', () => {
    for (const name of ['peca-girada', 'vazio', 'sem-malha']) {
      const [node] = nodesNamed(glb, name)
      expect(() => node && nodeBounds(glb, node)).toThrow(new RegExp(`nó ${name}`))
    }
  })

  it('recusa posição num formato que o build não grava', () => {
    const [byte] = nodesNamed(glb, 'byte')
    const [whole] = nodesNamed(glb, 'inteira')
    expect(() => byte && nodeBounds(glb, byte)).toThrow(/componentType 5121/)
    expect(() => whole && nodeBounds(glb, whole)).toThrow(/componentType 5122/)
  })
})

describe('readPublishedGlb', () => {
  it('lê o glb publicado de um mapa pelo nome do arquivo', () => {
    expect(readPublishedGlb('neon-kaido.glb').json.nodes.length).toBeGreaterThan(0)
  })
})
