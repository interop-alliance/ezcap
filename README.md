# ezcap (_@interop/ezcap_)

[![CI](https://github.com/interop-alliance/ezcap/workflows/CI/badge.svg)](https://github.com/interop-alliance/ezcap/actions?query=workflow%3ACI)

> An easy to use, opinionated Authorization Capabilities (zcap) client library
> for the browser and Node.js.

This is an [Interop Alliance](https://github.com/interop-alliance) fork of the
Digital Credentials / Digital Bazaar `ezcap`, switched to the `@interop`
dependency forks and converted from JavaScript to TypeScript.

## Table of Contents

- [Background](#background)
- [Security](#security)
- [Install](#install)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

This library provides a client that browser and node.js applications can use to
interact with HTTP servers protected by zcap-based authorization. The library
is configured with secure and sensible defaults to help developers get started
quickly and ensure that their client code is production-ready.

## Security

The security characteristics of this library are largely influenced by design
decisions made by client and server software. For clients, implementers should
pay particular attention to secure private key management. For servers, security
characteristics are largely dependent on how carefully the server manages zcap
registrations, zcap invocations, and zcap delegations. Bugs or failures related
to client key management, or server zcap validity checking will lead to security
failures. It is imperative that implementers audit their implementations,
preferably via parties other than the implementer.

## Install

- Browsers and Node.js 20+ are supported.
- This package is ESM-only (`"type": "module"`).

To install from NPM:

```
npm install @interop/ezcap
```

To install locally (for development), using [pnpm](https://pnpm.io/):

```
git clone https://github.com/interop-alliance/ezcap.git
cd ezcap
pnpm install
```

## Usage

* [Creating a Client](#creating-a-client)
* [Reading with a Root Capability](#reading-with-a-root-capability)
* [Writing with a Root Capability](#writing-with-a-root-capability)
* [Delegating a Capability](#delegating-a-capability)
* [Reading with a Delegated Capability](#reading-with-a-delegated-capability)
* [Writing with a Delegated Capability](#writing-with-a-delegated-capability)
* [Requesting with a Root Capability](#requesting-with-a-root-capability)
* [Requesting with a Delegated Capability](#requesting-with-a-delegated-capability)

### Creating a Client

Creating a zcap client involves generating cryptographic key material and then
using that key material to instantiate a client designed to operate on a
specific base URL.

```js
import { ZcapClient } from '@interop/ezcap'
import * as didKey from '@interop/did-method-key'
import { Ed25519Signature2020 } from '@interop/ed25519-signature'
import { Ed25519VerificationKey } from '@interop/ed25519-verification-key'

const didKeyDriver = didKey.driver()
didKeyDriver.use({ keyPairClass: Ed25519VerificationKey })

// generate a DID Document and set of key pairs
const { didDocument, keyPairs } = await didKeyDriver.generate()

// create a new zcap client using the generated cryptographic material
const zcapClient = new ZcapClient({
  didDocument,
  keyPairs,
  SuiteClass: Ed25519Signature2020
})
```

### Reading with a Root Capability

Reading data from a URL using a capability is performed in a way that is
very similar to using a regular HTTP client to perform an HTTP GET. Using
a root capability means that your client has been directly authorized to access
the URL, usually because it created the resource that is being accessed.
The term "root" means that your client is the "root of authority".

```js
const url = 'https://zcap.example/my-account/items';

// reading a URL using a zcap will result in an HTTP Response
const response = await zcapClient.read({url});

// retrieve the JSON data
const items = await response.json();
```

### Writing with a Root Capability

Writing data to URL using a capability is performed in a way that is
very similar to using a regular HTTP client to perform an HTTP POST. Using
a root capability means that your client has been directly authorized to
modify the resource at the URL, usually because it created the resource that is
being written to. The term "root" means that your client is the "root of
authority". In the example below, the server most likely registered the
client as being the root authority for the `/my-account` path on the server.

```js
const url = 'https://zcap.example/my-account/items';
const item = {label: 'Widget'};

// writing a URL using a zcap will result in an HTTP Response
const response = await zcapClient.write({url, json: item});

// process the response appropriately
const writtenItem = await response.json();
```

### Delegating a Capability

Delegating a capability consists of the client authorizing another entity to
use the capability. The example below uses a DID as the target for the
delegation. The returned `delegatedCapability` would need to be transmitted
to the entity identified by the delegation target so that they can use it
to access the resource.

```js
const invocationTarget = 'https://zcap.example/my-account/items';
const controller =
  'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH';
const allowedActions = ['read'];
const delegatedCapability = zcapClient.delegate(
  {invocationTarget, controller, allowedActions});
```

### Reading with a Delegated Capability

Reading with a delegated capability is similar to reading with a root
capability. The only difference is that the delegated capability needs to be
retrieved from somewhere using application-specific code and then passed
to the `read` method.

```js
const url = 'https://zcap.example/my-account/items/123';
// defined by your code
const capability = await getCapabilityFromDatabase({url});

// reading a URL using a zcap will result in an HTTP Response; the
// `invocationTarget` from the capability provides the URL if one is not
// specified; if a URL is specified, the capability's invocation target
// MUST be a RESTful prefix of or equivalent to the URL
const response = await zcapClient.read({capability});

// retrieve the JSON data
const items = await response.json();
```

### Writing with a Delegated Capability

Writing with a delegated capability is similar to writing with a root
capability. The only difference is that the delegated capability needs to be
retrieved from somewhere using application-specific code and then passed
to the `write` method.


```js
const item = {label: 'Widget'};
const url = 'https://zcap.example/my-account/items';
// defined by your code
const capability = await getCapabilityFromDatabase({url});

// writing a URL using a zcap will result in an HTTP Response; the
// `invocationTarget` from the capability provides the URL if one is not
// specified; if a URL is specified, the capability's invocation target
// MUST be a RESTful prefix of or equivalent to the URL
const response = await zcapClient.write({capability, json: item});

// process the response appropriately
const writtenItem = await response.json();
```

### Requesting with a non-JSON binary blob body

```js
const body = new Blob(['line 1\nline2\n'], {type: 'text/plain'})
await zcapClient.request({
  url, method: 'POST', body
})
```

### Requesting with a Root Capability

In the event that the server API does not operate using HTTP GET and HTTP POST,
it is possible to create a zcap client request that uses other HTTP verbs. This
is done by specifying the HTTP `method` to use.

```js
const url = 'https://zcap.example/my-account/items';
const item = {count: 12};

// send a request to a URL by invoking a capability
const response = await zcapClient.request({url, method: 'patch', json: item});

// process the response appropriately
const updatedItem = await response.json();
```

### Requesting with a Delegated Capability

Performing an HTTP request with a delegated capability is similar to
doing the same with a root capability. The only difference is that the
delegated capability needs to be retrieved from somewhere using application-specific code and then passed to the `request` method.

```js
const item = {count: 12};
const url = 'https://zcap.example/my-account/items/123';
// defined by your code
const capability = await getCapabilityFromDatabase({url});

// invoking a capability against a URL will result in an HTTP Response; the
// `invocationTarget` from the capability provides the URL if one is not
// specified; if a URL is specified, the capability's invocation target
// MUST be a RESTful prefix of or equivalent to the URL
const response = await zcapClient.request(
  {capability, method: 'patch', json: item});

// process the response appropriately
const updatedItem = await response.json();
```

## API Reference

The ezcap approach is opinionated in order to make using zcaps a pleasant
experience for developers. To do this, it makes two fundamental assumptions
regarding the systems it interacts with:

* The systems are HTTP-based and REST-ful in nature.
* The REST-ful systems center around reading and writing resources.

If these assumptions do not apply to your system, the
[`@interop/zcap`](https://github.com/interop-alliance/zcap) library might
be a better, albeit more complex, solution for you.

Looking at each of these core assumptions more closely will help explain how designing systems to these constraints make it much easier to think about
zcaps. Let's take a look at the first assumption:

> The systems are HTTP-based and REST-ful in nature.

Many modern systems tend to have HTTP-based interfaces that are REST-ful in
nature. That typically means that most resource URLs are organized by namespaces, collections, and items:
`/<root-namespace>/<collection-id>/<item-id>`. In practice,
this tends to manifest itself as URLs that look like
`/my-account/things/1`. The ezcap approach maps the authorization model
in a 1-to-1 way to the URL. Following along with the example, the root
capability would then be `/my-account`, which you will typically create and
have access to. You can then take that root capability and delegate access
to things like `/my-account/things` to let entities you trust modify the
`things` collection. You can also choose to be more specific and only
delegate to `/my-account/things/1` to really lock down access. ezcap attempts
to keep things very simple by mapping URL hierarchy to authorization scope.

Now, let's examine the second assumption that makes things easier:

> The REST-ful systems center around reading and writing resources.

There is an incredible amount of flexibility that zcaps provide. You can
define a variety of actions: read, write, bounce, atomicSwap, start, etc.
However, all that flexibility adds complexity and one of the goals of ezcap
is to reduce complexity to the point where the solution is good enough for
80% of the use cases. A large amount of REST-ful interactions tend to
revolve around reading and writing collections and the items in those
collections. For this reason, there are only two actions that are exposed
by default in ezcap: read and write. Keeping the number of actions to a
bare minimum has allowed implementers to achieve very complex use cases with
very simple code.

These are the two assumptions that ezcap makes and with those two assumptions,
80% of all use cases we've encountered are covered.

### `new ZcapClient(options)`

Creates a new `ZcapClient` instance for performing requests against HTTP URLs
authorized via Authorization Capabilities (zcaps). Provide a signing
`SuiteClass`, plus **either** `{ didDocument, keyPairs }` (the invocation and
delegation signers are derived via `getCapabilitySigners`) **or** explicit
`{ invocationSigner, delegationSigner }`.

| Param | Type | Description |
| --- | --- | --- |
| `options.SuiteClass` | `LinkedDataSignatureSuiteClass` | The Linked Data Signature suite class used to sign requests and delegations (e.g. `Ed25519Signature2020`). Required. |
| `options.didDocument` | `object` | A DID Document with `capabilityInvocation` and `capabilityDelegation` verification relationships. Use together with `keyPairs`. |
| `options.keyPairs` | `Map` | A map of key pairs associated with `didDocument`, indexed by key id. |
| `options.invocationSigner` | `object` | A signer (`.sign()`, `id`, `controller`) used for signing requests. Alternative to `didDocument` + `keyPairs`. |
| `options.delegationSigner` | `object` | A signer (`.sign()`, `id`, `controller`) used for delegating zcaps. Alternative to `didDocument` + `keyPairs`. |
| `options.agent` | `HttpsAgent` | Optional Node.js HTTPS agent for connection reuse. |
| `options.defaultHeaders` | `object` | Optional default HTTP headers included on every invocation request. |
| `options.documentLoader` | `function` | Optional document loader for suite-related contexts. If omitted, one is auto-generated from the suite class's static `CONTEXT` / `CONTEXT_URL`. |

### `zcapClient.delegate(options) ⇒ Promise<ZcapObject>`

Delegates an Authorization Capability to a target controller. Returns the signed
delegated zcap.

| Param | Type | Description |
| --- | --- | --- |
| `options.controller` | `string` | The URL/DID identifying the entity to delegate to (the party that will control the new zcap). Required. |
| `options.capability` | `string \| object` | The parent capability to delegate. Must be an object if it is a delegated zcap; may be a string for a root zcap (then `invocationTarget` is required). If omitted, a root zcap is auto-generated for `invocationTarget`. |
| `options.invocationTarget` | `string` | Optional invocation target used to narrow a `capability`'s existing target. Defaults to `capability.invocationTarget`. |
| `options.expires` | `string \| Date` | Optional expiration. Default: 5 minutes after `Date.now()`. |
| `options.allowedActions` | `string \| string[]` | Optional allowed action(s). Default: `[]` (delegate all actions). |

### `zcapClient.request(options) ⇒ Promise<Response>`

Performs an HTTP request authorized by a zcap and/or a target URL. If no URL is
given, the capability's invocation target is used. A string `capability` MUST be
a root capability. If both `url` and `capability` are given, the capability's
invocation target MUST be a RESTful prefix of (or equal to) the URL.

| Param | Type | Description |
| --- | --- | --- |
| `options.url` | `string` | The URL to invoke against; required if no `capability` is provided. |
| `options.capability` | `string \| object` | The capability to invoke. Default: a root capability generated from `options.url`. |
| `options.method` | `string` | The HTTP method. Default: `'GET'`. |
| `options.action` | `string` | The capability action being invoked. Default: same as `method`. |
| `options.headers` | `object` | Additional headers to sign and send. Default: `{}`. |
| `options.json` | `object` | The JSON body, if any, to send. |
| `options.body` | `Blob \| Uint8Array` | A non-JSON body to send (file uploads, binary blobs, etc.). |

### `zcapClient.read(options) ⇒ Promise<Response>`

Convenience wrapper for a `GET` / `read` invocation. Accepts `url`, `headers`,
and `capability` (see `request`).

### `zcapClient.write(options) ⇒ Promise<Response>`

Convenience wrapper for a `POST` / `write` invocation. Accepts `url`, `json`,
`body`, `headers`, and `capability` (see `request`).

### `getCapabilitySigners(options) ⇒ CapabilitySigners`

Resolves the first set of capability invocation and delegation signers
associated with a `didDocument` from its `keyPairs`. Returns
`{ invocationSigner, delegationSigner }`.

| Param | Type | Description |
| --- | --- | --- |
| `options.didDocument` | `object` | A DID Document containing `capabilityInvocation` and `capabilityDelegation` verification relationships. |
| `options.keyPairs` | `Map` | A map of key pairs indexed by key id. |

### TypeScript types

The package is written in TypeScript and ships generated declarations. In
addition to the runtime exports, the following types are exported from
`@interop/ezcap`: `ZcapObject`, `Proof`, `ZcapClientOptions`, `DelegateOptions`,
`RequestOptions`, `ReadOptions`, `WriteOptions`, `HttpsAgent`,
`LinkedDataSignatureSuiteClass`, `DocumentLoader`, `Signer`,
`VerificationMethodReference`, `DidDocument`, `KeyPair`, and
`CapabilitySigners`.

## License
[New BSD License (3-clause)](LICENSE) © Digital Bazaar and Interop Alliance
