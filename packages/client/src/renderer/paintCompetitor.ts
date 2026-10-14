import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Texture } from '@babylonjs/core/Materials/Textures/texture'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import {
  COMPETITOR_ACCENT_MATERIAL,
  COMPETITOR_ACCENT_RGB,
  COMPETITOR_BODY_MATERIAL,
  type CompetitorAccent,
} from '../character/competitorPalette.ts'

/**
 * Repinta um competidor: a roupa do atlas sob a luz da cena, o neon aceso no
 * acento dele.
 *
 * Roda **depois** do `flattenPbrMaterial`, que já trocou o material de pbr por
 * `StandardMaterial` e o congelou. Congelar é o que evita o babylon
 * recompilar o shader por quadro, então aqui se descongela, pinta e congela de
 * novo — uma vez por avatar, na carga.
 *
 * Os materiais são por carga, não compartilhados (ver `flattenPbrMaterial`), e
 * é justamente isso que deixa cada boneco ter a própria cor.
 */
export function paintCompetitor(meshes: readonly AbstractMesh[], accent: CompetitorAccent): void {
  const accentColor = Color3.FromArray([...COMPETITOR_ACCENT_RGB[accent]])
  for (const mesh of meshes) {
    const material = mesh.material
    if (!(material instanceof StandardMaterial)) continue
    if (material.name.endsWith(COMPETITOR_ACCENT_MATERIAL)) paintAccent(material, accentColor)
    else if (material.name.endsWith(COMPETITOR_BODY_MATERIAL)) paintBody(material)
  }
}

/**
 * O neon **emite** luz em vez de refleti-la: corpo escuro contra chão escuro
 * é o defeito que aposentou o SWAT, e o que salva a silhueta a 60 m é a faixa
 * acesa, que não depende da luz de cena.
 */
function paintAccent(material: StandardMaterial, color: Color3): void {
  material.unfreeze()
  material.diffuseColor = Color3.Black()
  material.emissiveColor = color
  material.specularColor = Color3.Black()
  material.freeze()
}

/**
 * Quanto do atlas o corpo mostra **sem luz nenhuma**. Medido na arena (11/10):
 * de costas para a luz principal, a calça cáqui e o colete mostarda caíam no
 * mesmo preto do couro, e o humano voltava a ser o boneco escuro que a troca
 * veio corrigir. Com 40 % da textura como emissão, o lado da sombra ainda
 * mostra a cor da roupa, e o lado da luz não estoura.
 */
const BODY_SELF_LIGHT = 0.4

/**
 * O atlas já é a cor: a difusa fica branca para não tingir a textura, e o
 * filtro sai do **nearest** que `flattenPbrMaterial` põe por padrão — num
 * rosto de 200 px no atlas, o nearest de longe vira chuvisco de pixel no olho
 * e na boca, e o trilinear é o que deixa o humano ler como gente. A mesma
 * textura entra como emissão fraca (`BODY_SELF_LIGHT`): é a mesma amostra,
 * sem textura nova.
 */
function paintBody(material: StandardMaterial): void {
  material.unfreeze()
  material.diffuseColor = Color3.White()
  material.diffuseTexture?.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE)
  material.emissiveTexture = material.diffuseTexture
  material.emissiveColor = new Color3(BODY_SELF_LIGHT, BODY_SELF_LIGHT, BODY_SELF_LIGHT)
  material.specularColor = Color3.Black()
  material.freeze()
}
