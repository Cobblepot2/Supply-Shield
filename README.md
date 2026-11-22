# Supply Shield

A browser-based COMP5578 Option 2 lab about runtime resource integrity in the NIKKE PC launcher case. The launcher executable retained a valid signature. Four files fetched from the publisher’s CDN were modified. The embedded browser loaded the runtime resources, and affected launches could receive a K2F information-stealing payload. Bitdefender reported a download, collection, exfiltration and cleanup sequence lasting under ten minutes.

## Two-minute presentation

1. Open the site. The initial check verifies the original manifest and accepts all four classroom samples.
2. In the first editor add a line such as `// pre` to the selected file. Select **Run verification**. The manifest signature still passes. The content comparison is **3/4** and loading is blocked.
3. Copy the measured fingerprint and manually paste it into the second editor. Verify again. The hash-only comparison is **4/4** while the original publisher signature fails, so loading stays blocked.
4. If time permits, open **Connection audit**, **CDN nodes**, or **Response report**. You can add a synthetic request observation, compare one or all three affected node copies with the signed baseline, or record simulated quarantine and download the evidence.

Chinese is the default. Use the language button or `?lang=en` for English. **Restore sample** clears edits and brings the demo back to the signed baseline.

## What the browser does

- The editor stages harmless text named after the four case files. The simulated launcher executable stays fixed.
- The browser verifies an ECDSA P-256 signature over the compact manifest and computes SHA-256 over the current file text. Loading in the simulation requires both checks. A hash-only comparison is marked as illustrative when the signature is rejected.
- The CDN comparison hashes the displayed classroom copies and checks them against the original signed release. It illustrates why node agreement alone does not establish authenticity.
- Request observations and quarantine are simulated. The browser does not inspect OS processes or credential stores or contact CDN nodes. It never evaluates sample edits as code. Reports include check decisions and hashes, along with the labelled simulation records.
- This is the web proof of concept from the design. File-system watches, process telemetry, real quarantine, VirusTotal and a privileged local agent would require separate integrations.

## Run and publish

Use Node.js 22 or later. The public site has no build dependencies, secrets or backend.

```sh
npm test
npm run dev
npm run offline
```

The local server is `http://127.0.0.1:4180/`. The offline command writes `dist/supply-shield.html`, which runs in current Edge and Chrome. Generate fresh classroom fixtures with `node scripts/make-fixtures.mjs`. The generator keeps the temporary private key in memory and writes only the public verification material. Vercel serves `public/`.

## Sources

- [MotherSphere’s analysis and incident timeline](https://gist.github.com/MotherSphere/d6c049a09ba8ac3085c51ee9df24a4e5)
- [Bitdefender Labs’ endpoint analysis](https://www.bitdefender.com/en-gb/blog/labs/nikke-game-launcher-malware)
- [Microsoft’s Authenticode description](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)
