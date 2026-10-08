# NEAR Auth for NEAR Connect

Social login for NEAR, backed by [fast-auth](https://auth.near.org). The user signs in with Google, Apple,
email or a passkey, and the NEAR MPC network derives the key that signs for them from that identity, so
there is no seed phrase and no key material in this executor.

This app builds the executor script that NEAR Connect runs in its sandboxed iframe. NEAR Connect only lists the
wallet: its manifest entry `near-auth` points `executor` at wherever this script is served.

This folder stays outside the pnpm workspace with its own lockfile, so the script every dapp loads never changes
with the rest of the repo's dependencies. Build it from this folder:

```sh
pnpm install --frozen-lockfile --ignore-workspace
pnpm check-types
pnpm build
```

## What a dapp needs

Its origin allowed on the Auth0 application it uses. Auth0 posts the authorization response back to the dapp's
origin, so that origin must be both an allowed callback URL and an allowed web origin of that application on each
network the dapp uses.

A dapp in `dapps` of `dapps.json` uses its own application and relayer on the networks its entry lists and is
refused on the others; any other dapp uses `default`, Peersyst's. Refused sign-ins and signatures fail with
`NEAR Auth is not available for <origin> on <network>`. `dapps.json` only routes: the allowed URLs above are the gate.
`build` validates it first (`scripts/validate-dapps.mjs`): exact https origins as keys, known networks, https relayer
URLs, and an application of the dapp's own.

A listed application must be on NEAR Auth's tenant with the same login connections, so users keep their account. A
listed relayer must serve `POST /relayer/fast-auth/sign-tx` and allow CORS for `Origin: null` (the wallet's sandbox).
It must accept the guard `jwt#https://<auth0Domain>/` and issuer `https://<auth0Domain>/` and call `sign` on the
network's `fastAuthContractId`, all from `src/near-auth/config.ts` (for `apps/relayer`: `NEAR_GUARD_ID`, `NEAR_ISSUER`
and `NEAR_FAST_AUTH_CONTRACT_ID`). It should only pay for tokens whose `azp` is its own client ID, since the on-chain
guard accepts any application on the tenant.

Transactions and messages are limited to 1,024 bytes once borsh-encoded, so large ones, such as a contract
deployment, cannot be signed.

## Message signing

`signMessage` and `signInAndSignMessage` need NEP-413 support in the Auth0 signing action (its `nep413` authorize
parameter) and the NEP-413 consent form on the tenant. Until both are deployed, the tenant rejects the request and the manifest
keeps declaring them `false`.

## Build variants

`src/near-auth-local/` and `src/near-auth-demo/` hold only the modules they replace. `vite.config.ts` serves this
wallet's own `./x` imports from the variant folder when it has an `x.ts`, and each override re-exports the rest of the
real module. Neither build is published.

| Script | Output | Overrides |
| --- | --- | --- |
| `build` | `dist/production/connector/near-connect.js` | The published wallet. |
| `build:local` | `dist/local/connector/near-connect.js` | `config.ts`: testnet relays through `http://localhost:3001/api`; mainnet keeps the production relayer. |
| `build:demo` | `dist/demo/connector/near-connect.js` | `auth0.ts`, `relayer.ts`, `near.ts`: testnet only. Signs in as a fixed identity and simulates Auth0, the relayer and the broadcast; read-only RPC and indexer calls still happen. |

## Serving

`serve`, `serve:local` and `serve:demo` serve the matching build at `http://localhost:8080/connector/near-connect.js`
with `Access-Control-Allow-Origin: *`. NEAR Connect downloads the script from the dapp's page, so wherever it is served
it must be readable from any origin.

NEAR Connect runs the copy it cached for the manifest entry's `id` and `version` and refreshes it in the background
once per page load, so after a rebuild, a variant switch or an upload, the first wallet call on a newly loaded page
still runs the previous build.
