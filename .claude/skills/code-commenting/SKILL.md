---
name: "code-commenting"
description: "Use when writing, adding, or reviewing comments in code, or when asked to comment, document, or clean up comments in a file or PR."
---

# How to write comments

Follow these rules whenever you write or review code comments. They come from the CPEN 321 (UBC) Code Reviews lecture.

## Rules

1. **Explain *why*, not *what*.** The code shows what it does. Use the comment for the reason behind it.
2. **Ask if the comment is needed.** If clearer names or a well-named helper method would make it pointless, refactor instead.
3. **Document behaviour that isn't obvious.** Edge cases, side effects, workarounds and odd constraints always get a comment.
4. **Keep comments accurate.** A comment that contradicts the code is worse than none. When you change the code, update its comments in the same change.
5. **Don't narrate the code.** Skip line-by-line walkthroughs like "loop through every index, get the third value...".
6. **Don't add labels the code already makes obvious,** like `// Main screen` above `MainScreen()`.
7. **Don't leave commented-out or unused code.** Version control keeps the history.
8. **Don't use comments to cover up bad names or magic numbers.** Rename the thing, or make the number a named constant.
9. **Write doc comments that match the function's real contract:** what it takes in, what it returns, and what errors it can produce.
10. **Test it:** read the code without its PR title or description. If you can't tell why it works the way it does, add a comment.

## Example

```kotlin
// BAD: says what the code does
// increment retries
retries++

// GOOD: says why
// The server rate-limits bursts, so back off before retrying.
retries++
```

## When reviewing code

- Flag comments that restate the code, contradict it, or label the obvious.
- Flag commented-out code and unused code.
- Where the reason behind non-obvious logic is missing, ask for a comment that explains why.
- Prefer suggesting a rename or refactor over adding a comment when that would make the code clear by itself.