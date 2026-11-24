/*!
 * Copyright (c) 2020-2026 Digital Bazaar, Inc. All
 * rights reserved.
 */
import { gunzipSync } from 'node:zlib'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import type { HttpClientOptions } from '@interop/http-client'
import { ZcapClient, checkDereferencedTarget } from '../../src/index.js'

let capturedUrl: string | undefined
let capturedOptions: HttpClientOptions | undefined

// Replace the real http client with a stub that records the outgoing
// request instead of sending it over the network.
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

const DID_TARGET =
  'did:webvh:QmfGEUAcMpzo25kF2Rhn8L5FAXysfGnkzjwdKoNPi615XQ:zcap.example' +
  '/space/abc/'
const HTTPS_TARGET = 'https://zcap.example/space/abc/'
const DID_ROOT_ID = `urn:zcap:root:${encodeURIComponent(DID_TARGET)}`

/**
 * Builds a client plus a hook that records its calls and returns `result`.
 *
 * @param [options] {object} - The options to use.
 * @param [options.result] {string} - The URL the hook returns.
 *
 * @returns {Promise<object>} The client, its DID Document, the hook and the
 *   targets the hook was called with.
 */
async function createDidUrlClient({
  result = HTTPS_TARGET
}: { result?: string } = {}) {
  const { didDocument, keyPairs } = await didKeyDriver.generate()
  const zcapClient = new ZcapClient({
    SuiteClass: Ed25519Signature2020,
    didDocument,
    keyPairs
  })
  const hookCalls: string[] = []
  async function dereferenceTarget({
    invocationTarget
  }: {
    invocationTarget: string
  }): Promise<string> {
    hookCalls.push(invocationTarget)
    return result
  }
  return { zcapClient, didDocument, dereferenceTarget, hookCalls }
}

/**
 * Reads the `capability-invocation` header of the captured request.
 *
 * @returns {string} The header value.
 */
function capturedInvocationHeader(): string {
  const headers = capturedOptions?.headers as Record<string, string>
  return headers['capability-invocation'] as string
}

describe('ZcapClient DID URL invocation targets', () => {
  beforeEach(() => {
    capturedUrl = undefined
    capturedOptions = undefined
  })

  describe('request', () => {
    it('should invoke a DID root zcap string at an https url', async () => {
      const { zcapClient, dereferenceTarget, hookCalls } =
        await createDidUrlClient()

      await zcapClient.request({
        url: HTTPS_TARGET,
        capability: DID_ROOT_ID,
        dereferenceTarget
      })

      expect(hookCalls).toEqual([DID_TARGET])
      expect(capturedUrl).toBe(HTTPS_TARGET)
      expect(capturedInvocationHeader()).toBe(
        `zcap id="${DID_ROOT_ID}",action="GET"`
      )
    })

    it('should invoke a DID-target delegated zcap at a url beneath the dereferenced target', async () => {
      const { zcapClient, didDocument, dereferenceTarget, hookCalls } =
        await createDidUrlClient()
      const delegatedZcap = await zcapClient.delegate({
        invocationTarget: DID_TARGET,
        controller: didDocument.id
      })
      const url = `${HTTPS_TARGET}collection/doc?limit=2`

      await zcapClient.request({
        url,
        capability: delegatedZcap,
        dereferenceTarget
      })

      expect(hookCalls).toEqual([DID_TARGET])
      expect(capturedUrl).toBe(url)
      // the capability sent is the DID-form one, unchanged
      const [, encoded] = /^zcap capability="([^"]+)"/.exec(
        capturedInvocationHeader()
      )!
      const sent: unknown = JSON.parse(
        gunzipSync(Buffer.from(encoded!, 'base64url')).toString('utf8')
      )
      expect(sent).toEqual(delegatedZcap)
      expect(delegatedZcap.invocationTarget).toBe(DID_TARGET)
    })

    it('should require "url" for a DID URL target', async () => {
      const { zcapClient, dereferenceTarget, hookCalls } =
        await createDidUrlClient()

      await expect(
        zcapClient.request({ capability: DID_ROOT_ID, dereferenceTarget })
      ).rejects.toThrow(
        `"url" is required when the capability's "invocationTarget" is a ` +
          'DID URL.'
      )
      expect(hookCalls).toEqual([])
      expect(capturedUrl).toBeUndefined()
    })

    it('should require "dereferenceTarget" for a DID URL target', async () => {
      const { zcapClient, didDocument } = await createDidUrlClient()
      const delegatedZcap = await zcapClient.delegate({
        invocationTarget: DID_TARGET,
        controller: didDocument.id
      })

      for (const capability of [DID_ROOT_ID, delegatedZcap]) {
        await expect(
          zcapClient.request({ url: HTTPS_TARGET, capability })
        ).rejects.toThrow(
          `"dereferenceTarget" is required when the capability's ` +
            '"invocationTarget" is a DID URL.'
        )
      }
      expect(capturedUrl).toBeUndefined()
    })

    it('should refuse a url outside the dereferenced target', async () => {
      const { zcapClient, dereferenceTarget } = await createDidUrlClient()

      for (const url of [
        'https://zcap.example/space/abc-evil/',
        'https://zcap.example/space/abc',
        'https://other.example/space/abc/',
        `${HTTPS_TARGET}../other`
      ]) {
        await expect(
          zcapClient.request({
            url,
            capability: DID_ROOT_ID,
            dereferenceTarget
          })
        ).rejects.toThrow(
          `The capability's "invocationTarget" (${DID_TARGET}), ` +
            `dereferenced to (${HTTPS_TARGET}), must be a RESTful prefix of ` +
            '"url" or equal to "url".'
        )
      }
      expect(capturedUrl).toBeUndefined()
    })

    it('should refuse a dereferenced target with a query or fragment', async () => {
      for (const result of [
        `${HTTPS_TARGET}?versionId=1`,
        `${HTTPS_TARGET}#key-1`
      ]) {
        const { zcapClient, dereferenceTarget } = await createDidUrlClient({
          result
        })

        await expect(
          zcapClient.request({
            url: result,
            capability: DID_ROOT_ID,
            dereferenceTarget
          })
        ).rejects.toThrow(
          `Dereferenced capability target (${result}) must consume the DID ` +
            "URL's selectors and have no query or fragment."
        )
      }
      expect(capturedUrl).toBeUndefined()
    })

    it('should allow an http dereferenced target on a loopback host', async () => {
      for (const result of [
        'http://localhost:3000/space/abc/',
        'http://app.localhost/space/abc/',
        'http://127.0.0.1:3000/space/abc/',
        'http://127.0.1.1:3000/space/abc/',
        'http://localhost.:3000/space/abc/',
        'http://[::1]:3000/space/abc/'
      ]) {
        const { zcapClient, dereferenceTarget } = await createDidUrlClient({
          result
        })
        const url = `${result}doc`

        await zcapClient.request({
          url,
          capability: DID_ROOT_ID,
          dereferenceTarget
        })

        expect(capturedUrl).toBe(url)
      }
    })

    it('should refuse a dereferenced target that is not https', async () => {
      for (const result of [
        'http://zcap.example/space/abc/',
        'http://localhost.evil.example/space/abc/',
        'http://localhost@evil.example/space/abc/',
        'http://128.0.0.1/space/abc/',
        'https://',
        'https:///space/abc/',
        'https://\\evil.example/space/abc/',
        'https://zcap.example@evil.example/space/abc/',
        DID_TARGET
      ]) {
        const { zcapClient, dereferenceTarget } = await createDidUrlClient({
          result
        })

        await expect(
          zcapClient.request({
            url: result,
            capability: DID_ROOT_ID,
            dereferenceTarget
          })
        ).rejects.toThrow(
          `Dereferenced capability target (${result}) must be an HTTPS ` +
            'URL, or an HTTP URL on a loopback host.'
        )
      }
      expect(capturedUrl).toBeUndefined()
    })

    it('should not call the hook for a capability with an https target', async () => {
      const { zcapClient, didDocument, dereferenceTarget, hookCalls } =
        await createDidUrlClient()
      const delegatedZcap = await zcapClient.delegate({
        invocationTarget: HTTPS_TARGET,
        controller: didDocument.id
      })
      const rootId = `urn:zcap:root:${encodeURIComponent(HTTPS_TARGET)}`

      await zcapClient.request({ url: HTTPS_TARGET, dereferenceTarget })
      await zcapClient.request({ capability: rootId, dereferenceTarget })
      await zcapClient.request({
        url: `${HTTPS_TARGET}doc`,
        capability: delegatedZcap,
        dereferenceTarget
      })

      expect(hookCalls).toEqual([])
      expect(capturedUrl).toBe(`${HTTPS_TARGET}doc`)
    })

    it('should still refuse a root zcap string with a non-DID, non-https target', async () => {
      const { zcapClient, dereferenceTarget, hookCalls } =
        await createDidUrlClient()

      await expect(
        zcapClient.request({
          url: HTTPS_TARGET,
          capability: `urn:zcap:root:${encodeURIComponent('http://zcap.example/space/abc/')}`,
          dereferenceTarget
        })
      ).rejects.toThrow(
        'authorization capability with an HTTPS or DID URL invocation target.'
      )
      expect(hookCalls).toEqual([])
    })
  })

  describe('delegate', () => {
    it('should narrow a DID-target zcap by path', async () => {
      const { zcapClient, didDocument } = await createDidUrlClient()
      const parent = await zcapClient.delegate({
        invocationTarget: DID_TARGET,
        controller: didDocument.id
      })

      const child = await zcapClient.delegate({
        capability: parent,
        invocationTarget: `${DID_TARGET}collection/`,
        controller: didDocument.id
      })

      expect(parent.parentCapability).toBe(DID_ROOT_ID)
      expect(child.parentCapability).toBe(parent.id)
      expect(child.invocationTarget).toBe(`${DID_TARGET}collection/`)
    })

    it('should refuse to mix https and DID URL targets', async () => {
      const { zcapClient, didDocument } = await createDidUrlClient()
      const didParent = await zcapClient.delegate({
        invocationTarget: DID_TARGET,
        controller: didDocument.id
      })
      const httpsParent = await zcapClient.delegate({
        invocationTarget: HTTPS_TARGET,
        controller: didDocument.id
      })

      for (const { capability, invocationTarget } of [
        { capability: didParent, invocationTarget: `${HTTPS_TARGET}doc` },
        { capability: httpsParent, invocationTarget: `${DID_TARGET}doc` }
      ]) {
        await expect(
          zcapClient.delegate({
            capability,
            invocationTarget,
            controller: didDocument.id
          })
        ).rejects.toThrow(
          'The "invocationTarget" in a delegated capability must not be ' +
            'less restrictive than its parent.'
        )
      }
    })
  })
})

describe('checkDereferencedTarget', () => {
  it('should accept an https URL and an http URL on a loopback host', () => {
    for (const dereferencedTarget of [
      'https://pws.example/space/s1/',
      'http://localhost:3000/space/s1/'
    ]) {
      expect(() =>
        checkDereferencedTarget({ dereferencedTarget })
      ).not.toThrow()
    }
  })

  it('should refuse any other result with a TypeError', () => {
    for (const dereferencedTarget of [
      'http://pws.example/space/s1/',
      'did:example:123/space/s1/',
      'https://pws.example/space/s1/?versionId=1',
      'https://pws.example/space/s1/#key-1',
      undefined
    ]) {
      expect(() => checkDereferencedTarget({ dereferencedTarget })).toThrow(
        TypeError
      )
    }
  })
})
