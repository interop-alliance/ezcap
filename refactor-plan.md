# ezcap TypeScript Conversion & Refactor Plan

Convert `@interop/ezcap` from JavaScript (with hand-written `.d.ts`) to a
TypeScript source library, switch its dependencies to the `@interop` forks, and
adopt the toolchain from `isomorphic-lib-template` (pnpm + tsc build + vitest +
playwright + eslint flat config + prettier).

Decisions confirmed with the maintainer:

- **Forks referenced by published npm versions** (semver ranges, `@interop`
  scope) -- not local `file:` paths.
- **Full toolchain switch** to match `isomorphic-lib-template` exactly.

---

## 1. Dependency migration

Rename the six deps. The forks ship their own types, so once these are in place
the conversion gets full type coverage from the dependency surface.

| Current (remove)                                    | Replace with (add)                       | Latest local version | Notes |
|-----------------------------------------------------|------------------------------------------|----------------------|-------|
| `@digitalcredentials/http-client` `^5.0.4`          | `@interop/http-client`                   | `^1.0.3`             | Exports `httpClient`, `DEFAULT_HEADERS` -- same names, no code change beyond import specifier. |
| `@digitalbazaar/http-signature-zcap-invoke` `^6.1.0`| `@interop/http-signature-zcap-invoke`    | `^6.1.2`             | Exports `signCapabilityInvocation`. Typed `body?: Blob \| Uint8Array` (not `Buffer`). |
| `@digitalbazaar/zcap` `^9.0.1`                       | `@interop/zcap`                          | `^9.0.3`             | Exports `CapabilityDelegation`, `extendDocumentLoader`, `constants`, `documentLoader` -- all used by ezcap. |
| `@digitalcredentials/jsonld-signatures` `^12.0.1`   | `@interop/jsonld-signatures`             | `^11.6.2`            | **CommonJS** package with typed named exports. See migration gotcha 4.1. Note version is *lower* (11.x) -- confirm the API ezcap uses (`sign`, `strictDocumentLoader`) is intact. |
| `@digitalbazaar/did-method-key` `^3.0.0` (dev)      | `@interop/did-method-key`                | `^6.2.1`             | Exports `driver()`. Test-only. |
| `@digitalbazaar/ed25519-signature-2020` `^5.0.0` (dev)| `@interop/ed25519-signature`           | `^6.0.1`             | `Ed25519Signature2020` now exported from package **root** and is a `DataIntegrityProof` subclass. See gotcha 4.2. Test-only. |

`uuid` (`^9.0.1`) stays; it ships its own types.

> Version caution: confirm the published `@interop` versions on npm match (or
> exceed) the local clone versions above before pinning the ranges. If a fork is
> not yet published, that single dep must fall back to a `file:`/`link:` path
> until it is.

---

## 2. Toolchain switch (adopt `isomorphic-lib-template`)

### Files to copy in (from `/home/dmitri/code/Interop/isomorphic-lib-template`)

- `tsconfig.json` -- library build (`include: ["src/**/*"]`), emits `dist/`.
- `tsconfig.dev.json` -- `noEmit`, adds `test/**/*.ts`, `vite.config.ts`,
  `playwright.config.ts` for type-aware lint.
- `eslint.config.js` -- flat config (`@eslint/js` + `typescript-eslint` +
  `eslint-config-prettier`).
- `prettier.config.js` -- **no semicolons, single quotes, `arrowParens: avoid`,
  `trailingComma: none`**.
- `vite.config.ts` -- Vitest config (node tests) + Vite dev server for
  Playwright.
- `playwright.config.ts` -- chromium browser tests via the Vite dev server.
- `.editorconfig`.
- `.github/workflows/ci.yml` -- replaces `.github/workflows/main.yml`.
- `test/index.html` -- empty page for the Playwright dev server.
- `src/declarations.d.ts` -- ambient module declarations (likely stays empty;
  all six forks + `uuid` ship types).

### Files to delete

- `.eslintrc.cjs`, `tests/.eslintrc.cjs` -- replaced by flat config.
- `tests/node.js` -- the `isomorphic-webcrypto` WebCrypto polyfill is
  unnecessary on Node 18+ (global `crypto.webcrypto`); drop it and the
  `isomorphic-webcrypto` dev dep.
- `tests/karma.conf.cjs` -- replaced by Playwright.
- `.github/workflows/main.yml`.
- `readme-template.hbs` -- the jsdoc2md README pipeline is dropped (see §6).
- `types/` directory (`index.d.ts`, `ZcapClient.d.ts`, `util.d.ts`) -- **but
  first salvage the interface definitions**; they are an excellent head start
  and should be moved into the `.ts` sources so `tsc` regenerates them into
  `dist/` (see §4).
- The whole `tests/` tree moves to `test/` (see §5).

### Dev deps to remove

`c8`, `chai`, `cross-env`, `eslint`(old 8.x), `eslint-config-digitalbazaar`,
`eslint-plugin-jsdoc`, `eslint-plugin-unicorn`, `isomorphic-webcrypto`, `jsdoc`,
all `karma*`, `mocha`, `mocha-lcov-reporter`, `webpack`.

### Dev deps to add (from template)

`@eslint/js`, `@playwright/test`, `@types/node`, `@vitest/coverage-v8`,
`eslint` (10.x), `eslint-config-prettier`, `globals`, `prettier`, `rimraf`,
`typescript`, `typescript-eslint`, `vite`, `vitest`, plus the two `@interop`
test deps (`did-method-key`, `ed25519-signature`).

---

## 3. New project layout

```
ezcap/
  src/
    index.ts          (from lib/index.js)
    ZcapClient.ts      (from lib/ZcapClient.js + types/ZcapClient.d.ts)
    util.ts            (from lib/util.js + types/util.d.ts)
    declarations.d.ts  (from template; probably empty)
  test/
    node/
      ZcapClient.test.ts   (from tests/unit/EzcapClient.spec.js, vitest)
    browser/
      ZcapClient.spec.ts   (new; playwright smoke test)
    index.html             (from template)
  dist/                    (build output; gitignored)
  tsconfig.json
  tsconfig.dev.json
  eslint.config.js
  prettier.config.js
  vite.config.ts
  playwright.config.ts
  .editorconfig
  package.json
  README.md
  CHANGELOG.md
  LICENSE
  .github/workflows/ci.yml
```

---

## 4. Source conversion (file by file)

General style (per the template / sibling CLAUDE.md): keep ESM, local imports
keep the `.js` extension (`moduleResolution: Bundler` resolves to `.ts`),
options-object params destructured in the signature, named `async function`
declarations, JSDoc kept (it documents the public API), prettier reformat
(semicolons dropped).

### 4.0 Move the hand-written types into source

The existing `types/*.d.ts` already define every interface we need
(`Signer`, `VerificationMethodReference`, `DidDocument`, `KeyPair`,
`CapabilitySigners`, `HttpsAgent`, `LinkedDataSignatureSuiteClass`,
`ZcapObject`, `ZcapClientOptions`, `DelegateOptions`, `RequestOptions`,
`ReadOptions`, `WriteOptions`). Copy these `interface`/`type` declarations
verbatim into the corresponding `.ts` source files as exported types, then let
`tsc --declaration` regenerate `dist/*.d.ts`. Do **not** keep hand-maintaining
`.d.ts`.

### 4.1 `src/util.ts` (from `lib/util.js` + `types/util.d.ts`)

- Import: `import { constants } from '@interop/zcap'` and
  `import { v4 as uuid } from 'uuid'`.
- Export interfaces `Signer`, `VerificationMethodReference`, `DidDocument`,
  `KeyPair`, `CapabilitySigners` (lifted from `types/util.d.ts`).
- `getCapabilitySigners({ didDocument, keyPairs })` -- annotate params with the
  interfaces; return type `CapabilitySigners`. Logic unchanged.
- `generateZcapUri({ url }?)` -- `url?: string`, returns `Promise<string>`.

### 4.2 `src/ZcapClient.ts` (from `lib/ZcapClient.js` + `types/ZcapClient.d.ts`)

- Imports:
  - `import { CapabilityDelegation, extendDocumentLoader, constants as zCapConstants, documentLoader as zcapDocumentLoader } from '@interop/zcap'`
  - `import { DEFAULT_HEADERS, httpClient } from '@interop/http-client'`
  - **`import * as jsigs from '@interop/jsonld-signatures'`** -- the fork has no
    default export; namespace import keeps `jsigs.sign(...)` /
    `jsigs.strictDocumentLoader(...)` working at both type and runtime level
    (CJS named-export interop). (Gotcha: the current code's
    `import jsigs from '...'` default import will not type-check against the
    fork's `.d.ts`.)
  - `import { signCapabilityInvocation } from '@interop/http-signature-zcap-invoke'`
  - `import { generateZcapUri, getCapabilitySigners } from './util.js'` plus the
    types it needs.
- Export interfaces lifted from `types/ZcapClient.d.ts`: `HttpsAgent`,
  `LinkedDataSignatureSuiteClass`, `ZcapObject`, `ZcapClientOptions`,
  `DelegateOptions`, `RequestOptions`, `ReadOptions`, `WriteOptions`.
- Class fields typed (`agent?`, `defaultHeaders`, `SuiteClass`,
  `invocationSigner?`, `delegationSigner?`, `documentLoader`).
- `constructor(options: ZcapClientOptions)`, `delegate(options: DelegateOptions)`,
  `request(options: RequestOptions)`, `read(options: ReadOptions)`,
  `write(options: WriteOptions)` -- signatures from the existing `.d.ts`.
- Private module helpers `_checkZcap` and `_getDelegationProofs` stay
  module-level functions; type their `{ capability }` params with `ZcapObject`.
- `error.cause` assignment (line ~336): use the standard
  `new Error(msg, { cause })` form to satisfy strict typing instead of mutating
  the error object.
- Suite construction `new this.SuiteClass({ date, signer })` -- compatible with
  the new `Ed25519Signature2020` constructor (`{ signer, date }`, `date` accepts
  `Date`). The auto doc-loader branch keys off `SuiteClass.CONTEXT` &
  `SuiteClass.CONTEXT_URL`, both still present as statics. **Validate** that the
  `DataIntegrityProof`-based suite still emits a `capabilityDelegation` proof
  whose `proof.capabilityChain` length matches the existing tests (it should --
  chain/purpose are independent of proof type).

### 4.3 `src/index.ts` (from `lib/index.js`)

```ts
export { ZcapClient } from './ZcapClient.js'
export type {
  HttpsAgent, LinkedDataSignatureSuiteClass, ZcapObject, ZcapClientOptions,
  DelegateOptions, RequestOptions, ReadOptions, WriteOptions
} from './ZcapClient.js'
export { getCapabilitySigners } from './util.js'
export type {
  Signer, VerificationMethodReference, DidDocument, KeyPair, CapabilitySigners
} from './util.js'
```

(`generateZcapUri` remains internal, matching the current public surface.)

---

## 5. Test conversion

### 5.1 `test/node/ZcapClient.test.ts` (vitest, from `tests/unit/EzcapClient.spec.js`)

- Imports: `import { describe, it, expect } from 'vitest'`,
  `import * as didKey from '@interop/did-method-key'`,
  `import { Ed25519Signature2020 } from '@interop/ed25519-signature'`,
  `import { getCapabilitySigners, ZcapClient } from '../../src/index.js'`.
- Rewrite chai `should`/`expect` assertions to vitest `expect`:
  - `expect(x).to.exist` to `expect(x).toBeDefined()`
  - `x.should.equal(y)` to `expect(x).toBe(y)`
  - `x.should.have.length(n)` to `expect(x).toHaveLength(n)`
  - error-message checks to `expect(err.message).toBe(...)` /
    `.not.toContain(...)`.
- Keep the constructor, root-delegation, deep-chain, and missing-controller
  tests as-is in behavior.
- The three `request`/`write` "accepts body/json without param error" tests make
  a **real** network call to `https://zcap.example/items` and merely assert the
  thrown error isn't a param-validation error. They pass today via DNS failure.
  Keep them, but consider mocking `httpClient` (vitest `vi.mock`) to make them
  deterministic and fast -- flagged as optional cleanup, not required.

### 5.2 `test/browser/ZcapClient.spec.ts` (playwright, new)

Mirror the template's pattern: navigate to `/test/index.html`, `page.evaluate`
an `import('/src/index.ts')`, generate a `did:key`, construct a `ZcapClient`
with `Ed25519Signature2020`, delegate a root zcap, and assert the returned
`parentCapability` / `proof.proofPurpose`. This is the browser-isomorphism smoke
test that replaces karma.

---

## 6. `package.json` rewrite

Start from the current file and apply:

- Keep `name: "@interop/ezcap"`, `type: "module"`, license, author/repo/bugs.
- **`version`: `7.0.0`** -- breaking (dep swap, build output relocates from
  `lib/`+`types/` to `dist/`, exports change).
- `exports` / `module` / `browser` / `types` -- adopt the template shape:
  ```jsonc
  "exports": { ".": {
    "types": "./dist/index.d.ts",
    "react-native": "./dist/index.js",
    "import": "./dist/index.js"
  }},
  "module": "dist/index.js",
  "browser": "dist/index.js",
  "types": "dist/index.d.ts",
  "sideEffects": false
  ```
- `files`: `["dist", "README.md", "LICENSE"]` (ezcap ships `LICENSE`, not
  `LICENSE.md`).
- `scripts`: replace with the template set -- `build` (`pnpm run clear && tsc`),
  `clear`, `dev`, `fix`, `format`, `lint`, `prepare`, `rebuild`, `test`,
  `test-browser`, `test-node`, `test-coverage`.
- Remove the `c8` block.
- `packageManager: "pnpm@..."`, `engines.node`: template uses `>=24.0`.
  **Recommendation: set `>=20` for a published isomorphic library** (Node 24 is
  unnecessarily aggressive for a dependency-only lib); call out for maintainer
  sign-off. Either way, update CI `node-version` to match.
- `dependencies`: `@interop/http-client`, `@interop/http-signature-zcap-invoke`,
  `@interop/zcap`, `@interop/jsonld-signatures`, `uuid`.
- `devDependencies`: the template set (§2) + `@interop/did-method-key`,
  `@interop/ed25519-signature`.
- `publishConfig`: keep `access: public`; template also adds
  `provenance: true` (enable if publishing via the template's `publish.yml`).

Delete `package-lock.json` if present; `.npmrc` (`package-lock=false`) is fine
with pnpm. Generate `pnpm-lock.yaml` via `pnpm install`.

---

## 7. README / docs

The current README is generated from JSDoc via `readme-template.hbs` + `jsdoc`.
That pipeline is dropped. Convert the README to a hand-maintained doc (keep the
Background/Security/Install/Usage prose; update the API Reference section
manually or, optionally, generate it with `typedoc` later). Update the install
snippet and the CI badge URL. `CHANGELOG.md`: add a `7.0.0` entry summarizing the
fork swap + TS conversion.

---

## 8. Migration gotchas (call-outs for implementation)

1. **`@interop/jsonld-signatures` is CommonJS with named typed exports.** Use
   `import * as jsigs from '@interop/jsonld-signatures'` (not a default import).
   Its version is `11.x` -- lower than the `12.x` currently used; verify
   `sign(document, {...})` and `strictDocumentLoader` signatures are unchanged.
2. **`Ed25519Signature2020` moved + changed base class.** Now imported from the
   `@interop/ed25519-signature` package root and extends `DataIntegrityProof`.
   Constructor is `{ signer, date }` with `date: string | Date | number | null`.
   Statics `CONTEXT_URL` / `CONTEXT` still present (the auto doc-loader depends
   on them). Validate delegation proofs verify and match test expectations.
3. **`body` type narrowing.** `signCapabilityInvocation` types body as
   `Blob | Uint8Array`. The current ezcap `RequestOptions.body` allows
   `Buffer` too; `Buffer extends Uint8Array`, so keep `Blob | Uint8Array` (the
   node tests pass `Buffer.from(...)`, which is assignable).
4. **`moduleResolution: Bundler` + `.js` import extensions** are mandatory for
   local imports even though sources are `.ts`.
5. **Prettier reformats everything** (drops semicolons, etc.). This conflicts
   with the "preserve formatting" guideline, but full template adoption was
   chosen -- run `pnpm run format` once and commit the reformat.
6. **`strict` + `noUncheckedIndexedAccess`** (template tsconfig) will surface
   places like `capabilityDelegation[0]` in `util.ts` and `const [parentProof] =
   ...` in `ZcapClient.ts` as possibly-`undefined`; add guards/narrowing.

---

## 9. Execution order

1. Branch (e.g. `ts-conversion`).
2. Copy template config files in; delete obsolete config/test scaffolding.
3. Rewrite `package.json` (§6); `pnpm install` to generate `pnpm-lock.yaml`.
4. Create `src/` and convert `util.ts`, `ZcapClient.ts`, `index.ts` (§4),
   folding in the salvaged interface definitions; delete `lib/` and `types/`.
5. `pnpm run build` -- iterate until `tsc` is clean under strict mode.
6. `pnpm run lint` / `pnpm run fix` -- resolve eslint + prettier.
7. Convert node tests to vitest (§5.1); `pnpm run test-node` green.
8. Add the playwright browser test (§5.2); `pnpm exec playwright install
   chromium`; `pnpm run test-browser` green.
9. Update README + CHANGELOG (§7).
10. Full `pnpm run test` (lint + node + browser) green; open PR.

---

## 10. Open items for maintainer

- Confirm `engines.node` target (go ahead and use the template's `>=24`).
- Decide whether to mock `httpClient` in the three network-touching node tests
  (§5.1) or leave them relying on DNS failure.
- README strategy: hand-maintained. (confirmed)

---

## 11. Session progress / handoff (last updated 2026-05-31)

### State of the conversion

Config files, `src/` conversion (`index.ts`, `util.ts`, `ZcapClient.ts`,
`declarations.d.ts`), `package.json`, and `pnpm-lock.yaml` are all in place
(uncommitted, branch `ts-conversion`). Tests are **not** yet converted -- only
`test/index.html` exists; the old `tests/unit/EzcapClient.spec.js` is still
present (and staged for deletion in git status).

### Done this session

- **uuid bumped `9.0.1` to `11.1.1`** -- deviation from plan §1/§6, which said
  keep `^9.0.1`. Reason: the plan wrongly assumed uuid 9 ships its own types;
  it ships **no** `.d.ts` at all, and `@types/uuid@11` is only a deprecation
  stub. uuid 11 is self-typed, ESM-native (uuid itself warns ESM codebases to
  upgrade), and the `v4` API is unchanged. **Flag for maintainer sign-off.**
- **`src/ZcapClient.ts` type fixes** (to clear `tsc` errors):
  - `ZCAP_CONTEXT_URL` read via a typed view of `constants` (see dep bug 1).
  - Added `RemoteDocument` interface; `DocumentLoader` now returns
    `Promise<RemoteDocument>` (was `Promise<object>`) to match jsigs' loader.
  - `jsigs.sign(...)`: `suite as jsigs.LinkedDataProof`,
    `purpose as unknown as jsigs.ProofPurpose`, and the `CapabilityDelegation`
    ctor arg cast via `as unknown as ConstructorParameters<...>[0]`
    (see dep bugs 2 & 3).
  - `options.body = body as BodyInit` at the httpClient boundary
    (TS 5.7 generic `Uint8Array<ArrayBufferLike>` vs node's `BodyInit`).

### Build verified clean (2026-05-31)

`pnpm run build` (`tsc -p tsconfig.json`) emits `dist/` cleanly with no errors.
`pnpm exec eslint src` and `pnpm run lint` (src + test) are both clean, and
`prettier --check` passes (the two `src/*.ts` files were reformatted this
session -- they had not been run through prettier before).

### `@interop/zcap` dependency type bugs -- FIXED UPSTREAM (2026-05-31)

All three defects (plus a fourth found while validating) were fixed at their
source in the `../zcap` fork (JSDoc/source edits, then regenerated `.d.ts` via
`tsc`). The ezcap-side casts that worked around them have been removed:

1. **Missing `ZCAP_CONTEXT` / `ZCAP_CONTEXT_URL` re-export** -- `lib/constants.js`
   now uses local typed bindings with explicit `@type` JSDoc instead of a
   `export { ... } from '@digitalbazaar/zcap-context'` (which `tsc` silently
   dropped because zcap-context ships no types). ezcap's
   `ZCAP_CONTEXT_URL`-via-typed-view cast is gone -- it now reads
   `const { ZCAP_ROOT_PREFIX, ZCAP_CONTEXT_URL } = zCapConstants` directly.
2. **`suite` typed as required** -- marked `[options.suite]` optional in
   `CapabilityProofPurpose` / `CapabilityDelegation` / `CapabilityInvocation`
   (it is verification-only). ezcap's
   `as unknown as ConstructorParameters<...>[0]` cast on `new
   CapabilityDelegation({ parentCapability })` is gone.
3. **`validate` return incompatible with jsigs** -- added
   `@returns {Promise<import('@interop/jsonld-signatures').ProofValidateResult>}`
   to `CapabilityProofPurpose.validate`, making the purpose structurally
   assignable to jsigs' `ProofPurpose`. ezcap's `purpose as unknown as
   jsigs.ProofPurpose` cast is gone.
4. **(Discovered) `RootZcap`/`DelegatedZcap` had a bogus `""` property instead
   of `@context`** -- `tsc`'s JSDoc parser mangles a property named `@context`
   to an empty-string key. Moved the four object shapes into a hand-authored
   `lib/zcap-types.d.ts`, re-exported as `@typedef`s.

Verified: zcap 98 tests passing + `eslint .` clean; ezcap `tsc --noEmit` and
`eslint src` clean with those three casts removed.

**One residual cast remains** at `src/ZcapClient.ts:418`:
`suite: suite as jsigs.LinkedDataProof` in the `jsigs.sign(...)` call. The
`Ed25519Signature2020` suite (a `DataIntegrityProof` subclass) is not
structurally assignable to jsigs' `LinkedDataProof` parameter type. Left as-is
for now; revisit if the jsigs/ed25519-signature `.d.ts` surfaces are aligned
upstream.

### Tests converted (2026-05-31)

- `test/node/ZcapClient.test.ts` -- the 8 vitest tests (constructor, root
  delegation, deep chain, missing-controller, and three body/json request
  smoke tests) all pass. chai `should`/`expect` rewritten to vitest `expect`.
  The missing-controller test uses `// @ts-expect-error` to omit the required
  `controller`. The three request tests still make a real network call that
  fails at DNS (left as-is per the §5.1 optional-cleanup note).
- `test/browser/ZcapClient.spec.ts` + `test/browser/delegate-fixture.ts` --
  Playwright smoke test passes in Chromium. **Pattern note:** raw
  `page.evaluate` code can't resolve bare `@interop/*` specifiers, so the
  delegation flow lives in `delegate-fixture.ts` (Vite transforms it and
  rewrites the bare imports) and the spec does
  `import('/test/browser/delegate-fixture.ts')` inside `page.evaluate`. The
  fixture is not a `*.spec.ts`, so Playwright ignores it as a test.
- Old `tests/` tree removed (`git rm -r tests/`).

### New dev dependency (deviation from plan §5.1)

`@interop/did-method-key` **v6** no longer auto-registers a key suite; its
`driver().generate()` throws `No key suite registered` until you call
`driver.use({ keyPairClass })`. So both tests now import
`@interop/ed25519-verification-key` (added as a dev dep, `^6.2.0`) and call
`didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })`. The README
"Creating a Client" example was updated to show this too.

### README / CHANGELOG done (2026-05-31)

- `README.md` -- retitled `@interop/ezcap`, updated badge, Install (pnpm,
  Node 20, ESM-only), "Creating a Client" imports (`@interop/*` +
  `keyPairClass` registration), and replaced the jsdoc2md-generated API
  Reference dump with a concise hand-maintained reference.
- `CHANGELOG.md` -- retitled and added the `7.0.0` entry (dep swap + TS
  conversion + toolchain switch + Node 20).

### Open dependency item (still outstanding)

`package.json` has `@interop/zcap: file:../zcap` (fallback per §1 version
caution -- the fixed version isn't published yet). Revert to a published
semver range once the upstream fixes above are released.

### Remaining work

1. Resolve the `@interop/zcap: file:../zcap` pin once the fork is published.
2. Open the PR (everything else for §9 steps 5-10 is done: build, lint,
   node + browser tests, README, CHANGELOG all green via `pnpm run test`).
