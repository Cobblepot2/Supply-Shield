# Supply Shield

A bilingual browser lab for rehearsing software update delivery defenses. The experiment models a publisher, a distribution channel and a client. Files, rules and reports stay inside the browser.

## Modules

- **File integrity.** Type original content or import files. The lab uses a session-local, non-exportable ECDSA P-256 private key to sign a versioned SHA-256 manifest. Receive a separate copy, manually edit its text or replace its bytes, then verify. The advanced exercise lets you manually edit the received manifest and observe why matching hashes cannot replace a valid publisher signature.
- **Connection audit.** Apply your own allowed hosts, then enter a destination for the simulated process of a selected received file. The audit compares the normalized host exactly. No traffic is sent to the destination.
- **Community consensus.** The preset 50-node world map starts with every node matching the release baseline. Select Regional variation to see 47 matches and three deviations. Node details show the digest and location. The whole-network variant demonstrates that 100% agreement can still disagree with the publisher baseline. The map uses [Natural Earth public-domain data](https://www.naturalearthdata.com/about/terms-of-use/).
- **Incident response.** Review current signals, try simulated quarantine, and create a prioritized checklist from an explicit execution assumption and a role or asset selection. Mark actions complete and download or print an exercise report. The application does not inspect live devices, user accounts or credentials.

All checks run locally. Delivery, process observations, node reports and response actions are synthetic. The demo generates the publisher key pair and verifies signatures in the same browser session. A production client should establish trust in the publisher’s public key through a separate trusted channel.

## Run

Requires Node.js 22 or later. No dependencies or environment variables are needed.

```sh
npm test
npm run dev
npm run offline
```

Open `http://127.0.0.1:4180/` locally, or `dist/supply-shield.html` in Edge or Chrome for offline presentation. The deployed Vercel project serves `public/`. The default language is English. Use `?lang=zh` for Chinese, or `?tab=consensus` to open the map directly.
