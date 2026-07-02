/**
 * Skill-mirror drift gate.
 *
 * The repo-local skills are maintained as byte-identical copies in `.claude/skills/<name>`
 * (Claude Code) and `.agents/skills/<name>` (Cursor/Codex). Nothing previously asserted the
 * two stayed equal, so edits to one mirror silently rotted the other. This gate fails when a
 * mirrored skill differs between the trees. A skill missing on BOTH sides passes (not yet
 * created); a skill present on only one side fails.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const MIRRORED_SKILLS = ["draft", "repo", "sdlc"];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs));
    else out.push(abs);
  }
  return out;
}

export function compareSkill(skill: string, root = repoRoot): string[] {
  const problems: string[] = [];
  const claudeDir = path.join(root, ".claude/skills", skill);
  const agentsDir = path.join(root, ".agents/skills", skill);
  const claudeExists = existsSync(claudeDir);
  const agentsExists = existsSync(agentsDir);
  if (!claudeExists && !agentsExists) return problems; // not yet created — pass
  if (claudeExists !== agentsExists) {
    problems.push(`skill "${skill}" exists in ${claudeExists ? ".claude" : ".agents"} but not the other mirror`);
    return problems;
  }
  const claudeFiles = new Map(listFiles(claudeDir).map((f) => [path.relative(claudeDir, f), f]));
  const agentsFiles = new Map(listFiles(agentsDir).map((f) => [path.relative(agentsDir, f), f]));
  for (const [rel, abs] of claudeFiles) {
    const counterpart = agentsFiles.get(rel);
    if (!counterpart) {
      problems.push(`${skill}/${rel} exists only in .claude/skills`);
      continue;
    }
    if (statSync(abs).size !== statSync(counterpart).size || !readFileSync(abs).equals(readFileSync(counterpart))) {
      problems.push(`${skill}/${rel} differs between .claude and .agents mirrors`);
    }
  }
  for (const rel of agentsFiles.keys()) {
    if (!claudeFiles.has(rel)) problems.push(`${skill}/${rel} exists only in .agents/skills`);
  }
  return problems;
}

function main() {
  const problems = MIRRORED_SKILLS.flatMap((skill) => compareSkill(skill));
  if (problems.length > 0) {
    console.error("skill-mirror gate failed:");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("\nCopy the edited skill over its mirror so .claude/skills and .agents/skills stay byte-identical.");
    process.exit(1);
  }
  console.log(`skill mirrors OK: ${MIRRORED_SKILLS.join(", ")}.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename);
if (invokedDirectly) main();
