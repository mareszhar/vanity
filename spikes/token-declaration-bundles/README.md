# Spike: token declaration bundles

This spike isolates the type law behind `$dec` before the implementation is used by Hail:

- a leaf projects its final path segment;
- a bundle projects property leaves and registered condition groups;
- an ordinary namespace produces a readable type diagnostic instead of being flattened;
- `$` metadata does not leak into recursive token consumers.

The permanent product evidence lives in `sdk/src/tokens/declarations.{test,test-d,dx.test}.ts`; this directory preserves the smaller model that made the recursive shape and diagnostic placement easy to reason about.
