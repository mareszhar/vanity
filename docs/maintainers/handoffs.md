# vanity — handoffs and round reports

A change to Vanity is planned in a handoff, executed against a tracker, reviewed in round reports, and announced in a changelog. This document defines what each record owns, why none of them is tracked, and the practice that has to hold across a multi-pass change.

The method does not assume who does the work. A planner, an implementer, and a reviewer are roles, not people; one person may hold all three, and an agent may hold any of them.

## 1. The four records

| Record | Bridges | Lives in | Held by |
| --- | --- | --- | --- |
| handoff | the last release and the next one | `__temp__/<version>-handoff.md` | planner |
| execution tracker | one execution across context compression | `__temp__/<version>-handoff-execution-tracker.md` | implementer |
| round report | one execution pass and the next | `__temp__/<version>-round-<n>-report.md`, one per round | reviewer |
| changelog | one released version and the next, for a consumer | `__temp__/<version>-changelog.md`, then the GitHub release | planner |

A handoff states what the next release changes about the released one: the defects it removes, the behavior it requires, the design it commits to, the evidence that closes it, and the sequence to reach it. It is written against the released state, so it reads the same on the first pass and the fourth.

An execution tracker is the implementer's own record and the thing that survives a compressed context. Everything needed to resume belongs in it rather than in recollection. It names files, commands, and decisions as they were at the time; it is not maintained after the change ships.

A round report reviews one execution: what was built well, what is wrong, what evidence proves or fails to prove, and what in the working tree needs realigning before the next pass. It also summarizes any change made to the handoff, so the implementer knows what moved under them. Each round gets its own report, and none is rewritten afterwards. When an initiative takes more rounds than expected, the sequence of reports is the evidence a fresh reviewer uses to see why, and it exists nowhere else. Once the release ships, its round reports have done their job and are deleted; the handoff, tracker, and changelog remain.

A changelog tells a consumer what moved between versions, in their vocabulary rather than the mechanism's.

A **probe** is not a record but the scratch execution behind one: a script or fixture any role writes to establish a fact — a count, a host behavior, a reproduction — for a plan, a review, or an execution. A release's probes live in `__temp__/<version>-probes/`, one directory per question, named for it. A probe may import the SDK, and a comment saying how to run it is all the ceremony it needs. No record depends on one: a handoff carries each fact and its own reproduction, so a probe only spares the next reader the rebuild. A probe whose finding will govern a standing design is not promoted as it stands; it is rewritten as a [spike](./workspace.md#51-spikes).

## 2. What belongs where

One boundary carries most of the value:

> **A change relative to the released state belongs in the handoff. Feedback on an execution belongs in the round report.**

A handoff has no memory of execution. It never records what has been built, what was reverted, or what is currently green — a sentence like *"do not revert the work already in the tree"* is round-report material. This holds even when a discovery arrives mid-execution: if implementing reveals a further defect in the released code, the handoff gains a plan for it, written as though nobody had started. Written that way, an amendment is also re-read against every requirement, evidence row, and revert check it touches, so the implementer never meets a contradiction the patch left behind.

Working-tree state is the round report's job, and it needs to be explicit rather than implied. When a pass ends with a tree that diverges from what the next pass should start from, the report says per file what survives, what is reshaped, what is deleted, and what is rewritten. A single revert command is rarely enough, and a revert that discards unrecoverable work is preceded by writing a patch file.

## 3. Why none of this is tracked

[Language §0](../language.md#0-house-style-and-naming-law) is the reason: a document describes how Vanity works now, and the repository keeps no diary. A handoff states what is wrong and what does not exist yet; a tracker records attempts. Committing either would put stale claims in the search path of every future reader, and an `archive/` directory would not help — a grep does not read directory names, and neither does a reader in a hurry.

`__temp__/` is ignored for that reason, not by oversight. The changelog's durable home is the GitHub release that the publish flow's tag creates.

A fact worth keeping outlives its handoff by moving into a canonical document — a reference contract, [architecture](./architecture.md), [decisions](./decisions.md), [testing](./testing.md), or this one — rewritten in current-facts voice. Nothing else survives, and nothing needs to.

## 4. Standing practice

Each rule prevents a failure a green suite does not report.

**Establish a domain before prescribing a fix.** A plan derived from a single reproduction describes that reproduction. Before writing a correction, a constant, a spelling, or a guard into a handoff, state the full set of inputs it must hold over — every caller of the function, both platforms, each shape a host can hand you. A guard placed without its domain breaks a caller nobody enumerated.

**Specify the shape of a new mechanism, not only its outcome.** When a requirement needs machinery the code does not have yet, the handoff names the shape it expects, names the shapes it rules out, and states structural acceptance beside behavioral acceptance. An outcome alone invites whichever mechanism reaches it first, and a green suite cannot tell a legible mechanism from a clever one.

**Prove unproven host behavior before building on it.** When a design rests on what a host, bundler, or runtime does and nothing has shown it yet, the plan opens with a spike, and each claim states beforehand what the plan does if it fails: continue on a named fallback, or stop and raise it. An implementer who meets a surprise then already knows its consequence instead of improvising one.

**A fact established by execution belongs in the handoff, not just the conclusion drawn from it.** A reviewer who verifies how a host rewrites a URL, and then writes only "fix the cache," has withheld the half that makes the fix testable.

**Prove each change is load-bearing before acceptance.** Revert every behavioral change alone against the finished tree and confirm a named test turns red, then restore it. A change that cannot be made to fail is either untested, unnecessary, or a defensive invariant that no current behavior exercises. The last kind stays in code with a comment naming the condition under which it would matter, and gets no mechanism test built to force a red. This is scaffolding under [testing §1.3](./testing.md#13-what-earns-a-persisted-test) — run it, read it, discard it — and never a persisted test.

**Check that a new export has a caller before the phase closes.** A mechanism can be created dead as easily as broken silently, and no suite reports it.

**Disclose a weak evidence leg.** Saying which leg of an argument is thin is what lets the next reviewer aim at it. A summary that reads as uniformly strong hides the one place worth looking. In a handoff, that means separating facts established by running something, with the environment and a reproduction, from facts found only by reading code, which the implementer confirms before relying on them.

**Raise an environment block; never route around it.** When the pinned toolchain or a sandbox cannot run a gate, stop and say so. A substituted package-manager version, or a tracked script edited to suit one machine, changes what the evidence proves and ships drift nobody reviewed.

**Challenge the plan.** An implementer who senses a step is wrong says so before building it. Silent compliance and silent deviation are both failures; raising the concern is the guard.

Evidence rules that outlive any single change live in [testing](./testing.md): §1.3 governs which promises earn a persisted test, and §1.4 governs round-trip evidence for two-sided contracts.

## 5. Choosing the version

A version numbers the contract, not the diff. See [workspace §8](./workspace.md#8-releases).
