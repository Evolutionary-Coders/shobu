/**
 * O loader do glTF e os dois shaders que ele puxa sem avisar, no mesmo salto
 * para não somar duas idas à rede. Compartilhado pelo avatar do competidor e
 * pelo viewmodel: quem chegar primeiro paga o download, o segundo acha o módulo
 * em cache.
 *
 * O loader entra por **import dinâmico** de propósito. Ele é o pedaço mais
 * gordo que o cliente tem depois do babylon, e nenhum glb precisa existir no
 * primeiro quadro — o `measure-bundle` mostra isso como "sob demanda", fora do
 * caminho crítico do pilar 2.
 *
 * Os glb chegam com `PBRMaterial`, e o construtor do pbr decodifica a textura
 * brdf embutida com o efeito `postprocess` + `rgbdDecode`. Em es6 o babylon
 * busca esses shaders por url em tempo de execução, o vite devolve o
 * `index.html` no lugar do `.fx`, e o console enchia de `VERTEX SHADER ERROR:
 * '<'` a cada carregamento — o mesmo defeito que `greyboxMaterials.ts` já
 * corrige para o shader default. Importar estaticamente resolve no bundle.
 *
 * ```ts
 * await loadGltfPipeline()
 * const loaded = await ImportMeshAsync('/assets/character/competitor.glb', scene)
 * ```
 */
export async function loadGltfPipeline(): Promise<void> {
  await Promise.all([
    import('@babylonjs/loaders/glTF/2.0'),
    import('@babylonjs/core/Shaders/postprocess.vertex'),
    import('@babylonjs/core/Shaders/rgbdDecode.fragment'),
  ])
}
