# Agent Guidelines -- ezcap

## Project Overview

`@interop/ezcap` is an easy-to-use, opinionated **Authorization Capabilities
(zcap) HTTP client** for the browser and Node.js. It wraps the
sign / delegate / invoke flow so that applications can talk to zcap-protected
HTTP servers (e.g. Wallet Attached Storage) without hand-assembling HTTP
Signature headers or capability proofs. It is published as an ESM-only package.

This is an Interop Alliance fork of the Digital Bazaar / Digital Credentials
`ezcap`. Its dependencies have been switched to the `@interop` forks (which ship
TypeScript types), and the source is being converted from JavaScript to
TypeScript. **That conversion is in progress -- see `refactor-plan.md` for the
plan and current target state.** The toolchain and layout described below
reflect the post-conversion target (matching `isomorphic-lib-template`).

For the deeper zcap data model and verification semantics, see the
[`@interop/zcap` AGENTS.md](https://github.com/interop-alliance/) and the
[zCap Developer Guide](https://github.com/interop-alliance/zcap-developer-guide).

## Toolchain & Project Layout

### Package Manager

Use `pnpm` (not `npm` or `yarn`). The lockfile is `pnpm-lock.yaml`. Install deps
with `pnpm install`; run scripts with `pnpm run <script>` or `pnpm <script>`.

### Build

The library is built with `tsc` (not `vite build`). `vite.config.ts` exists only
to configure Vitest and to run `vite dev` as a server for Playwright. Running
`pnpm run build` compiles `src/` to `dist/` via `tsconfig.json`.

### Two tsconfigs

- `tsconfig.json` -- library build only; includes `src/**/*`, emits `dist/`.
- `tsconfig.dev.json` -- extends the above with `noEmit: true`; adds
  `test/**/*.ts`, `vite.config.ts`, and `playwright.config.ts` so ESLint's
  type-aware rules cover all files.

Do not add test files to `tsconfig.json` -- they would be emitted into `dist/`.

### Tests

- `test/node/` -- Vitest unit tests (`pnpm run test-node`); run in Node.
- `test/browser/` -- Playwright tests (`pnpm run test-browser`); run in real
  Chromium via a Vite dev server (`pnpm run dev`). This is the
  browser-isomorphism smoke test.

The `dev` script exists solely to give Playwright a server that serves and
transforms TypeScript source on the fly. There is no browser app.

### ESM & import paths

The package is ESM-only (`"type": "module"`). Local imports must use the `.js`
extension even though source files are `.ts` -- e.g.
`import { ZcapClient } from './ZcapClient.js'`. TypeScript's
`moduleResolution: Bundler` resolves these to the `.ts` source at compile time.

### Source files

```
src/
  index.ts       Public API surface (re-exports)
  ZcapClient.ts  The ZcapClient class: constructor, delegate, request, read, write
  util.ts        getCapabilitySigners, generateZcapUri
```

## Architecture

### Domain model

A **zcap (Authorization Capability)** answers "**who** can do **what**, **with**
which resource, **given** what restrictions": `controller` (who, a DID) /
`allowedAction` (what, e.g. HTTP verbs) / `invocationTarget` (with, a URL) /
caveats like `expires` (given). A **root** zcap has no `parentCapability`,
`expires`, or `proof`; its id is `urn:zcap:root:<url-encoded target>`. A
**delegated** zcap carries `parentCapability`, `expires`, and a
`capabilityDelegation` proof whose `capabilityChain` references its ancestors.

### Public API

```ts
import { ZcapClient, getCapabilitySigners } from '@interop/ezcap'
```

- **`ZcapClient`** -- the client. Construct it with a signing
  `SuiteClass` plus either `{ didDocument, keyPairs }` (signers are derived via
  `getCapabilitySigners`) or explicit `{ invocationSigner, delegationSigner }`.
  Methods:
  - `delegate({ capability, controller, invocationTarget, expires, allowedActions })`
    -- builds a delegated zcap object and signs it with `jsigs.sign` using the
    `CapabilityDelegation` proof purpose.
  - `request({ url, capability, method, action, headers, json, body })` -- the
    core invoke. `action` defaults to `method`. Signs the request and sends it.
  - `read(...)` -- convenience for `GET` / `read`.
  - `write(...)` -- convenience for `POST` / `write`.
- **`getCapabilitySigners({ didDocument, keyPairs })`** -- resolves the
  invocation and delegation signers from a DID Document and its key pairs.

`generateZcapUri`, `_checkZcap`, and `_getDelegationProofs` are internal
helpers, not exported.

### Request flow

```
ZcapClient.request()
  -> resolve invocationTarget (from `capability`, or synthesize a root zcap from `url`)
  -> guard: when both `url` and `capability` are given, `url` must be a RESTful
     prefix of (or equal to) the capability's invocationTarget  (confused-deputy guard)
  -> signCapabilityInvocation()  builds Authorization + capability-invocation
     (+ Digest, Content-Type when there's a body) headers
  -> httpClient(url, { method, agent, headers, json | body })
```

The constructor also auto-builds a document loader from the suite's static
`CONTEXT` / `CONTEXT_URL` (wrapping the zcap loader via `extendDocumentLoader`)
when no `documentLoader` is supplied.

### Dependencies

| Package                               | Role |
|---------------------------------------|------|
| `@interop/zcap`                       | `CapabilityDelegation` proof purpose; `constants` (`ZCAP_CONTEXT_URL`, `ZCAP_ROOT_PREFIX`); default `documentLoader` and `extendDocumentLoader`. |
| `@interop/jsonld-signatures`          | `jsigs.sign` for delegation proofs and `strictDocumentLoader`. **CommonJS** with typed named exports -- import as `import * as jsigs from '@interop/jsonld-signatures'` (no default export). |
| `@interop/http-signature-zcap-invoke` | `signCapabilityInvocation` -- builds the signed HTTP Signature + `capability-invocation` headers. |
| `@interop/http-client`                | `httpClient` (the fetch/ky wrapper) and `DEFAULT_HEADERS`. |

Dev-only: `@interop/did-method-key` (`driver()` generates a `did:key` +
`keyPairs` in tests) and `@interop/ed25519-signature` (the `Ed25519Signature2020`
suite -- now a `DataIntegrityProof` subclass, imported from the package root).

## Conventions

Code style, refactoring, JSDoc, comment, and error-handling conventions live in
@CONTRIBUTING.md -- follow them.
