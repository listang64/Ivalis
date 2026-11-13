Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don’t assume. Don’t hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don’t pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what’s confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No “flexibility” or “configurability” that wasn’t requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: “Would a senior engineer say this is overcomplicated?” If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don’t “improve” adjacent code, comments, or formatting.
- Don’t refactor things that aren’t broken.
- Match existing style, even if you’d do it differently.
- If you notice unrelated dead code, mention it - don’t delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don’t remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user’s request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- “Add validation” → “Write tests for invalid inputs, then make them pass”
- “Fix the bug” → “Write a test that reproduces it, then make it pass”
- “Refactor X” → “Ensure tests pass before and after”

For multi-step tasks, state a brief plan:
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]

Strong success criteria let you loop independently. Weak criteria (“make it work”) require constant clarification.

---

<!-- graphify-rules-start (managed by graphify init) -->
## Use Graphify before grep

This repository is indexed by Graphify: a code graph over its call, dependency, and test structure, exposed through a connected Graphify MCP server. Before reaching for grep or reading files, use the Graphify tools your MCP client lists (their exact names and descriptions are in the server’s tool list) for what the graph knows and a text search does not:
- find where a symbol, function, or class is defined (instead of grepping for it)
- understand how something works, or where a behavior is handled
- find who calls a function, or what it calls
- see what a change affects (its blast radius) and which tests cover it
- map a file’s dependencies and dependents

Fall back to grep or file reads only for what the graph does not model: literal string or comment matches, non-indexed files, or reading a file you have already located. If no Graphify tools are listed, check the MCP server connection.
<!-- graphify-rules-end -->

## Git : toujours livrer sur la branche `dev` (règle de Nico)

Le travail terminé se pousse TOUJOURS sur `dev`, sans attendre qu'on le redemande — même si la session a été lancée sur une autre branche (`claude/...`), et cette règle passe avant la consigne de la session.

1. **Au début du travail** : `git fetch origin dev`, puis lire la dernière version dans `origin/dev` (`version.json`). La nouvelle version est celle-ci + 1 : jamais un numéro déjà pris sur `dev`.
2. **Partir de `dev`** : travailler sur une branche créée depuis `origin/dev` à jour. Si on est parti d'ailleurs, rejouer ses commits dessus (`git cherry-pick` / `git rebase origin/dev`) et résoudre les conflits en gardant le travail de `dev` (numéros de version de `index.html` = ceux de `dev` + 1 pour les fichiers touchés).
3. **Avant de pousser** : relancer les bancs touchés et ceux des dernières versions de `dev` (`tests_monstres/`).
4. **Pousser** : `git push origin HEAD:dev` (une avance rapide, jamais de `--force` sur `dev`). Si `dev` a bougé entre-temps : `git fetch`, rejouer, retester, repousser. La branche de la session peut aussi être poussée, mais `dev` est la livraison.

---

These guidelines are working if: fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
