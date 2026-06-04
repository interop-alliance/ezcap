/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
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
