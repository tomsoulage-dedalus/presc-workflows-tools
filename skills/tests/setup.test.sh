#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/skills-setup-test.XXXXXX")"

cleanup() {
  if [[ "$(basename "$TEST_ROOT")" == skills-setup-test.* ]] && [ -d "$TEST_ROOT" ]; then
    rm -r -- "$TEST_ROOT"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

new_fixture() {
  CASE_DIR="$TEST_ROOT/$1"
  TOOLS="$CASE_DIR/presc-workflows-tools"
  TARGET_REPO="$CASE_DIR/orme-prescription"
  TEST_HOME="$CASE_DIR/home"
  PERSONAL="$TEST_HOME/.copilot/skills"
  mkdir -p "$TOOLS" "$TEST_HOME" "$PERSONAL"
  cp -R "$SOURCE_ROOT/skills" "$TOOLS/"
  cp "$SOURCE_ROOT/install-skills.sh" "$TOOLS/"
  git init --quiet "$TARGET_REPO"
}

run_setup() {
  HOME="$TEST_HOME" bash "$TOOLS/skills/setup.sh"
}

new_fixture fresh
run_setup > "$CASE_DIR/first.log"
for skill in task-analyze task-implement task-test code-review pr-create \
  gsupport-analyze pr-fix-build story-architecture-diagram; do
  [ -f "$PERSONAL/$skill/SKILL.md" ] || fail "missing skill $skill"
done
[ -L "$PERSONAL/WORKFLOW.md" ] || fail "missing shared contract"
[ -f "$PERSONAL/task-test/../WORKFLOW.md" ] || fail "unresolved relative contract"
[ ! -e "$PERSONAL/tests" ] || fail "test directory installed as a skill"
[ -L "$TARGET_REPO/skills" ] || fail "missing navigation link"
run_setup > "$CASE_DIR/second.log"
cmp "$CASE_DIR/second.log" <(printf '%s\n' \
  "Setup termine. Recharger les skills dans Copilot CLI si necessaire.") \
  || fail "setup is not idempotent"
[ "$(grep -cxF skills "$TARGET_REPO/.git/info/exclude")" = 1 ] \
  || fail "duplicate exclusion"
echo "PASS: fresh installation, shared contract and idempotence"

new_fixture migration
for retired in task-start test-check test-implement code-lint; do
  ln -s "$TOOLS/skills/$retired/" "$PERSONAL/$retired"
done
run_setup > "$CASE_DIR/setup.log"
for retired in task-start test-check test-implement code-lint; do
  [ ! -L "$PERSONAL/$retired" ] || fail "retired link remains: $retired"
done
[ -f "$PERSONAL/task-test/SKILL.md" ] || fail "replacement skill missing"
echo "PASS: migration removes only owned retired links"

new_fixture preserve-retired
mkdir -p "$PERSONAL/task-start"
printf '%s\n' "personal content" > "$PERSONAL/task-start/custom.txt"
ln -s "$CASE_DIR/foreign-checkout/test-check" "$PERSONAL/test-check"
run_setup > "$CASE_DIR/setup.log" 2> "$CASE_DIR/warnings.log"
grep -qF "personal content" "$PERSONAL/task-start/custom.txt" \
  || fail "manual retired copy changed"
[ "$(readlink "$PERSONAL/test-check")" = "$CASE_DIR/foreign-checkout/test-check" ] \
  || fail "foreign retired link changed"
grep -qF "$PERSONAL/task-start" "$CASE_DIR/warnings.log" \
  || fail "manual retired copy not reported"
grep -qF "$PERSONAL/test-check" "$CASE_DIR/warnings.log" \
  || fail "foreign retired link not reported"
echo "PASS: custom retired copies and foreign links preserved and reported"

new_fixture active-conflict
mkdir -p "$PERSONAL/task-test"
printf '%s\n' "personal content" > "$PERSONAL/task-test/custom.txt"
if run_setup > "$CASE_DIR/setup.log" 2>&1; then
  fail "active manual copy accepted"
fi
grep -qF "personal content" "$PERSONAL/task-test/custom.txt" \
  || fail "active manual copy changed"
[ ! -e "$TARGET_REPO/skills" ] || fail "partial installation before conflict"
echo "PASS: active manual copy blocks installation without deletion"

new_fixture foreign-active-link
ln -s "$CASE_DIR/foreign-checkout/task-test" "$PERSONAL/task-test"
if run_setup > "$CASE_DIR/setup.log" 2>&1; then
  fail "foreign active link accepted"
fi
[ "$(readlink "$PERSONAL/task-test")" = "$CASE_DIR/foreign-checkout/task-test" ] \
  || fail "foreign active link changed"
echo "PASS: foreign active link blocks installation without replacement"

new_fixture worktree
git -C "$TARGET_REPO" -c user.name="Skill Test" -c user.email="skill-test@example.invalid" \
  commit --quiet --allow-empty -m "Initial fixture"
mv "$TARGET_REPO" "$CASE_DIR/base"
git -C "$CASE_DIR/base" worktree add --quiet -b skill-test "$TARGET_REPO"
run_setup > "$CASE_DIR/setup.log"
EXCLUDE_FILE="$(git -C "$TARGET_REPO" rev-parse --path-format=absolute --git-path info/exclude)"
grep -qxF skills "$EXCLUDE_FILE" || fail "worktree exclusion missing"
echo "PASS: installation supports a target Git worktree"

new_fixture local-copy
(
  cd "$TARGET_REPO"
  bash "$TOOLS/install-skills.sh"
) > "$CASE_DIR/install.log"
LOCAL_SKILLS="$TARGET_REPO/.github/skills"
[ -f "$LOCAL_SKILLS/task-test/SKILL.md" ] || fail "local replacement skill missing"
[ -f "$LOCAL_SKILLS/WORKFLOW.md" ] || fail "local contract missing"
[ ! -e "$LOCAL_SKILLS/tests" ] || fail "tests copied as local skills"
[ ! -e "$LOCAL_SKILLS/task-start" ] || fail "retired skill copied"
[ ! -e "$TARGET_REPO/.copilot/skills" ] || fail "unsupported discovery path created"
printf '\n%s\n' "personal customization" >> "$LOCAL_SKILLS/task-test/SKILL.md"
if (cd "$TARGET_REPO" && bash "$TOOLS/install-skills.sh") > "$CASE_DIR/reinstall.log" 2>&1; then
  fail "local reinstall overwrote existing paths"
fi
grep -qF "personal customization" "$LOCAL_SKILLS/task-test/SKILL.md" \
  || fail "local customization lost"
echo "PASS: supported local discovery path and safe reinstall refusal"
