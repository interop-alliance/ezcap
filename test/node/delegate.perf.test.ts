/*!
 * Copyright (c) 2026 Interop Alliance. All rights reserved.
 *
 * Opt-in micro-benchmark comparing the cost a signature suite adds to zcap
 * delegation. It is NOT run by the normal `test-node` / CI suite (timing is
 * machine-dependent and slow); the `describe` block is gated on the `PERF`
 * env var. Run it with:
 *
 *   pnpm run test-perf            # default iterations
 *   PERF=1 PERF_ITERATIONS=1000 pnpm exec vitest run test/node/delegate.perf.test.ts
 *
 * What it shows: `Ed25519Signature2020` canonicalizes with RDFC/URDNA2015 (RDF
 * dataset normalization, which also JSON-LD-expands the document via the
 * document loader), while `eddsa-jcs-2022` canonicalizes with JCS (a plain JSON
 * serialization). `Ed25519Signature2020` is also a faithful proxy for
 * `eddsa-rdfc-2022`, which uses the same URDNA2015 canonicalization.
 */
import { performance } from 'node:perf_hooks'
import { describe, it, expect } from 'vitest'
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020, EddsaJcs2022 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import type { SignatureSuiteClass } from '@interop/data-integrity-proof'
import type { IDelegatedZcap } from '@interop/data-integrity-core/zcap'
import { ZcapClient } from '../../src/index.js'

const didKeyDriver = didKey.driver()
didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })

const ITERATIONS = Number(process.env.PERF_ITERATIONS ?? 200)
const WARMUP = 20

const INVOCATION_TARGET = 'https://zcap.example/items'
const DELEGATEE = 'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'

interface SuiteCase {
  name: string
  SuiteClass: SignatureSuiteClass
}

interface Timing {
  total: number
  mean: number
  opsPerSec: number
}

const SUITES: SuiteCase[] = [
  { name: 'Ed25519Signature2020 (RDFC)', SuiteClass: Ed25519Signature2020 },
  { name: 'eddsa-jcs-2022 (JCS)', SuiteClass: EddsaJcs2022 }
]

/**
 * Times `iterations` invocations of `task` after a warm-up phase.
 *
 * @param task {() => Promise<unknown>} - The async operation to time.
 *
 * @returns {Promise<Timing>} - Total/mean elapsed ms and ops/sec.
 */
async function time(task: () => Promise<unknown>): Promise<Timing> {
  for (let count = 0; count < WARMUP; count++) {
    await task()
  }
  const start = performance.now()
  for (let count = 0; count < ITERATIONS; count++) {
    await task()
  }
  const total = performance.now() - start
  return { total, mean: total / ITERATIONS, opsPerSec: (ITERATIONS * 1000) / total }
}

/**
 * Builds a fresh ZcapClient for the given suite, plus a pre-signed depth-1
 * delegated zcap to use as the parent in the re-delegation scenario.
 */
async function setupClient(SuiteClass: SignatureSuiteClass): Promise<{
  zcapClient: ZcapClient
  parentZcap: IDelegatedZcap
}> {
  const { didDocument, keyPairs } = await didKeyDriver.generate()
  const zcapClient = new ZcapClient({ SuiteClass, didDocument, keyPairs })
  // self-delegated parent so it can be delegated again (deeper chain). Give it
  // a far-future expiry so the children's default (now + 5 min) stays within
  // it across all iterations (a child must not be less restrictive than its
  // parent).
  const parentZcap = await zcapClient.delegate({
    invocationTarget: INVOCATION_TARGET,
    controller: didDocument.id,
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000)
  })
  return { zcapClient, parentZcap }
}

function formatRow(name: string, timing: Timing): string {
  const mean = timing.mean.toFixed(3).padStart(8)
  const ops = timing.opsPerSec.toFixed(1).padStart(9)
  return `  ${name.padEnd(30)} ${mean} ms/op   ${ops} ops/sec`
}

function report(title: string, results: Array<{ name: string; timing: Timing }>) {
  console.log(`\n${title}  (n=${ITERATIONS})`)
  for (const { name, timing } of results) {
    console.log(formatRow(name, timing))
  }
  // ratio relative to the slowest
  const slowest = results.reduce((max, current) =>
    current.timing.mean > max.timing.mean ? current : max
  )
  for (const { name, timing } of results) {
    if (name === slowest.name) {
      continue
    }
    const speedup = slowest.timing.mean / timing.mean
    console.log(
      `  -> ${name} is ${speedup.toFixed(2)}x faster than ${slowest.name}`
    )
  }
}

describe.runIf(Boolean(process.env.PERF))('delegate() performance by suite', () => {
  it(
    'times root delegation per suite',
    { timeout: 120_000 },
    async () => {
      const results: Array<{ name: string; timing: Timing }> = []
      for (const { name, SuiteClass } of SUITES) {
        const { zcapClient } = await setupClient(SuiteClass)
        const timing = await time(() =>
          zcapClient.delegate({
            invocationTarget: INVOCATION_TARGET,
            controller: DELEGATEE
          })
        )
        results.push({ name, timing })
      }
      report('root delegation (capabilityChain length 1)', results)
      for (const { timing } of results) {
        expect(timing.opsPerSec).toBeGreaterThan(0)
      }
    }
  )

  it(
    'times re-delegation of a depth-1 zcap per suite',
    { timeout: 120_000 },
    async () => {
      const results: Array<{ name: string; timing: Timing }> = []
      for (const { name, SuiteClass } of SUITES) {
        const { zcapClient, parentZcap } = await setupClient(SuiteClass)
        const timing = await time(() =>
          zcapClient.delegate({
            capability: parentZcap,
            controller: DELEGATEE
          })
        )
        results.push({ name, timing })
      }
      report('re-delegation (parent zcap embedded, chain length 2)', results)
      for (const { timing } of results) {
        expect(timing.opsPerSec).toBeGreaterThan(0)
      }
    }
  )
})
