import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import {
  COMPETITOR_ACCENT_MATERIAL,
  COMPETITOR_ACCENT_RGB,
  COMPETITOR_BODY_MATERIAL,
  COMPETITOR_BODY_RGB,
  type CompetitorAccent,
} from '../character/competitorPalette.ts'

/**
 * Repinta um competidor: corpo preto, juntas acesas no acento dele.
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
  const bodyColor = Color3.FromArray([...COMPETITOR_BODY_RGB])
  for (const mesh of meshes) {
    const material = mesh.material
    if (!(material instanceof StandardMaterial)) continue
    if (material.name.endsWith(COMPETITOR_ACCENT_MATERIAL)) paintAccent(material, accentColor)
    else if (material.name.endsWith(COMPETITOR_BODY_MATERIAL)) paintBody(material, bodyColor)
  }
}

/**
 * A junta **emite** luz em vez de refleti-la: corpo preto contra chão escuro é
 * o defeito que aposentou o SWAT, e o que salva a silhueta a 60 m é o ponto
 * aceso, que não depende da luz de cena.
 */
function paintAccent(material: StandardMaterial, color: Color3): void {
  material.unfreeze()
  material.diffuseColor = Color3.Black()
  material.emissiveColor = color
  material.specularColor = Color3.Black()
  material.freeze()
}

function paintBody(material: StandardMaterial, color: Color3): void {
  material.unfreeze()
  material.diffuseColor = color
  material.emissiveColor = Color3.Black()
  material.specularColor = Color3.Black()
  material.freeze()
}
