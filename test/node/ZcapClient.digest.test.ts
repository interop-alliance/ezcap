/*!
 * Copyright (c) 2020-2026 Digital Bazaar, Inc. All
 * rights reserved.
 */
import { describe, it, expect, vi } from 'vitest'
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import type { HttpClientOptions } from '@interop/http-client'
import { getCapabilitySigners, ZcapClient } from '../../src/index.js'

let capturedUrl: string | undefined
let capturedOptions: HttpClientOptions | undefined

// Replace the real http client with a stub that records the outgoing
// request instead of sending it over the network. This lets the test
// inspect exactly what `ZcapClient.request()` handed off -- the headers
// (including `digest`) and the body reference -- without a real server.
vi.mock('@interop/http-client', async importOriginal => {
  const actual = await importOriginal<typeof import('@interop/http-client')>()
  return {
    ...actual,
    httpClient: async (url: string, options?: HttpClientOptions) => {
      capturedUrl = url
      capturedOptions = options
      return new Response(null, { status: 200 })
    }
  }
})

const didKeyDriver = didKey.driver()
didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })

/**
 * A `Blob` subclass whose body-reading methods throw, used to prove that
 * `ZcapClient.request()` never reads the body when a `digest` header has
 * already been supplied by the caller (e.g. computed incrementally for a
 * large upload).
 */
class ThrowingBlob extends Blob {
  arrayBuffer(): Promise<ArrayBuffer> {
    throw new Error('must not read body: arrayBuffer() called')
  }

  bytes(): Promise<Uint8Array> {
    throw new Error('must not read body: bytes() called')
  }

  stream(): ReadableStream<Uint8Array> {
    throw new Error('must not read body: stream() called')
  }

  text(): Promise<string> {
    throw new Error('must not read body: text() called')
  }
}

describe('ZcapClient.request caller-supplied digest', () => {
  it('uses the caller-supplied digest header without reading the body', async () => {
    const { didDocument, keyPairs } = await didKeyDriver.generate()
    const { invocationSigner } = getCapabilitySigners({
      didDocument,
      keyPairs
    })
    const zcapClient = new ZcapClient({
      SuiteClass: Ed25519Signature2020,
      invocationSigner
    })

    const digest = 'mh=uEiBfjwT2o6iSqqu922zyc4lEk3c5YNSjJbEF_uRu70ME8Q'
    const body = new ThrowingBlob(['irrelevant large payload'], {
      type: 'application/octet-stream'
    })

    await zcapClient.request({
      url: 'https://zcap.example/items',
      method: 'PUT',
      body,
      headers: {
        digest,
        'content-type': 'application/octet-stream'
      }
    })

    expect(capturedUrl).toBe('https://zcap.example/items')
    expect(capturedOptions).toBeDefined()
    // the exact `Blob` instance is passed through untouched -- never read
    expect(capturedOptions?.body).toBe(body)

    const headers = capturedOptions?.headers as Record<string, string>
    expect(headers.digest).toBe(digest)

    // the signature must cover the caller-supplied `digest` header
    const headersMatch = headers.authorization.match(/headers="([^"]+)"/)
    expect(headersMatch).toBeTruthy()
    expect(headersMatch?.[1].split(' ')).toContain('digest')
  })
})
