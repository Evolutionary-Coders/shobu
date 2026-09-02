/**
 * Vetor mutável, operado por parâmetro de saída. A forma é feia de propósito:
 * o NFR proíbe alocação no caminho quente, e um vetor imutável aloca um objeto
 * por operação por tick por jogador — que vira pausa do coletor de lixo, que é
 * pior de jogar do que fps médio baixo.
 *
 * Só entra aqui matemática determinística entre plataformas. `Math.sqrt` é
 * exato por especificação IEEE-754; `Math.sin` e `Math.cos` não são, e por
 * isso não aparecem neste módulo (ADR 0003).
 */
export interface Vector3 {
  x: number
  y: number
  z: number
}

/** `out = out + direction * scale`. Devolve `out` para encadear. */
export function addScaled(out: Vector3, direction: Readonly<Vector3>, scale: number): Vector3 {
  out.x += direction.x * scale
  out.y += direction.y * scale
  out.z += direction.z * scale
  return out
}

export function scaleInPlace(out: Vector3, scale: number): Vector3 {
  out.x *= scale
  out.y *= scale
  out.z *= scale
  return out
}

export function lengthSquared(vector: Readonly<Vector3>): number {
  return vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
}

/**
 * Encurta `out` para `maxLength` se ele for mais longo, preservando a direção.
 * É o teto explícito que a ADR 0003 exige da aceleração no ar — sem ele o
 * jogador acumula velocidade indefinidamente em curva.
 */
export function clampLength(out: Vector3, maxLength: number): Vector3 {
  if (maxLength < 0) throw new RangeError(`maxLength recebeu ${maxLength}; esperado >= 0`)
  const squared = lengthSquared(out)
  if (squared <= maxLength * maxLength) return out
  return scaleInPlace(out, maxLength / Math.sqrt(squared))
}
