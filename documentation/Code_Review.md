# Code Review

## 1. Change History

| **Change Date**   | **Modified Sections** | **Rationale** |
| ----------------- | --------------------- | ------------- |
| Nov 4, 2026 | 2 | Complete section 2 for CP2 |
| Nov 9, 2026 | 3.1 | Record the review we performed of Donut's project for CP3 |

---

## 2. Automated Code Review Results

### 2.1. Commit Hash Where Codacy Ran

`194c9c796fe364dd33b599a3ce8849778b67a989`

### 2.2. Unfixed Issues per Codacy Category

![Codacy Overview page: the Issues breakdown table shows 12 issues, all Security](images/codacy-categories.png)

### 2.3. Unfixed Issues per Codacy Code Pattern

![Codacy Issues page: 8 issues for Detect Insecure Dependencies (High Severity) and 4 for Detect Insecure Dependencies (Medium Severity)](images/codacy-issues.png)

### 2.4. Justifications for Unfixed Issues

All 12 unfixed issues are Trivy reports of known vulnerabilities in three packages that [`@imgly/background-removal-node`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package.json#L24) 1.4.5 depends on: sharp 0.32.6, lodash 4.17.23 and zod 3.21.4. We use it to remove the background from a clothing item's front photo before building the item's 3D model ([`processGarment.ts`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/src/garment/imgToGlb/processGarment.ts#L5)). Version 1.4.5 is its latest release, and it pins these versions (`sharp ~0.32.4`, `lodash ~4.17.21`, `zod ~3.21.4`), so they can only be upgraded by forcing newer versions underneath it. We kept the pinned versions because newer sharp releases don't support one team member's older development machine, and every team member needs to run the back-end locally.

Each advisory is reported twice: once in `backend/package-lock.json`, and once in the `package-lock.json` at the repository root, which lists the same package. The server only installs from `backend/` (CI, the Dockerfile and the deploy script all run `npm ci` there), so the root copies never run on the server.

- **Code Pattern: [Detect Insecure Dependencies (High Severity)](https://app.codacy.com/gh/evannawfal/fabricate/issues)**

  1. **sharp 0.32.6: libvips vulnerabilities (GHSA-f88m-g3jw-g9cj)**

     - **Location in Git:** [`backend/package-lock.json#L9039`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L9039)
     - **Justification:** sharp only decodes photos that were already accepted at upload: JPEG, PNG or WebP files of at most 5 MB ([`clothing.ts`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/src/controllers/clothing.ts#L16)), which Claude must also be able to read as that type, or the upload is rejected with 400 and nothing is stored ([`classifier.ts`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/src/services/classifier.ts#L182)). The advisory's workaround is to block sharp's GIF, TIFF and VIPS decoders, and those formats never reach sharp.

  2. **sharp 0.32.6: libvips vulnerabilities (GHSA-f88m-g3jw-g9cj)**

     - **Location in Git:** [`package-lock.json#L999`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L999)
     - **Justification:** Same advisory as issue 1, in the root lock file, which the server never installs.

  3. **sharp 0.32.6: librsvg vulnerability (GHSA-wq5f-xc86-pv6w)**

     - **Location in Git:** [`backend/package-lock.json#L9039`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L9039)
     - **Justification:** The vulnerability is in sharp's SVG decoder. SVG files can't be uploaded or stored (see issue 1), so they never reach sharp.

  4. **sharp 0.32.6: librsvg vulnerability (GHSA-wq5f-xc86-pv6w)**

     - **Location in Git:** [`package-lock.json#L999`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L999)
     - **Justification:** Same advisory as issue 3, in the root lock file, which the server never installs.

  5. **sharp 0.32.6: libheif vulnerabilities (GHSA-rgj7-g3m4-5g8c)**

     - **Location in Git:** [`backend/package-lock.json#L9039`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L9039)
     - **Justification:** The vulnerabilities are in sharp's HEIF and AVIF decoder. Those formats can't be uploaded or stored (see issue 1), so they never reach sharp.

  6. **sharp 0.32.6: libheif vulnerabilities (GHSA-rgj7-g3m4-5g8c)**

     - **Location in Git:** [`package-lock.json#L999`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L999)
     - **Justification:** Same advisory as issue 5, in the root lock file, which the server never installs.

  7. **lodash 4.17.23: code injection through `_.template` (CVE-2026-4800)**

     - **Location in Git:** [`backend/package-lock.json#L7377`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L7377)
     - **Justification:** Only `_.template` called with untrusted `imports` key names is affected. `@imgly/background-removal-node` only uses lodash's `memoize`, and our own code doesn't use lodash.

  8. **lodash 4.17.23: code injection through `_.template` (CVE-2026-4800)**

     - **Location in Git:** [`package-lock.json#L1493`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L1493)
     - **Justification:** Same advisory as issue 7, in the root lock file, which the server never installs.

- **Code Pattern: [Detect Insecure Dependencies (Medium Severity)](https://app.codacy.com/gh/evannawfal/fabricate/issues)**

  1. **lodash 4.17.23: prototype pollution through `_.unset` and `_.omit` (CVE-2026-2950)**

     - **Location in Git:** [`backend/package-lock.json#L7377`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L7377)
     - **Justification:** Only `_.unset`, `_.omit` and `_.pullAt` called with untrusted paths are affected. `@imgly/background-removal-node` only uses lodash's `memoize`, and our own code doesn't use lodash.

  2. **lodash 4.17.23: prototype pollution through `_.unset` and `_.omit` (CVE-2026-2950)**

     - **Location in Git:** [`package-lock.json#L1493`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L1493)
     - **Justification:** Same advisory as issue 1 of this pattern, in the root lock file, which the server never installs.

  3. **zod 3.21.4: slow regular expression in email validation (CVE-2023-4316)**

     - **Location in Git:** [`backend/package-lock.json#L1489`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/package-lock.json#L1489)
     - **Justification:** Only `z.string().email()` is affected. `@imgly/background-removal-node` uses zod only to check its own options, which our code sets ([`processGarment.ts`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/backend/src/garment/imgToGlb/processGarment.ts#L29)), and it never validates an email. Our own code doesn't use zod.

  4. **zod 3.21.4: slow regular expression in email validation (CVE-2023-4316)**

     - **Location in Git:** [`package-lock.json#L2015`](https://github.com/evannawfal/fabricate/blob/194c9c796fe364dd33b599a3ce8849778b67a989/package-lock.json#L2015)
     - **Justification:** Same advisory as issue 3 of this pattern, in the root lock file, which the server never installs.

---

## 3. Manual Code Review Results

### 3.1. Review You Performed

- **Peer group reviewed:** Donut ([`donut-cpen321/donut`](https://github.com/donut-cpen321/donut))
- **Commit SHA reviewed:** [`0ab1a7c34a4bd2c580b44b444c305310fdd5bb88`](https://github.com/donut-cpen321/donut/commit/0ab1a7c34a4bd2c580b44b444c305310fdd5bb88)
- **Date the artifacts were exchanged:** Nov 9, 2026
- **Review report submitted:** [`CP3_Donut_Review.pdf`](reviews/CP3_Donut_Review.pdf)

| **Section**          | **Item**                                                                                                                                             | **Score** |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Manual code review   | Code is maintainable (well-documented, uses self-explanatory variable names, does not have complicated and long methods, magic numbers, etc.), efficient, handles error cases well | 8/10      |
| Manual test review   | Tests are complete (all APIs exposed to the front-end are tested, three main features are tested), errors and edge cases are thoroughly tested, correct assertions are used | 9/10      |
| Manual test review   | Test code is maintainable and well-structured                                                                                                          | 8/10      |
| Manual test review   | Test implementation matches the requirements and design                                                                                                | 8/10      |
| Manual test review   | Non-functional requirements are tested well                                                                                                            | 3/10      |
| Manual test review   | Tests achieve high coverage and cases of < 100% coverage are well-justified                                                                            | 7/10      |
| Manual test review   | All back-end tests can be run automatically                                                                                                            | 10/10     |
| Automated code review| Codacy runs with the required setup                                                                                                                    | 10/10     |
| Automated code review| All remaining Codacy issues are well-justified                                                                                                          | 10/10     |

**Major fault reported**

- **Description:** One player can set any opponent's ELO rating, through three gaps in how game scores are handled:
  1. **No limit on margin of victory.** The rating update adds 1.5 points per game of margin, summed over all sets, with no cap ([`elo.ts#L102-L105`](https://github.com/donut-cpen321/donut/blob/0ab1a7c34a4bd2c580b44b444c305310fdd5bb88/backend/src/ranking/elo.ts#L102-L105)). The win/loss term is at most 50, so the margin dominates.
  2. **No tennis score validation.** Any non-negative number of games per set and any number of sets are accepted ([`games.schemas.ts#L12`](https://github.com/donut-cpen321/donut/blob/0ab1a7c34a4bd2c580b44b444c305310fdd5bb88/backend/src/games/games.schemas.ts#L12)), and the app allows up to 99 per set.
  3. **One unconfirmed report is final, at any time.** `checkCanEditGame` ([`games.service.ts#L369`](https://github.com/donut-cpen321/donut/blob/0ab1a7c34a4bd2c580b44b444c305310fdd5bb88/backend/src/games/games.service.ts#L369)) only rejects completed or cancelled games, so a score is accepted for a matched game that nobody accepted, before it starts. Afterwards the game can't be accepted, cancelled or re-reported (409), so the change is permanent.
- **Steps to reproduce:** In Donut's own app, built from commit `0ab1a7c` with no code changes. `local.properties` only points it at a local server running the same commit, so no real user's rating was changed. One tester plays as Evan in the app; Bob and Finn are test players acting through the API, exactly as the app would call it.
  - **A. An impossible score is accepted and moves both ratings by 475:**
    1. Evan (1457) schedules a singles game, and Bob (1500) joins team 2, so the game is booked.
    2. After the start time, Evan taps **Report final score**, enters 99–0, 99–0, 99–0 and submits. The app and the server accept it.
    3. Evan's rating goes to 1932 (+475) and Bob's to 1025 (−475). Evan is now first on the leaderboard.
  - **B. A player loses rating on a match they never accepted, and can't undo it:**
    1. Evan and Finn (both 1500) queue for singles. At 6:40, matchmaking proposes a game at 7:40, and nobody has accepted it.
    2. Finn immediately reports 6–0, 6–0 (`POST /games/score`). The server returns 200 and the game is completed.
    3. In the app, Evan's **Accept** fails with the wrong reason ("starts in less than 30 minutes", at 6:40 for a 7:40 game), and **Cancel** fails too.
    4. At 6:42, Evan's match history shows a loss, −43 (1500 → 1457), for a 7:40 match that was never accepted or played.
- **Screenshots:**
  - **A.** Left to right: the score form accepts 99–0 sets (step 2); the game is completed with ratings of 1932 and 1025 (step 3); the leaderboard (step 3).

    <img src="images/donut-fault-a-score-form.png" alt="Donut's final score form with three sets of 99–0" width="240"> <img src="images/donut-fault-a-game-completed.png" alt="Completed game: Evan 1932, Bob 1025, three sets of 99–0" width="240"> <img src="images/donut-fault-a-leaderboard.png" alt="Leaderboard with Evan first at 1932 and Bob last at 1025" width="240">

  - **B.** Left to right: at 6:40 a match is proposed for 7:40 (step 1); Accept is refused (step 3); Cancel is refused (step 3); at 6:42 the match history shows a loss of −43 (step 4).

    <img src="images/donut-fault-b-match-found.png" alt="Match found at 6:40 for a 7:40 singles game against Finn" width="180"> <img src="images/donut-fault-b-accept-refused.png" alt="Accept refused: the match starts in less than 30 minutes" width="180"> <img src="images/donut-fault-b-cancel-refused.png" alt="Cancel refused: could not cancel the match" width="180"> <img src="images/donut-fault-b-loss.png" alt="Match history at 6:42 showing a loss of −43 against Finn, Elo 1457" width="180">

- **Severity:** High. It breaks the ELO ranking and the leaderboard, two core features, and matchmaking uses the bad ratings to pick opponents.

### 3.2. Review You Received

- **Reviewing group:** [WRITE_HERE]
- **Commit SHA that was reviewed:** `[Insert Commit SHA here]`
- **Review report received:** [`<CP#>_<YourGroupName>_Review.pdf`](#)

| **Section**          | **Item**                                                                                                                                             | **Score** |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Manual code review   | Code is maintainable, efficient, handles error cases well                                                                                               | x/10      |
| Manual test review   | Tests are complete, errors and edge cases are thoroughly tested, correct assertions are used                                                            | x/10      |
| Manual test review   | Test code is maintainable and well-structured                                                                                                          | x/10      |
| Manual test review   | Test implementation matches the requirements and design                                                                                                | x/10      |
| Manual test review   | Non-functional requirements are tested well                                                                                                            | x/10      |
| Manual test review   | Tests achieve high coverage and cases of < 100% coverage are well-justified                                                                            | x/10      |
| Manual test review   | All back-end tests can be run automatically                                                                                                            | x/10      |
| Automated code review| Codacy runs with the required setup                                                                                                                    | x/10      |
| Automated code review| All remaining Codacy issues are well-justified                                                                                                          | x/10      |

**Major fault reported against your project**

- **Description:** ...
- **Severity:** ...

### 3.3. Actions Taken in Response to the Review

| **Finding** | **Action Taken** | **Commit / Location in Git** |
| ----------- | ---------------- | ---------------------------- |
| ...         | ...              | [`src/...`](#)               |
| ...         | ...              | ...                          |

- **Findings not acted on.** For each finding you decided not to address, give the reason:
  1. **Finding:** ...
     - **Justification:** ...
