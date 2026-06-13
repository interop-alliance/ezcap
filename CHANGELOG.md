# @interop/ezcap Changelog

## 7.2.1 - 2026-06-13

### Changed
- Update to `@interop/data-integrity-core@8.0.0` and related.

## 7.2.0 - 2026-06-09
### Added
- Document and test signing delegations with the `eddsa-jcs-2022` cryptosuite
  (Node and browser smoke tests): pass `SuiteClass: EddsaJcs2022` (from
  `@interop/ed25519-signature`) to `ZcapClient` to produce delegated zcaps with
  a `DataIntegrityProof` (`cryptosuite: 'eddsa-jcs-2022'`) instead of an
  `Ed25519Signature2020` proof. No API change -- the `SuiteClass` option already
  accepts any `@interop/data-integrity-proof` suite class.
- Opt-in delegation micro-benchmark (`test/node/delegate.perf.test.ts`, run via
  `pnpm run test-perf`) comparing the per-suite cost of `ZcapClient.delegate()`.
  Gated on the `PERF` env var so it does not run in the normal `test-node` / CI
  suite.

### Changed
- Require `@interop/ed25519-signature@^7.1.0` (adds the `EddsaJcs2022` suite
  class export).
- Update to `@interop/data-integrity-core@^7.0.0` and
  `@interop/data-integrity-proof@^3.3.1`. The latter now resolves
  `@interop/jsonld-signatures@^11.7.1` (core 7.0.0), so the `SuiteClass`'s
  `createProof` return type aligns with `jsigs.sign`'s expected proof
  `'@context'` type (`ILDContext`). No ezcap API change.

## 7.1.1 - 2026-06-02
### Changed
- Update to use latest `@interop/zcap@11.0.0` TypeScript dep.
- Use the `IDocumentLoader` type from `@interop/data-integrity-core/loader`
  directly for the `documentLoader` option/property, and drop the now-redundant
  casts on the zcap `documentLoader` / `extendDocumentLoader` values.

### Removed
- **Breaking:** Drop the local `RemoteDocument` and `DocumentLoader` type
  aliases (including the `DocumentLoader` re-export from the package root).
  Consumers should import `IRemoteDocument` / `IDocumentLoader` from
  `@interop/data-integrity-core/loader` instead.

## 7.1.0 - 2026-06-01
### Changed
- Source the zcap, DID, key pair, and signer types from
  `@interop/data-integrity-core` instead of hand-written local interfaces.
- Source the suite-class type from `@interop/data-integrity-proof`.

## 7.0.4 - 2026-05-31
### Fixed
- Fix `jsigs` `LinkedDataProof` type import.

## 7.0.0-7.0.3 - 2026-05-31
### Changed
- **BREAKING**: Renamed package to `@interop/ezcap` (Interop Alliance fork).
- **BREAKING**: Switched all dependencies to the `@interop` forks:
  `@interop/http-client`, `@interop/http-signature-zcap-invoke`,
  `@interop/zcap`, and `@interop/jsonld-signatures`.
- **BREAKING**: Converted the source from JavaScript to TypeScript. The build
  output now lives in `dist/` (was `lib/` + hand-written `types/`); `exports`,
  `module`, `browser`, and `types` point there.
- **BREAKING**: ESM-only; minimum Node.js is now 20.
- Switched the toolchain to pnpm + `tsc` build + Vitest (node) + Playwright
  (browser) + ESLint flat config + Prettier.
- Bumped `uuid` to 14 (self-typed, ESM-only, requires Node 20+).

## 6.1.0 - 2026-03-23
### Added
- Add TypeScript type definitions.

## 6.0.0 - 2025-10-18
### Changed
- **BREAKING**: Rename `blob` payload param to `body` to match upstream
  PR https://github.com/digitalbazaar/http-signature-zcap-invoke/pull/30/
- **BREAKING**: By default, set the `action` to be the same as the http `method`.

## 5.1.0 - 2025-09-03
### Added
- Add support for binary `blob` objects to `request()`.

## 5.0.0 - 2025-08-27
### Changed
- **BREAKING:** Fork from `@digitalbazaar/ezcap@4.1.0`
- Update to use DCC versions of `http-client` and jsigs.

## 4.1.0 - 2024-01-01

### Changed
- Updated dependencies:
  - `@digitalbazaar/http-client@4`.
  - `uuid@9`.
- Set node.js engines recommendation to 18+.

## 4.0.1 - 2023-12-22

### Fixed
- Fix bug that prevented some invocation targets from being attenuated
  using query params.

## 4.0.0 - 2022-10-25

### Changed
- **BREAKING**: Use `@digitalbazaar/zcap@9` and `jsonld-signatures@11`.

## 3.0.1 - 2022-06-09

### Changed
- Mark ZcapClient as a class in the docs.

## 3.0.0 - 2022-06-09

### Changed
- **BREAKING**: Convert to module (ESM).
- **BREAKING**: Require Node.js >=14.
- **BREAKING**: Require Web Crypto API. Older browsers and Node.js 14 users
  need to install an appropriate polyfill.
- Update dependencies.
- Lint module.

## 2.0.6 - 2022-04-17

### Fixed
- Get default `allowedActions` from `capability` to be delegated.

## 2.0.5 - 2022-04-17

### Fixed
- Fix `allowedActions` default in `delegate`. Now `allowedActions`
  will properly use the parent zcap's allowed actions if it is not
  provided.

## 2.0.4 - 2022-03-07

### Fixed
- Add check for `controller` in `ZcapClient.delegate` API.

## 2.0.3 - 2022-02-23

### Fixed
- Ensure zcap delegation time is after parent.

## 2.0.2 - 2022-02-15

### Fixed
- Add missing helper function to get delegation proofs.

## 2.0.1 - 2022-01-11

### Changed
- Updated dependencies.

## 2.0.0 - 2022-01-11

### Added
- Allow `expires` to be a `Date` instance.

### Changed
- **BREAKING**: Use zcap@7.
- **BREAKING**: Use `urn:uuid:` by default for delegated zcaps.
- **BREAKING**: Rename `targetDelegate` param to `controller` to match the
  property name that the value will be assigned to in the delegated zcap.

### Removed
- **BREAKING**: Remove `url` parameter from `delegate()` to reduce confusion
  over usage. Now `capability` and / or `invocationTarget` must be specified.
- **BREAKING**: Remove support for capability invocation targets that are
  objects and not strings. This reduces optionality to simplify.

## 1.0.0 - 2021-07-22

### Added
- Initial release, see individual commits for history.
