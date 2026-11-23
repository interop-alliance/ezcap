/*!
 * Copyright (c) 2021-2026 Digital Bazaar, Inc. All rights
 * reserved.
 */
import {
  CapabilityDelegation,
  constants as zCapConstants,
  documentLoader as zcapDocumentLoader,
  extendDocumentLoader,
  isValidTarget
} from '@interop/zcap'
import { DEFAULT_HEADERS, httpClient } from '@interop/http-client'
import type { HttpClientOptions, HttpResponse } from '@interop/http-client'
import jsigs from '@interop/jsonld-signatures'
import type { SignatureSuiteClass } from '@interop/data-integrity-proof'
import type {
  AbstractKeyPair,
  IDidDocument,
  ISigner
} from '@interop/data-integrity-core'
import type { IDocumentLoader } from '@interop/data-integrity-core/loader'
import type {
  ICapabilityDelegationProof,
  ICaveat,
  IDelegatedZcap,
  IZcap
} from '@interop/data-integrity-core/zcap'
import { signCapabilityInvocation } from '@interop/http-signature-zcap-invoke'
import { generateZcapUri, getCapabilitySigners } from './util.js'

const { ZCAP_ROOT_PREFIX, ZCAP_CONTEXT_URL } = zCapConstants

/**
 * An object that manages connection persistence and reuse for HTTPS requests.
 *
 * @see https://nodejs.org/api/https.html#https_class_https_agent
 */
export type HttpsAgent = object

export interface ZcapClientOptions {
  /** The LD signature suite class to use to sign requests and delegations. */
  SuiteClass: SignatureSuiteClass
  /**
   * A DID Document that contains `capabilityInvocation` and
   * `capabilityDelegation` verification relationships; `didDocument` and
   * `keyPairs`, or `invocationSigner` and `delegationSigner` must be
   * provided in order to invoke or delegate zcaps, respectively.
   */
  didDocument?: IDidDocument
  /**
   * A map of key pairs associated with `didDocument` indexed by key ID;
   * `didDocument` and `keyPairs`, or `invocationSigner` and
   * `delegationSigner` must be provided in order to invoke or delegate
   * zcaps, respectively. Each value must expose a `.signer()` factory.
   */
  keyPairs?: Map<string, AbstractKeyPair>
  /**
   * A signer with `.sign()` and `id` used for delegating zcaps;
   * `delegationSigner` or `didDocument` and `keyPairs` must be provided to
   * delegate zcaps.
   */
  delegationSigner?: ISigner
  /**
   * A signer with `.sign()` and `id` used for signing requests;
   * `invocationSigner` or `didDocument` and `keyPairs` must be provided to
   * invoke zcaps.
   */
  invocationSigner?: ISigner
  /** An optional HttpsAgent to use when performing HTTPS requests. */
  agent?: HttpsAgent
  /** Optional default HTTP headers to include in every invocation request. */
  defaultHeaders?: Record<string, string>
  /**
   * Optional document loader to load suite-related contexts. If none is
   * provided, one will be auto-generated if the suite class expresses its
   * required context.
   */
  documentLoader?: IDocumentLoader
}

export interface DelegateOptions {
  /**
   * The parent capability to delegate; must be an object if it is a delegated
   * zcap, can be a string if it is a root zcap but then `invocationTarget`
   * must be specified; if not specified, this will be auto-generated as a
   * root zcap for the given `invocationTarget`.
   */
  capability?: string | IZcap
  /** The URL identifying the entity to delegate to. */
  controller: string
  /**
   * Optional invocation target to use when narrowing a `capability`'s
   * existing invocationTarget. Default is to use
   * `capability.invocationTarget`.
   */
  invocationTarget?: string
  /**
   * Optional expiration value for the delegation. Default is 5 minutes after
   * `Date.now()`.
   */
  expires?: string | Date
  /**
   * Optional list of allowed actions or string specifying allowed delegated
   * action. Default: [] - delegate all actions.
   */
  allowedActions?: string | string[]
  /**
   * Optional caveat or list of caveats that restrict the delegated zcap. Each
   * is an object with a non-empty string `type`. A verifier refuses a zcap
   * that carries a caveat type it does not support. Default: no caveats.
   */
  caveats?: ICaveat | ICaveat[]
  /** Optional timestamp (ms) for the current time; useful for testing. */
  now?: number
}

export interface RequestOptions {
  /**
   * The URL to invoke the Authorization Capability against; if not provided,
   * a `capability` must be provided instead.
   */
  url?: string
  /**
   * The capability to invoke at the given URL. Default: generate root
   * capability from options.url.
   */
  capability?: string | IZcap
  /** The HTTP method to use when accessing the resource. Default: 'GET'. */
  method?: string
  /** The capability action that is being invoked. Default: same as method. */
  action?: string
  /** Additional headers to sign and send along with the HTTP request. */
  headers?: Record<string, string>
  /** The JSON object, if any, to send with the request. */
  json?: object
  /** A non-JSON body to send with the request (file uploads, PDFs, etc.). */
  body?: Blob | Uint8Array
  /**
   * Maps a `did:` capability target to the https URL it dereferences to.
   * Required when the capability's invocation target is a DID URL, and not
   * called otherwise. The result must be an https URL (or an http URL on a
   * loopback host such as `localhost`) with no query or fragment. `url` must
   * then be equal to it or beneath it.
   */
  dereferenceTarget?: (options: { invocationTarget: string }) => Promise<string>
}

export interface ReadOptions {
  /** The URL to invoke the Authorization Capability against. */
  url: string
  /** Additional headers to sign and send along with the HTTP request. */
  headers?: Record<string, string>
  /**
   * The capability to invoke at the given URL. Default: generate root
   * capability from options.url.
   */
  capability?: string | IZcap
}

export interface WriteOptions {
  /** The URL to invoke the Authorization Capability against. */
  url: string
  /** The JSON object, if any, to send with the request. */
  json?: object
  /** A non-JSON body to send with the request (file uploads, PDFs, etc.). */
  body?: Blob | Uint8Array
  /** Additional headers to sign and send along with the HTTP request. */
  headers?: Record<string, string>
  /**
   * The capability to invoke at the given URL. Default: generate root
   * capability from options.url.
   */
  capability?: string | IZcap
}

/**
 * A client for performing HTTP requests authorized via Authorization
 * Capabilities (zcaps): delegating zcaps and invoking them against zcap-
 * protected HTTP servers in both the browser and Node.js.
 */
export class ZcapClient {
  agent?: HttpsAgent
  defaultHeaders: Record<string, string>
  SuiteClass: SignatureSuiteClass
  invocationSigner?: ISigner
  delegationSigner?: ISigner
  documentLoader: IDocumentLoader

  /**
   * Creates a new ZcapClient instance that can be used to perform requests
   * against HTTP URLs that are authorized via Authorization Capabilities
   * (zcaps).
   *
   * @param options {ZcapClientOptions} - The options to use.
   */
  constructor({
    SuiteClass,
    didDocument,
    keyPairs,
    delegationSigner,
    invocationSigner,
    agent,
    defaultHeaders = {},
    documentLoader
  }: ZcapClientOptions) {
    if (!SuiteClass) {
      throw new TypeError('"SuiteClass" must be provided.')
    }

    this.agent = agent
    this.defaultHeaders = { ...DEFAULT_HEADERS, ...defaultHeaders }
    this.SuiteClass = SuiteClass

    // set the appropriate invocation and delegation signers
    if (didDocument && keyPairs) {
      const signers = getCapabilitySigners({ didDocument, keyPairs })
      this.invocationSigner = signers.invocationSigner
      this.delegationSigner = signers.delegationSigner
    } else if (invocationSigner || delegationSigner) {
      this.invocationSigner = invocationSigner
      this.delegationSigner = delegationSigner
    } else {
      throw new TypeError(
        'Either `didDocument` and `keyPairs`, or `invocationSigner` and/or ' +
          '`delegationSigner` must be provided.'
      )
    }

    // auto generate doc loader as needed if suite context is provided
    if (!documentLoader && SuiteClass.CONTEXT && SuiteClass.CONTEXT_URL) {
      const suiteContext = SuiteClass.CONTEXT as object
      const suiteContextUrl = SuiteClass.CONTEXT_URL
      documentLoader = extendDocumentLoader(async function suiteContextLoader(
        url: string
      ) {
        if (url === suiteContextUrl) {
          return {
            contextUrl: null,
            document: suiteContext,
            documentUrl: url,
            tag: 'static'
          }
        }
        return jsigs.strictDocumentLoader(url)
      })
    }
    this.documentLoader = documentLoader ?? zcapDocumentLoader
  }

  /**
   * Delegates an Authorization Capability to a target delegate.
   *
   * @param options {DelegateOptions} - The options to use.
   *
   * @returns {Promise<IDelegatedZcap>} - A promise that resolves to a
   *   delegated capability.
   */
  async delegate({
    capability,
    controller,
    invocationTarget,
    expires,
    allowedActions,
    caveats,
    now = Date.now()
  }: DelegateOptions): Promise<IDelegatedZcap> {
    if (!(typeof controller === 'string' && controller.includes(':'))) {
      throw new Error(
        '"controller" must be a string expressing an absolute URI.'
      )
    }
    if (!this.delegationSigner) {
      throw new Error('"delegationSigner" was not provided in constructor.')
    }
    const delegationSigner = this.delegationSigner
    if (
      invocationTarget !== undefined &&
      !(typeof invocationTarget === 'string' && invocationTarget.includes(':'))
    ) {
      throw new Error(
        '"invocationTarget" must be a string expressing an absolute URI.'
      )
    }

    if (!(capability || invocationTarget)) {
      throw new TypeError(
        'At least one of "capability" and "invocationTarget" is required.'
      )
    }

    let expiresValue: string
    if (expires === undefined) {
      // default expiration is 5 minutes in the future
      expiresValue =
        new Date(now + 5 * 60 * 1000).toISOString().slice(0, -5) + 'Z'
    } else if (expires instanceof Date) {
      if (isNaN(expires.getTime())) {
        throw new Error('"expires" is not a valid date.')
      }
      // use second precision
      expiresValue = expires.toISOString().slice(0, -5) + 'Z'
    } else if (typeof expires === 'string') {
      // ensure expires is a valid date; keep the supplied string verbatim
      if (isNaN(Date.parse(expires))) {
        throw new Error('"expires" is not a valid date.')
      }
      expiresValue = expires
    } else {
      throw new TypeError('"expires" must be a string or a date.')
    }

    if (!capability) {
      // generate root zcap ID from `invocationTarget`
      capability = await generateZcapUri({ url: invocationTarget })
    }

    let parentCapability: string
    if (typeof capability === 'string') {
      parentCapability = capability
    } else if (typeof capability.id === 'string') {
      parentCapability = capability.id
    } else {
      throw new TypeError(
        '"capability" must be a string to delegate a root capability or ' +
          'a capability object to delegate a delegated capability.'
      )
    }

    if (invocationTarget === undefined) {
      if (typeof capability === 'string') {
        throw new Error(
          '"invocationTarget" must be specified when "capability" is ' +
            'a string.'
        )
      }
      // inherit `capability` invocation target
      invocationTarget = capability.invocationTarget
    }

    if (typeof invocationTarget !== 'string') {
      throw new TypeError('"invocationTarget" must be a string.')
    }

    // default `allowedActions` to parent zcap's
    let allowedActionsValue: string | string[] | undefined = allowedActions
    if (allowedActionsValue === undefined) {
      if (typeof capability === 'string' || !('allowedAction' in capability)) {
        allowedActionsValue = []
      } else {
        allowedActionsValue = capability.allowedAction ?? []
      }
    }

    if (typeof allowedActionsValue === 'string') {
      // convert string value for allowedActions to array
      allowedActionsValue = [allowedActionsValue]
    }
    if (!Array.isArray(allowedActionsValue)) {
      throw new TypeError(
        '"allowedActions" must be a string or an array of strings.'
      )
    }

    // the caveats of the parent zcap are not copied; a verifier collects the
    // caveats of every zcap in the chain
    const caveatsValue = caveats === undefined ? [] : [caveats].flat()
    for (const caveat of caveatsValue) {
      if (!(
        caveat &&
        typeof caveat === 'object' &&
        typeof caveat.type === 'string' &&
        caveat.type.length > 0
      )) {
        throw new TypeError(
          '"caveats" must be an object or an array of objects, each with a ' +
            'non-empty string "type".'
        )
      }
    }

    const delegatedCapability: Record<string, unknown> = {
      '@context': ZCAP_CONTEXT_URL,
      id: await generateZcapUri(),
      controller,
      parentCapability,
      invocationTarget,
      expires: expiresValue
    }
    if (allowedActionsValue.length > 0) {
      delegatedCapability.allowedAction = allowedActionsValue
    }
    if (caveatsValue.length > 0) {
      delegatedCapability.caveat = caveatsValue
    }

    // ensure delegation date will not be at least after parent delegation date
    let date = new Date(now)
    const [parentProof] = _getDelegationProofs({ capability })
    if (parentProof?.created) {
      const parentDelegationDate = new Date(parentProof.created)
      if (date < parentDelegationDate) {
        date = parentDelegationDate
      }
    }

    const { documentLoader } = this
    const suite = new this.SuiteClass({ date, signer: delegationSigner })
    // `parentCapability` must be the full object (when not delegating a root
    // zcap) so the capability chain can be auto-computed; the local
    // `parentCapability` string above holds only the id value.
    const purpose = new CapabilityDelegation({
      parentCapability: capability
    })

    const signedDelegatedCapability = await jsigs.sign(delegatedCapability, {
      documentLoader,
      suite,
      purpose
    })

    return signedDelegatedCapability as IDelegatedZcap
  }

  /**
   * Performs an HTTP request given an Authorization Capability (zcap) and/or
   * a target URL. If no URL is given, the invocation target from the
   * capability will be used. If a capability is given as a string, it MUST
   * be a root capability. If both a capability and a URL are given, then
   * the capability's invocation target MUST be a RESTful prefix of or
   * equivalent to the URL. If the capability's invocation target is a DID URL,
   * both a URL and a `dereferenceTarget` hook MUST be given, and the URL is
   * checked against the https URL the hook returns.
   *
   * @param options {RequestOptions} - The options to use.
   *
   * @returns {Promise<HttpResponse>} - A promise that resolves to an HTTP
   *   response.
   */
  async request({
    url,
    capability,
    method = 'GET',
    action,
    headers = {},
    json,
    body,
    dereferenceTarget
  }: RequestOptions): Promise<HttpResponse> {
    if (!this.invocationSigner) {
      throw new Error('"invocationSigner" was not provided in constructor.')
    }
    const invocationSigner = this.invocationSigner
    // By default, set the action to be the same as the HTTP method if missing
    const capabilityAction = action ?? method

    // get invocation target from zcap
    let invocationTarget: string | undefined
    if (typeof capability === 'string') {
      // capability MUST be a root zcap
      if (!capability.startsWith(ZCAP_ROOT_PREFIX)) {
        throw new Error(
          'When "capability" is a string, it must be a root authorization ' +
            'capability.'
        )
      }
      invocationTarget = decodeURIComponent(
        capability.substring(ZCAP_ROOT_PREFIX.length)
      )
      if (
        !invocationTarget.startsWith('did:') &&
        !invocationTarget.startsWith('https://')
      ) {
        throw new Error(
          'When "capability" is a string, it must be a root ' +
            'authorization capability with an HTTPS or DID URL invocation ' +
            'target.'
        )
      }
    } else if (capability !== undefined) {
      try {
        _checkZcap({ capability })
      } catch (cause) {
        throw new Error(
          '"capability" must be a valid authorization capability object.',
          { cause }
        )
      }
      invocationTarget = capability.invocationTarget
    }

    // a DID URL target is not a request URL; the request goes to `url`, which
    // is checked against the https URL the DID URL dereferences to
    let baseInvocationTarget = invocationTarget
    if (invocationTarget?.startsWith('did:')) {
      if (url === undefined) {
        throw new TypeError(
          `"url" is required when the capability's "invocationTarget" is a ` +
            'DID URL.'
        )
      }
      if (typeof dereferenceTarget !== 'function') {
        throw new TypeError(
          '"dereferenceTarget" is required when the capability\'s ' +
            '"invocationTarget" is a DID URL.'
        )
      }
      baseInvocationTarget = await dereferenceTarget({ invocationTarget })
      _checkDereferencedTarget({ dereferencedTarget: baseInvocationTarget })
    }

    // set `url` to invocation target if not given
    if (url === undefined) {
      if (invocationTarget === undefined) {
        throw new TypeError('If no "url" is given, "capability" must be given.')
      }
      url = invocationTarget
    } else if (baseInvocationTarget !== undefined) {
      // if `url` and `capability` are both given, then `invocationTarget`
      // MUST be a RESTful prefix for `url` or equivalent to it to avoid
      // confused deputy (don't invoke zcaps against URLs that are in different
      // authority heirarchies). Same rule as the server-side verifier.
      if (
        !isValidTarget({
          invocationTarget: url,
          baseInvocationTarget,
          allowTargetAttenuation: true
        })
      ) {
        if (baseInvocationTarget !== invocationTarget) {
          throw new TypeError(
            `The capability's "invocationTarget" (${invocationTarget}), ` +
              `dereferenced to (${baseInvocationTarget}), must be a RESTful ` +
              'prefix of "url" or equal to "url".'
          )
        }
        throw new TypeError(
          `When "url" and "capability" are both given, the capability's ` +
            '"invocationTarget" must be a RESTful prefix of "url" or equal ' +
            'to "url".'
        )
      }
    }

    const { agent } = this

    // sign the zcap headers
    const signatureHeaders = await signCapabilityInvocation({
      url,
      method,
      headers: {
        ...headers,
        date: new Date().toUTCString()
      },
      json,
      body,
      invocationSigner,
      capability:
        capability !== undefined
          ? (capability as string | IZcap)
          : await generateZcapUri({ url }),
      capabilityAction
    })

    // build the final request
    const options: HttpClientOptions = {
      method,
      agent,
      headers: { ...this.defaultHeaders, ...signatureHeaders }
    }

    // handle blob vs json body
    if (body !== undefined) {
      options.body = body as BodyInit
    } else if (json !== undefined) {
      options.json = json
    }

    return httpClient(url, options)
  }

  /**
   * Convenience function that invokes an Authorization Capability against a
   * given URL to perform a read operation.
   *
   * @param options {ReadOptions} - The options to use.
   *
   * @returns {Promise<HttpResponse>} - A promise that resolves to an HTTP
   *   response.
   */
  async read({
    url,
    headers = {},
    capability
  }: ReadOptions): Promise<HttpResponse> {
    return this.request({
      url,
      capability,
      method: 'get',
      action: 'read',
      headers
    })
  }

  /**
   * Convenience function that invokes an Authorization Capability against a
   * given URL to perform a write operation.
   *
   * @param options {WriteOptions} - The options to use.
   *
   * @returns {Promise<HttpResponse>} - A promise that resolves to an HTTP
   *   response.
   */
  async write({
    url,
    json,
    body,
    headers = {},
    capability
  }: WriteOptions): Promise<HttpResponse> {
    return this.request({
      url,
      capability,
      method: 'post',
      action: 'write',
      headers,
      json,
      body
    })
  }
}

/**
 * Validates the result of a `dereferenceTarget` hook for a DID URL target. The
 * result must be an https URL, or an http URL on a loopback host (for local
 * development). The dereference consumes the DID URL's selectors, so the result
 * carries no query or fragment.
 *
 * @param options {object} - The options to use.
 * @param options.dereferencedTarget {unknown} - The hook's result.
 */
function _checkDereferencedTarget({
  dereferencedTarget
}: {
  dereferencedTarget: unknown
}): void {
  if (
    typeof dereferencedTarget !== 'string' ||
    !_isSecureOrLoopbackUrl({ url: dereferencedTarget })
  ) {
    throw new TypeError(
      `Dereferenced capability target (${String(dereferencedTarget)}) must ` +
        'be an HTTPS URL, or an HTTP URL on a loopback host.'
    )
  }
  if (/[?#]/.test(dereferencedTarget)) {
    throw new TypeError(
      `Dereferenced capability target (${dereferencedTarget}) must consume ` +
        "the DID URL's selectors and have no query or fragment."
    )
  }
}

/**
 * Checks that a URL is https, or is http on a loopback host (`localhost`, a
 * `.localhost` subdomain, a `127.0.0.0/8` address, or `[::1]`). The URL must
 * parse, have a host, and carry no userinfo.
 *
 * @param options {object} - The options to use.
 * @param options.url {string} - The URL to check.
 *
 * @returns {boolean} `true` if the URL's scheme and host are acceptable.
 */
function _isSecureOrLoopbackUrl({ url }: { url: string }): boolean {
  // the authority must be present in the string itself; the URL parser skips
  // extra slashes and would read a host out of the path
  if (!/^https?:\/\/[^/\\?#]/.test(url)) {
    return false
  }
  const isHttps = url.startsWith('https://')
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return false
  }
  if (
    parsedUrl.hostname === '' ||
    parsedUrl.username !== '' ||
    parsedUrl.password !== ''
  ) {
    return false
  }
  if (isHttps) {
    return true
  }
  // a fully qualified name may end in a dot
  const hostname = parsedUrl.hostname.replace(/\.$/, '')
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    /^127(\.\d{1,3}){3}$/.test(hostname) ||
    hostname === '[::1]'
  )
}

/**
 * Validates that a capability object is a well-formed root or delegated zcap.
 *
 * @param options {object} - The options to use.
 * @param options.capability {IZcap} - The authorization capability.
 */
function _checkZcap({ capability }: { capability: IZcap }): void {
  const { '@context': context, id, invocationTarget } = capability

  if ('parentCapability' in capability) {
    const { parentCapability, allowedAction, expires } = capability
    if (!(Array.isArray(context) && context[0] === ZCAP_CONTEXT_URL)) {
      throw new Error(
        'Delegated capability must have an "@context" array ' +
          `with "${ZCAP_CONTEXT_URL}" in its first position.`
      )
    }
    if (!(
      typeof parentCapability === 'string' && parentCapability.includes(':')
    )) {
      throw new Error(
        'Delegated capability must have a "parentCapability" with a string ' +
          'value that expresses an absolute URI.'
      )
    }
    const [proof] = _getDelegationProofs({ capability })
    if (!proof) {
      throw new Error('Delegated capability must have a "proof".')
    }
    if (isNaN(Date.parse(proof.created ?? ''))) {
      throw new Error(
        'Delegated capability must have a valid proof "created" date.'
      )
    }
    if (expires === undefined || isNaN(Date.parse(expires))) {
      throw new Error('Delegated capability must have a valid expires date.')
    }
    if (
      allowedAction !== undefined &&
      !(
        typeof allowedAction === 'string' ||
        (Array.isArray(allowedAction) && allowedAction.length > 0)
      )
    ) {
      throw new Error(
        'If present on a capability, "allowedAction" must be a string or a ' +
          'non-empty array.'
      )
    }
  } else {
    if (context !== ZCAP_CONTEXT_URL) {
      throw new Error(
        'Root capability must have an "@context" value of ' +
          `"${ZCAP_CONTEXT_URL}".`
      )
    }
    if ('expires' in capability && capability.expires !== undefined) {
      throw new Error('Root capability must not have an "expires" field.')
    }
  }

  if (!(typeof id === 'string' && id.includes(':'))) {
    throw new Error(
      'Capability must have an "id" with a string value that expresses an ' +
        'absolute URI.'
    )
  }
  if (!(
    typeof invocationTarget === 'string' && invocationTarget.includes(':')
  )) {
    throw new Error(
      'Capability must have an "invocationTarget" with a string value that ' +
        'expresses an absolute URI.'
    )
  }
}

/**
 * Retrieves the delegation proof(s) for a capability that is associated with
 * its parent capability. A capability that has no parent or no associated
 * delegation proofs will cause this function to return an empty array.
 *
 * @param options {object} - The options to use.
 * @param options.capability {string|IZcap} - The authorization capability.
 *
 * @returns {ICapabilityDelegationProof[]} Any `capabilityDelegation` proof
 *   objects attached to the given capability.
 */
function _getDelegationProofs({
  capability
}: {
  capability: string | IZcap
}): ICapabilityDelegationProof[] {
  // capability is root or capability has no `proof`, then it has no relevant
  // delegation proofs
  if (typeof capability === 'string' || !('parentCapability' in capability)) {
    return []
  }
  const proof = Array.isArray(capability.proof)
    ? capability.proof
    : [capability.proof]
  return proof.filter(p => p && p.proofPurpose === 'capabilityDelegation')
}
