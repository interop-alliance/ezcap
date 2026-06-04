/*!
 * Copyright (c) 2021-2026 Digital Bazaar, Inc. All rights
 * reserved.
 */
import { constants } from '@interop/zcap'
import type {
  AbstractKeyPair,
  IDidDocument,
  ISigner,
  IVerificationMethodEntry
} from '@interop/data-integrity-core'
import { v4 as uuid } from 'uuid'

const { ZCAP_ROOT_PREFIX } = constants

/**
 * A verification method entry in a DID Document, either as a string id or
 * an embedded verification method object.
 */
export type IVerificationMethod = IVerificationMethodEntry

/**
 * A pair of signers derived from a DID Document and key pairs.
 */
export interface CapabilitySigners {
  invocationSigner?: ISigner
  delegationSigner?: ISigner
}

/**
 * Retrieves the first set of capability invocation and delegation signers
 * associated with the `didDocument` from the `keyPairs`.
 *
 * @param options {object} - The options to use.
 * @param options.didDocument {IDidDocument} - A DID Document containing
 *   verification relationships for capability invocation and delegation.
 * @param options.keyPairs {Map} - A map of keypairs (each exposing a
 *   `.signer()` factory) indexed by key ID.
 *
 * @returns {CapabilitySigners} - A valid `invocationSigner` and
 *   `delegationSigner` associated with the didDocument.
 */
export function getCapabilitySigners({
  didDocument,
  keyPairs
}: {
  didDocument: IDidDocument
  keyPairs: Map<string, AbstractKeyPair>
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
    _firstVerificationMethod(capabilityDelegation)
  )
  const capabilityInvocationId = _verificationMethodId(
    _firstVerificationMethod(capabilityInvocation)
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

  let delegationKeyPair: AbstractKeyPair | undefined
  if (capabilityDelegationId) {
    delegationKeyPair = keyPairs.get(capabilityDelegationId)
  }

  let invocationKeyPair: AbstractKeyPair | undefined
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

  // `ISigner` from ssi has no `controller`, but downstream zcap verification
  // expects the signer to carry one (used to match a delegation proof's
  // verification method against the parent zcap's controller).
  type ControllerSigner = ISigner & { controller: string }

  let delegationSigner: ISigner | undefined
  if (delegationKeyPair && capabilityDelegationId) {
    const signer = delegationKeyPair.signer() as ControllerSigner
    signer.id = capabilityDelegationId
    signer.controller = didDocument.id
    delegationSigner = signer
  }

  let invocationSigner: ISigner | undefined
  if (invocationKeyPair && capabilityInvocationId) {
    const signer = invocationKeyPair.signer() as ControllerSigner
    signer.id = capabilityInvocationId
    signer.controller = didDocument.id
    invocationSigner = signer
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
 * Normalizes a verification relationship value (single entry or array) to
 * its first entry.
 */
function _firstVerificationMethod(
  value: IVerificationMethodEntry | IVerificationMethodEntry[] | undefined
): IVerificationMethod | undefined {
  if (value === undefined) {
    return undefined
  }
  return Array.isArray(value) ? value[0] : value
}

/**
 * Resolves a verification method reference to its string id.
 *
 * @param verificationMethod {IVerificationMethod} - A string id or an embedded
 *   verification method object.
 *
 * @returns {string|undefined} - The verification method id, if any.
 */
function _verificationMethodId(
  verificationMethod: IVerificationMethod | undefined
): string | undefined {
  if (verificationMethod === undefined) {
    return undefined
  }
  return typeof verificationMethod === 'string'
    ? verificationMethod
    : verificationMethod.id
}
