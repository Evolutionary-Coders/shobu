/** O pedaço de malha que a compilação usa: estrutural, para o teste não abrir engine. */
export interface CompilableMesh {
  readonly material: { forceCompilationAsync(mesh: never): Promise<void> } | null
}

/** O pedaço de cena que dá o quadro de folga. */
export interface FrameSource {
  readonly onAfterRenderObservable: { addOnce(callback: () => void): unknown }
}

/**
 * Compila os programas de gpu de cada malha **antes** de ela aparecer, e
 * espera um quadro: o primeiro desenho de um material novo é um quadro longo,
 * e no meio da partida é travada que o jogador sente. Falhar a compilação de
 * uma malha só adia o trabalho para o primeiro desenho dela.
 *
 * ```ts
 * await precompileMeshes(scene, [root, ...root.getChildMeshes(false)])
 * ```
 */
export async function precompileMeshes<Mesh extends CompilableMesh>(
  scene: FrameSource,
  meshes: readonly Mesh[],
): Promise<void> {
  await Promise.all(
    meshes.map((mesh) =>
      mesh.material?.forceCompilationAsync(mesh as never).catch(() => undefined),
    ),
  )
  // um quadro de folga para a gpu terminar o que o compilador paralelo ainda devia.
  await new Promise<void>((settle) => scene.onAfterRenderObservable.addOnce(() => settle()))
}
