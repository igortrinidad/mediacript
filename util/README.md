# util/

Scripts that belong to the **repository as a whole**, not to a single package.
Anything here can be run from the repo root and may touch more than one package.

| Script | O que faz |
| --- | --- |
| [`sync-version.mjs`](./sync-version.mjs) | Aplica a versão do `package.json` da raiz em todos os `packages/*` (e nos respectivos `package-lock.json`). Usado pelo workflow de release e disponível como `npm run version:sync`. |

## O que **não** vem para cá

Scripts que fazem parte da superfície publicada de um pacote precisam morar
dentro dele, senão não são distribuídos:

- **`install-mac`** → [`packages/cli/scripts/install-mac.mjs`](../packages/cli/scripts/install-mac.mjs).
  Ele é executado pelo usuário final via `npx mediacript install-mac`, ou seja,
  vai dentro do tarball publicado no npm — e o npm só empacota arquivos que
  estão sob a pasta do pacote. Fora do `packages/cli`, o comando quebraria para
  quem instala pelo npm (que é justamente quem precisa dele: pessoas que
  baixaram o `.dmg` e esbarraram no Gatekeeper).
- **`prepare-mediacript-for-packaging.mjs`** → [`packages/desktop/scripts/`](../packages/desktop/scripts/),
  porque só existe por causa do empacotamento do Electron.
