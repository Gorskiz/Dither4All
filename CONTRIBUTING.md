# Contributing

Keep the app free, local, and useful. Small focused pull requests are welcome.

1. Open an issue for substantial changes so we can discuss the intended behavior.
2. Create a branch, implement one coherent change, and add tests for image math, file validation, or changed user workflows.
3. Run `npm test`, `npm run build`, and `npm run test:browser` when changing the editor.
4. Describe the behavior, motivation, and verification in your pull request. Include screenshots for UI changes.

Use focused commits such as `fix: preserve transparent pixels in exports`. Do not bundle unrelated cleanup. No contributor license agreement, sign-off, or co-author trailer is required.

## Design principles

- No account requirement, paid feature gates, analytics, or remote image processing.
- Keep the UI accessible by keyboard, responsive on phones, and usable while processing.
- Keep algorithms deterministic. Seed any randomness and preserve input pixels.
- Implement algorithms from documented techniques or compatible, attributed open-source code. Do not add extracted commercial code or copied brand assets.
- Explain new algorithm parameters and practical limits in the docs.
- Prefer browser APIs before adding dependencies. Heavy work belongs in the worker.

The MIT license applies to contributed app code. Be kind, specific, and constructive in issues and reviews.
