/*!
 * Copyright (c) 2020-2026 Digital Bazaar, Inc. and Interop Alliance. All
 * rights reserved.
 */
import { describe, it, expect } from 'vitest'
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'
import {
  getCapabilitySigners,
  ZcapClient,
  type Proof
} from '../../src/index.js'

const didKeyDriver = didKey.driver()
didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })

describe('ZcapClient', () => {
  describe('constructor', () => {
    it('should create a ZcapClient using a didDocument', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        didDocument,
        keyPairs
      })

      expect(zcapClient).toBeDefined()
    })

    it('should create a ZcapClient using signers', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner, delegationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner,
        delegationSigner
      })

      expect(zcapClient).toBeDefined()
    })

    it('should delegate a root zcap', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner, delegationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner,
        delegationSigner
      })
      expect(zcapClient).toBeDefined()

      const url = 'https://zcap.example/items'
      const controller =
        'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'
      const delegatedZcap = await zcapClient.delegate({
        invocationTarget: url,
        controller
      })

      expect(delegatedZcap.parentCapability).toBe(
        'urn:zcap:root:' + encodeURIComponent(url)
      )
      expect(delegatedZcap.controller).toBe(controller)
      const proof = delegatedZcap.proof as Proof
      expect(proof.proofPurpose).toBe('capabilityDelegation')
      expect(proof.capabilityChain).toHaveLength(1)
    })

    it('should throw error if controller is not provided when delegating zcap', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner, delegationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner,
        delegationSigner
      })
      expect(zcapClient).toBeDefined()

      const url = 'https://zcap.example/items'
      let error: unknown
      let delegatedZcap
      try {
        // @ts-expect-error -- intentionally omitting the required `controller`
        delegatedZcap = await zcapClient.delegate({
          invocationTarget: url
        })
      } catch (err) {
        error = err
      }
      expect(delegatedZcap).toBeUndefined()
      expect(error).toBeDefined()
      expect((error as Error).message).toBe(
        '"controller" must be a string expressing an absolute URI.'
      )
    })

    it('should delegate a deeper zcap chain', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner, delegationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner,
        delegationSigner
      })
      expect(zcapClient).toBeDefined()

      // first delegate root zcap
      let delegationDepth1
      {
        const url = 'https://zcap.example/items'
        // delegate to self to allow deeper delegation without needing to
        // create another entity
        const controller = didDocument.id
        const delegatedZcap = await zcapClient.delegate({
          invocationTarget: url,
          controller
        })

        expect(delegatedZcap.parentCapability).toBe(
          'urn:zcap:root:' + encodeURIComponent(url)
        )
        expect(delegatedZcap.controller).toBe(controller)
        const proof = delegatedZcap.proof as Proof
        expect(proof.proofPurpose).toBe('capabilityDelegation')
        expect(proof.capabilityChain).toHaveLength(1)

        delegationDepth1 = delegatedZcap
      }

      // now delegate zcap again, creating a deeper chain
      let delegationDepth2
      {
        // delegate to self to allow deeper delegation without needing to
        // create another entity
        const controller = didDocument.id
        const delegatedZcap = await zcapClient.delegate({
          capability: delegationDepth1,
          controller
        })

        expect(delegatedZcap.parentCapability).toBe(delegationDepth1.id)
        expect(delegatedZcap.controller).toBe(controller)
        const proof = delegatedZcap.proof as Proof
        expect(proof.proofPurpose).toBe('capabilityDelegation')
        expect(proof.capabilityChain).toHaveLength(2)

        delegationDepth2 = delegatedZcap
      }

      // now delegate zcap again, creating a deeper chain
      {
        const controller =
          'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'
        const delegatedZcap = await zcapClient.delegate({
          capability: delegationDepth2,
          controller
        })

        expect(delegatedZcap.parentCapability).toBe(delegationDepth2.id)
        expect(delegatedZcap.controller).toBe(controller)
        const proof = delegatedZcap.proof as Proof
        expect(proof.proofPurpose).toBe('capabilityDelegation')
        expect(proof.capabilityChain).toHaveLength(3)
      }
    })
  })

  describe('ZcapClient.request', () => {
    it('should accept body parameter without throwing', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner
      })

      const body = Buffer.from('hello world')

      // Test that the method accepts a body parameter without throwing a
      // param-validation error. This makes a real network call that fails at
      // the HTTP/DNS level -- which is expected and not a param error.
      let error: unknown
      try {
        await zcapClient.request({
          url: 'https://zcap.example/items',
          method: 'post',
          body
        })
      } catch (err) {
        error = err
      }

      // Should not throw a parameter validation error
      expect(error).toBeDefined()
      const message = (error as Error).message
      expect(message).not.toContain('body')
      expect(message).not.toContain('parameter')
      expect(message).not.toContain('undefined')
    })

    it('should accept both json and body parameters', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner
      })

      const body = Buffer.from('hello world')
      const json = { message: 'test' }

      let error: unknown
      try {
        await zcapClient.request({
          url: 'https://zcap.example/items',
          method: 'post',
          json,
          body
        })
      } catch (err) {
        error = err
      }

      // Should not throw a parameter validation error
      expect(error).toBeDefined()
      const message = (error as Error).message
      expect(message).not.toContain('body')
      expect(message).not.toContain('json')
      expect(message).not.toContain('parameter')
    })

    it('should accept body parameter in write method', async () => {
      const { didDocument, keyPairs } = await didKeyDriver.generate()
      const { invocationSigner } = getCapabilitySigners({
        didDocument,
        keyPairs
      })
      const zcapClient = new ZcapClient({
        SuiteClass: Ed25519Signature2020,
        invocationSigner
      })

      const body = Buffer.from('hello world')

      let error: unknown
      try {
        await zcapClient.write({
          url: 'https://zcap.example/items',
          body
        })
      } catch (err) {
        error = err
      }

      // Should not throw a parameter validation error
      expect(error).toBeDefined()
      const message = (error as Error).message
      expect(message).not.toContain('body')
      expect(message).not.toContain('parameter')
      expect(message).not.toContain('undefined')
    })
  })
})
