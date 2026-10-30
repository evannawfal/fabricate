---
name: "code-commenting"
description: "Use when writing, adding, or reviewing comments in code, or when asked to comment, document, or clean up comments in a file or PR."
---

# How to write comments (CPEN 321, UBC)

This skill follows the CPEN 321 Software Engineering lecture **W7 L1 Code Reviews** (slides 21-35 and 50), plus the matching code-issue slides in **W5 L1 Design II** (slides 61, 62, 67). Sections 1-8 come from those slides. Section 9 sets how high the bar for a comment is, based on what reviewers on this project have flagged. Apply the rules both when writing comments and when reviewing someone else's code.

## 1. The core principle (slide 27)

- **No comments at all is bad.**
- **But not all comments are good.**
- There is a fine line between comments that make the code clearer and comments that make it harder to follow.

The goal is neither "more comments" nor "fewer comments", but the *right* comments.

## 2. The three questions to ask about every comment (slide 30)

Before you write a comment, and when you review one, ask:

1. **Does the comment explain "why" and not "what"?**
2. **Is it necessary? Can you refactor the code so the comment isn't required?**
3. **Are obscure behaviors documented?**

If a comment only says "what", delete it or replace it with a "why". If refactoring (for example, a better name) makes the comment unnecessary, refactor instead. If something in the code would surprise a reader, it must be documented.

## 3. Bad comment patterns, with the lecture's examples

### 3a. Comments that restate the code (slide 28)

These only repeat what the line already says, so they add nothing:

```c
// Add one to i.
i++;

// Lock to protect against concurrent access.
SpinLock mutex;

// This function swaps the panels.
void swap_panels(Panel* p1, Panel* p2) {...}
```

Rule: never write a comment that a reader could produce just by reading the next line.

### 3b. Comments that narrate the code step by step (slide 29)

```
// Loop through every array index, get the
// third value of the list in the content to
// determine if it has the symbol we are looking
// for. Set the result to the symbol if we
// find it.
```

This is a long "what" comment. It walks through the mechanics instead of explaining the purpose or reason. Rule: do not translate code into English line by line. If the logic is that hard to follow, refactor it (clearer names, smaller well-named functions), then comment only on why.

### 3c. Unnecessary label comments (slide 31; also W5 slide 61, from M1 projects)

```kotlin
// Main screen
composable(MAIN_ROUTE) { MainScreen(navController = navController) }
// Connection screen
composable("connection_screen") { ConnectionScreen() }
// Picture screen
composable("picture_screen") { PictureScreen() }
// Surprise screen
composable("surprise_screen") { SurpriseScreen() }
```

Each comment repeats the function name directly below it. Rule: do not label code whose names already say what it is. Remove these comments.

### 3d. Comments that explain a meaningless name (slide 32)

Bad:
```java
int tmp = 86400;  // tmp is the number of seconds in a day
```

Good:
```java
int secondsPerDay = 86400;
```

The comment only exists because the name is meaningless. Rule (from question 2 on slide 30): refactor so the comment isn't required. Give the variable a meaningful name and drop the comment.

### 3e. Comments that contradict the code (slide 34; also W5 slide 62, from M1 projects)

```kotlin
/**
 * Calls GET {apiBaseUrl}/name and returns the parsed [Name].
 */
suspend fun fetchMyIp(): Result<String> = withContext(Dispatchers.IO) {
    val ipUrl = "http://ifconfig.me/ip"
    val connection = URL(ipUrl).openConnection() as HttpURLConnection
    Result.success(connection.inputStream.bufferedReader().use { it.readText() })
}
```

The doc comment says the function calls `{apiBaseUrl}/name` and returns a `Name`, but the function is `fetchMyIp()` and actually fetches an IP address from `ifconfig.me`. The lecture labels this "comment contradicting the code" and "disagreement between code and specification". Rule: a comment must always match what the code does. When the code changes, update the comment at the same time. A wrong comment is actively misleading.

## 4. When comments are missing (slides 20-21)

```java
public int countPositive(int[] x) {
int j = 0;
for (int i = 0; i < x.length; i++) {
if (x[i] >= 0) {
j++;
}
}
return j;
}
```

The lecture's review notes on this code are: **"Comments!"**, **"Correct behavior?"**, **"Indentation!"**, **"Meaningful names: count"**.

What this shows:
- Code with no comments and no explanation gets flagged in review.
- Comments go together with meaningful names (`j` should be `count`) and correct indentation. They are part of readability, not a replacement for it.
- The check `x[i] >= 0` also counts zero, which a function named `countPositive` should not. Behavior like this must be either fixed or documented. That is the "are obscure behaviors documented?" question from slide 30.

## 5. Commented-out and unused code (slide 50; W5 slide 67)

- **DON'T** leave unused or commented-out code.
- W5 slide 67 gives examples: unused imports, and trailing functions or variables left over from formerly active code.
- Delete them instead of commenting them out.

## 6. Comments in code review (slides 22, 24)

- Slide 22 lists **"Documentation / comments"** as one of the common code smells reviewers look for, alongside understandability and readability, coding standards, and design.
- Slide 24 (a quote from a Facebook developer) says a reviewer should:
  - First check understandability by reading the change **without** reading its title and description, because those won't be available when the code needs to be changed or maintained 6 months later. Once you understand the code, compare your understanding with the title and description. If they disagree, either the code doesn't do what it's supposed to, or it is confusing.
  - **"Ask for meaningful comments."**

Rule: write comments so that someone reading only the code, months later and without the PR description, understands why it works the way it does.

## 7. Follow the project's style (slide 35)

- Each project has its own style (indentation, bracket position, naming convention), and you should follow it. This includes comment style.
- Don't reformat every module you touch to match your personal style. Be a team player.

## 8. Summary checklist (slide 50, comment-related items)

**DO:**
- Write meaningful comments where they are needed.
- Use meaningful and consistent names, so fewer comments are needed.
- Follow style guidelines.

**DON'T:**
- Leave unused or commented-out code.
- Use unclear naming or inconsistent conventions, then try to explain it with comments.
- Leave hardcoded values and magic numbers. Name them instead of explaining them in a comment (see `secondsPerDay` above).
  - Put the named constant where the project keeps its constants. If the project has a shared constants file, add it there rather than at the top of the module that uses it, and keep any "why" comment next to the constant. Before adding a new one, look for an existing constants file.

## 9. How high the bar is

A comment can explain "why" and still be one too many. Reviewers flag comments that tell them something the code already shows, even when the comment is phrased as a reason. Keep a comment only if it passes all of these checks:

- **Would a teammate get it wrong without it?** Comment when a competent teammate reading the code would misunderstand it, be surprised by it, or "fix" it into a bug. Explaining a choice they would accept without a second thought doesn't count.
- **Do the names and types already say it?** Don't restate what a type shows (`User | null` already says the value can be missing), what an error class's name says (`ServiceUnavailableError`), or what a constant's name says (`MAX_RETRIES`).
- **No comments on data shapes.** In interfaces, types, schemas and config objects, the field names and types are the documentation. Don't add a comment per field, example values ("e.g. ..."), or a header saying what the type is or where it's used. If a field needs explaining, rename it.
- **Say it once, where it happens.** Don't describe behavior at a distance, like a config entry or a call site saying what another module does when the value is missing. If that behavior needs a comment, it goes on the code that does it, and only there.
- **Don't annotate error handling the code already shows.** A `catch` that rethrows as a named error, or a function whose `throw` is visible a few lines down, doesn't need a comment listing which failures end up there.
- **One line.** A comment that needs two lines of justification is usually defending a design decision. That belongs in the PR description or design doc, not in the code.
- **Match how much the team comments.** Look at a few files teammates wrote. If their everyday code (routes, controllers, services) has a comment every 20-30 lines, don't put one every 5. Algorithmic or numerical code (geometry, parsing an external format) is where denser comments earn their place.
- **When in doubt, leave it out.** A missing comment costs one review question. A needless one costs every reader after that, and reviewers will flag it.

## How to apply this skill

**When writing code:**
1. Choose meaningful names first (3d), and put named constants where the project keeps them (section 8).
2. Add a comment only where it answers "why" or documents behavior that isn't obvious (section 2).
3. Check every comment against section 9 and delete the ones that don't pass.
4. Make sure every doc comment matches what the function actually does (3e).
5. Remove commented-out and unused code (section 5).
6. Match the project's existing comment style (section 7).

**When reviewing code**, flag:
- "What" comments that restate the code (3a, 3b, 3c) and suggest deleting them.
- Comments that fail a section 9 check, such as per-field comments on a data shape or a comment repeating what a type or name says.
- Comments that explain a bad name (3d) and suggest a rename instead.
- Comments that contradict the code (3e). Treat these as bugs.
- Missing explanations for non-obvious or surprising behavior (section 4), and ask for meaningful comments.
- Commented-out or unused code (section 5).