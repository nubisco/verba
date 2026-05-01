# Contributor License Agreement (CLA)

Thank you for your interest in contributing to Verba, a project by **Nubisco Lda**.

By submitting a pull request, issue, or any other contribution to this repository, you agree to the following terms:

## 1. Definitions

- **"Contribution"** means any work of authorship, including modifications, additions, or new files, submitted to this repository.
- **"You"** means the individual or legal entity submitting the Contribution.
- **"Nubisco Lda"** means Nubisco, Lda, a private limited company registered in Portugal, the owner and operator of the Verba project.

## 2. Grant of copyright license

You retain copyright in your Contributions. You grant Nubisco Lda a **perpetual, worldwide, non-exclusive, irrevocable, royalty-free** copyright license to:

- Reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute your Contributions and derivative works;
- Include your Contributions in any product, service, or offering, including commercial and proprietary products such as the Verba Enterprise Edition.

## 3. Grant of patent license

You grant Nubisco Lda a perpetual, worldwide, non-exclusive, royalty-free patent license to make, have made, use, sell, and import your Contributions.

## 4. Open-core context

Verba uses an open-core model. The Community Edition is AGPL-3.0-licensed. The Enterprise Edition (`packages/ee/`) is proprietary. By accepting this CLA, you understand and agree that:

- Contributions to the CE codebase may be used in the EE or in Nubisco Lda's commercial offerings.
- Contributions to `packages/ee/` are not accepted from external contributors at this time.

## 5. Representations

- Your Contributions are your original work, or you have the rights to submit them.
- Your Contributions do not violate any third-party intellectual property rights.
- If your employer has rights to code you write, you have obtained permission to submit it.

## 6. No warranty

Your Contributions are provided "as-is", without warranties of any kind.

## 7. Your rights as a user

Nothing in this CLA reduces or restricts the rights you have under the **AGPL-3.0** as a user of the Community Edition.

---

## CLA / DCO enforcement proposal

> [!NOTE]
> This section documents the proposed mechanism for enforcing contributor sign-off. It is pending a decision before public release.

**Recommended approach: DCO (Developer Certificate of Origin)**

The DCO is a lightweight alternative to a full CLA. Each commit is signed off with a `Signed-off-by:` trailer, indicating the contributor certifies the [DCO](https://developercertificate.org/) for that commit.

```
git commit -s -m "feat: add locale filter to board view"
# Adds: Signed-off-by: Your Name <your@email.com>
```

A CI check (e.g. [DCO GitHub App](https://github.com/apps/dco)) can enforce that all commits in a PR carry the trailer.

**Why DCO over a CLA bot:**

- Lower friction for first-time contributors
- No separate sign-up step required
- Legally sufficient for the rights granted above
- Widely adopted in the open-source ecosystem (Linux kernel, CNCF projects)

**Open question:** Whether the commercial use grant (section 2) is adequately captured by the DCO alone, or whether a separate CLA sign-off is needed for first-time contributors. Flagged for legal review.

> [!WARNING]
> This CLA and the DCO enforcement proposal must be reviewed by qualified legal counsel before the public release of Verba.

---

_Inspired by the Apache ICLA. For questions: [legal@nubisco.io](mailto:legal@nubisco.io)_
