# AgentOffice code documentation standard

## Scope

New and materially changed exported functions, public methods, classes and nontrivial internal functions must be documented. Simple local accessors may use a short explanation where useful; avoid repeating a self-explanatory expression. Existing modules are documented incrementally as they are changed, prioritizing auth, update/release, persistence, renderer and motion contracts.

## JavaScript

Place a JSDoc block immediately above the declaration. Describe intent, relevant types, units, defaults, return value, errors and side effects. For object parameters document important properties or use a named typedef when the structure is shared. Example:

```js
/**
 * Computes a normalized progress value from elapsed time.
 * @param {number} elapsedMs - Elapsed time in milliseconds.
 * @param {number} durationMs - Positive duration in milliseconds.
 * @returns {number} Progress in the range [0, 1].
 * @throws {RangeError} If duration is not positive.
 */
function progress(elapsedMs, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new RangeError('Duration must be positive');
  }
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
```

## Python

Place a triple-quoted docstring as the first statement in the function, using a concise summary and Args, Returns and Raises sections where appropriate. Use type annotations for new interfaces where practical. Example:

```python
def validate_duration(duration_ms: float) -> None:
    """Reject an invalid duration before scheduling a transition.

    Args:
        duration_ms: Duration in milliseconds.

    Raises:
        ValueError: If the duration is not positive.
    """
    if duration_ms <= 0:
        raise ValueError("Duration must be positive")
```

## Review requirements

- Explain why a non-obvious decision exists rather than restating the code.
- Describe lifecycle, cancellation, disposal, threading and security boundaries when relevant.
- Document assumptions, coordinate systems, units and experimental limitations. Do not promise collision-free motion or performance that has not been measured.
- Keep documentation in English, alongside canonical source; do not manually edit generated copies.
- Update docs and focused tests in the same PR as changed behavior. Review documentation accuracy along with correctness, security and coverage.

## References

- [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html#jsdoc-method-and-function-comments)
- [Python PEP 8](https://peps.python.org/pep-0008/)
- [Python PEP 257](https://peps.python.org/pep-0257/)
