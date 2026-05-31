/*!
 * Copyright (c) 2021-2026 Digital Bazaar, Inc. and Interop Alliance. All rights
 * reserved.
 */
import { constants } from '@interop/zcap'
import { v4 as uuid } from 'uuid'

const { ZCAP_ROOT_PREFIX } = constants

/**
 * A signer instance with a sign function and id and controller properties.
 */
export interface Signer {
  id: string
  controller: string
  sign(options: { data: Uint8Array }): Promise<Uint8Array>
}

/**
 * A verification method entry in a DID Document, either as a string ID or
 * an embedded object with an `id` property.
 */
export type VerificationMethodReference =
  | string
  | { id: string; [key: string]: unknown }

/**
 * A DID Document containing verification relationships for capability
 * invocation and delegation.
 */
export interface DidDocument {
  id: string
  capabilityInvocation?: VerificationMethodReference[]
  capabilityDelegation?: VerificationMethodReference[]
  [key: string]: unknown
}

/**
 * A cryptographic key pair with a signer factory method.
 */
export interface KeyPair {
  signer(): Signer
  [key: string]: unknown
}

/**
 * A pair of signers derived from a DID Document and key pairs.
 */
export interface CapabilitySigners {
  invocationSigner?: Signer
  delegationSigner?: Signer
}

/**
 * Retrieves the first set of capability invocation and delegation signers
 * associated with the `didDocument` from the `keyPairs`.
 *
 * @param options {object} - The options to use.
 * @param options.didDocument {DidDocument} - A DID Document containing
 *   verification relationships for capability invocation and delegation.
 * @param options.keyPairs {Map} - A map containing keypairs indexed by key ID.
 *
 * @returns {CapabilitySigners} - A valid `invocationSigner` and
 *   `delegationSigner` associated with the didDocument.
 */
export function getCapabilitySigners({
  didDocument,
  keyPairs
}: {
  didDocument: DidDocument
  keyPairs: Map<string, KeyPair>
}): CapabilitySigners {
  const { capabilityDelegation, capabilityInvocation } = didDocument

  // ensure didDocument and keyPairs contain the information necessary
  if (!(capabilityDelegation || capabilityInvocation)) {
    throw new Error(
      'didDocument must include "capabilityInvocation" or ' +
        '"capabilityDelegation" properties.'
    )
  }

  const capabilityDelegationId = _verificationMethodId(
    capabilityDelegation?.[0]
  )
  const capabilityInvocationId = _verificationMethodId(
    capabilityInvocation?.[0]
  )

  if (capabilityDelegation && !capabilityDelegationId) {
    throw new Error(
      'Could not determine didDocument capabilityDelegation identifier.'
    )
  }
  if (capabilityInvocation && !capabilityInvocationId) {
    throw new Error(
      'Could not determine didDocument capabilityInvocation identifier.'
    )
  }

  let delegationKeyPair: KeyPair | undefined
  if (capabilityDelegationId) {
    delegationKeyPair = keyPairs.get(capabilityDelegationId)
  }

  let invocationKeyPair: KeyPair | undefined
  if (capabilityInvocationId) {
    invocationKeyPair = keyPairs.get(capabilityInvocationId)
  }

  if (!(delegationKeyPair || invocationKeyPair)) {
    throw new Error(
      `didDocument keyPairs contains neither capabilityDelegation key ` +
        `(${capabilityDelegationId}) nor capabilityInvocation key ` +
        `(${capabilityInvocationId}).`
    )
  }

  let delegationSigner: Signer | undefined
  if (delegationKeyPair && capabilityDelegationId) {
    delegationSigner = delegationKeyPair.signer()
    delegationSigner.id = capabilityDelegationId
    delegationSigner.controller = didDocument.id
  }

  let invocationSigner: Signer | undefined
  if (invocationKeyPair && capabilityInvocationId) {
    invocationSigner = invocationKeyPair.signer()
    invocationSigner.id = capabilityInvocationId
    invocationSigner.controller = didDocument.id
  }

  return { invocationSigner, delegationSigner }
}

/**
 * Generate a zcap URI given a root capability URL or a delegated flag.
 *
 * @param options {object} - The options to use.
 * @param [options.url] {string} - Optional URL identifying the root capability.
 *
 * @returns {Promise<string>} - A zcap URI.
 */
export async function generateZcapUri({
  url
}: { url?: string } = {}): Promise<string> {
  if (url) {
    return `${ZCAP_ROOT_PREFIX}${encodeURIComponent(url)}`
  }
  return `urn:uuid:${uuid()}`
}

/**
 * Resolves a verification method reference to its string id.
 *
 * @param verificationMethod {VerificationMethodReference} - A string id or an
 *   embedded verification method object.
 *
 * @returns {string|undefined} - The verification method id, if any.
 */
function _verificationMethodId(
  verificationMethod: VerificationMethodReference | undefined
): string | undefined {
  if (verificationMethod === undefined) {
    return undefined
  }
  return typeof verificationMethod === 'string'
    ? verificationMethod
    : verificationMethod.id
}
