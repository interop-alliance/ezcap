/*!
 * Copyright (c) 2026 Interop Alliance. All rights reserved.
 */
import { test, expect } from '@playwright/test'

test('ZcapClient delegates a root zcap in the browser', async ({ page }) => {
  await page.goto('/test/browser/index.html')

  const result = await page.evaluate(async () => {
    const { delegateRootZcap } = await import('./delegate-fixture.ts')
    return delegateRootZcap()
  })

  const url = 'https://zcap.example/items'
  expect(result.parentCapability).toBe(
    'urn:zcap:root:' + encodeURIComponent(url)
  )
  expect(result.controller).toBe(
    'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'
  )
  expect(result.proofPurpose).toBe('capabilityDelegation')
  expect(result.chainLength).toBe(1)
})

test('ZcapClient delegates a root zcap with eddsa-jcs-2022 in the browser', async ({
  page
}) => {
  await page.goto('/test/browser/index.html')

  const result = await page.evaluate(async () => {
    const { delegateRootZcapJcs } = await import('./delegate-fixture.ts')
    return delegateRootZcapJcs()
  })

  const url = 'https://zcap.example/items'
  expect(result.parentCapability).toBe(
    'urn:zcap:root:' + encodeURIComponent(url)
  )
  expect(result.controller).toBe(
    'did:key:z6MkogR2ZPr4ZGvLV2wZ7cWUamNMhpg3bkVeXARDBrKQVn2c'
  )
  expect(result.type).toBe('DataIntegrityProof')
  expect(result.cryptosuite).toBe('eddsa-jcs-2022')
  expect(result.proofPurpose).toBe('capabilityDelegation')
  expect(result.chainLength).toBe(1)
})
