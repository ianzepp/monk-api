# TTY Command Issues

This document tracks known issues and limitations discovered during test development.

## Medium Issues

### xargs - No Default Command

**File:** `src/lib/tty/commands/xargs.ts`

**Problem:** Standard xargs defaults to `echo` when no command is provided, but this implementation requires a command argument.

**Expected:** `echo "a b c" | xargs` outputs `a b c`
**Actual:** `xargs: missing command` error

**Fix:** Default `cmdName` to `'echo'` when `parsed.positional.length === 0`.

---

### xargs - `-L` Option Doesn't Preserve Lines

**File:** `src/lib/tty/commands/xargs.ts`

**Problem:** The `-L` option should batch input by lines, but the implementation splits all input by whitespace first, then batches.

**Expected:** `printf "a b\nc d\n" | xargs -L1 echo` outputs `a b` then `c d`
**Actual:** Outputs `a` `b` `c` `d` (one per line)

**Fix:** When `-L` is specified, split by newlines first, not whitespace.

---

### sed - `q` (quit) Command Duplicates Output

**File:** `src/lib/tty/commands/sed.ts`

**Problem:** The quit command outputs the current line twice:
1. Once inside the `case 'q':` block
2. Once after the commands loop in `if (print && !deleted)`

**Expected:** `sed '1q' file` should output just the first line
**Actual:** Outputs the first line twice

**Fix:** Remove the `output.push(line)` inside the `case 'q':` block, or set `print = false` before the output.

---

### sed - Multiple `-e` Flags Not Supported

**File:** `src/lib/tty/commands/sed.ts`

**Problem:** `parseArgs` only stores a single value for the `-e` flag, so only the last `-e` expression is executed.

**Expected:** `sed -e 's/a/A/' -e 's/b/B/' file` should run both substitutions
**Actual:** Only runs `s/b/B/`

**Workaround:** Use semicolon-separated commands: `sed 's/a/A/; s/b/B/' file`

**Fix:** Modify parseArgs to support array values for repeated flags, or accumulate `-e` values separately.

---


### dirname - Root `/` Returns `.` Instead of `/`

**File:** `src/lib/tty/commands/dirname.ts`

**Problem:** The implementation strips trailing slashes first, so `/` becomes empty string, which then returns `.`.

**Expected:** `dirname /` returns `/`
**Actual:** `dirname /` returns `.`

**Fix:** Add special case for `/` before stripping trailing slashes.

---

## Low Priority Issues

### seq - Negative Numbers Treated as Options

**File:** `src/lib/tty/commands/seq.ts`

**Problem:** Arguments starting with `-` are treated as option flags, not negative numbers.

**Expected:** `seq -2 2` should output `-2 -1 0 1 2`
**Actual:** `-2` is parsed as an option flag

**Fix:** Use `--` to separate options from positional args, or add special handling for numeric args.

---

### cut - Open-ended Ranges Not Supported

**File:** `src/lib/tty/commands/cut.ts`

**Problem:** Range specs like `3-` (from 3 to end) and `-3` (from start to 3) are not implemented.

**Expected:** `cut -c3-` extracts characters from position 3 to end
**Actual:** Produces incorrect or empty output

**Fix:** Update `parseRanges` and `parseCharRanges` to handle open-ended ranges.

---

### head/tail - `-n3` Format Not Supported

**File:** `src/lib/tty/commands/head.ts`, `src/lib/tty/commands/tail.ts`

**Problem:** The `-nN` format (no space between flag and value) is not parsed correctly.

**Expected:** `head -n3` and `head -n 3` should be equivalent
**Actual:** Only `head -n 3` works

**Fix:** Add option parsing logic to handle `-n<number>` format.

---

### grep - Returns Exit Code 1 for Errors

**File:** `src/lib/tty/commands/grep.ts`

**Problem:** Standard grep returns exit code 2 for errors (invalid regex, etc.), but this implementation returns 1.

**Expected:** Exit code 2 for errors
**Actual:** Exit code 1 for errors

**Impact:** Low - scripts that check for grep errors may behave incorrectly.

---

### test - Compound Expressions Not Supported

**File:** `src/lib/tty/commands/test.ts`

**Problem:** The `-a` (and) and `-o` (or) operators for compound expressions are not implemented.

**Expected:** `test -n a -a -n b` should return true
**Actual:** "too many arguments" error

**Workaround:** Use shell operators: `test -n a && test -n b`

---

### jq - Limited Feature Set

**File:** `src/lib/tty/commands/jq.ts`

**Problem:** Only basic features are implemented:
- Identity (`.`)
- Field access (`.field`, `.field.nested`)
- Array access (`.[n]`, `.[]`)

**Missing features:**
- Pipes (`.field | .nested`)
- Object construction (`{a: .b}`)
- Array construction (`[.a, .b]`)
- Built-in functions (`map`, `select`, `keys`, etc.)
- Arithmetic operations
- Conditionals
- Slicing

**Impact:** Many common jq use cases won't work.

---

## Notes

- Tests have been adjusted to match actual command behavior
- Issues marked with "Fix:" include suggested remediation
- Priority based on likelihood of user impact
