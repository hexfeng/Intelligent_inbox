# v2 evaluation fixtures

`fixtures.deidentified.jsonl` and `labels.locked.jsonl` are the seed set for live JEV/Luna comparison. They contain only synthetic `.test` addresses and de-identified content. `policy-cases.jsonl` isolates deterministic policy behavior from provider quality.

Run the offline policy gate with:

```powershell
npm run eval:policy
```

With provider credentials configured, run the synthetic live-provider gate with:

```powershell
npm run eval:smoke
```

This compares the configured JEV decision path and GPT-6 Luna fallback against the same locked labels, then exercises the Luna summary path. It sends only the synthetic fixture content to those providers.

The seed set proves the harness and taxonomy alignment, not production quality. Expanding and locking a representative corpus, calibrating thresholds, and recording per-class quality, latency, and cost reports still require the project owner's approved test corpus.
