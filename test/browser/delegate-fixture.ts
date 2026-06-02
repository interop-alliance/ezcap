/*!
 * Copyright (c) 2026 Interop Alliance. All rights reserved.
 *
 * Browser fixture for the Playwright isomorphism smoke test. This module is
 * served and transformed by the Vite dev server (so its bare `@interop/*`
 * imports are resolved), then imported from inside `page.evaluate`. It is not
 * a Playwright spec file, so the test runner ignores it.
 */
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import type { ICapabilityDelegationProof } from '@interop/data-integrity-core/zcap'
import { ZcapClient } from '../../src/index.js'

/**
 * Generates a fresh `did:key`, constructs a ZcapClient, delegates a root zcap,
 * and returns the structurally-cloneable fields the test asserts on.
 *
 * @returns {Promise<{ parentCapability: string | undefined, controller:
 *   string | undefined, proofPurpose: string | undefined, chainLength:
 *   number }>}
 */
export async function delegateRootZcap() {
  const didKeyDriver = didKey.driver()
  didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })

  const { didDocument, keyPairs } = await didKeyDriver.generate()
  const zcapClient = new ZcapClient({
    SuiteClass: Ed25519Signature2020,
    didDocument,
    keyPairs
  })

  const url = 'https://zcap.example/items'
  const controller = 'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'
  const delegatedZcap = await zcapClient.delegate({
    invocationTarget: url,
    controller
  })

  const proof = delegatedZcap.proof as ICapabilityDelegationProof
  return {
    parentCapability: delegatedZcap.parentCapability,
    controller: delegatedZcap.controller,
    proofPurpose: proof.proofPurpose,
    chainLength: (proof.capabilityChain as unknown[]).length
  }
}
