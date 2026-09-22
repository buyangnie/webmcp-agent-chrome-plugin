export const SKILL_TOOL = "load_skill";
export const SKILL_LIMITS = {
  count: 50,
  name: 40,
  description: 200,
  instructions: 20000,
};

export function parseSkillMd(text) {
  const src = String(text).replace(/^\uFEFF/, "");
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
  if (!m) return { name: "", description: "", instructions: src.trim() };
  const meta = {};
  const lines = m[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (/^[>|][+-]?$/.test(value)) {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1]))
        block.push(lines[++i].trim());
      value = block.join(value[0] === ">" ? " " : "\n");
    } else value = value.replace(/^(["'])(.*)\1$/, "$2");
    meta[kv[1].toLowerCase()] = value.trim();
  }
  return {
    name: meta.name || "",
    description: meta.description || "",
    instructions: m[2].trim(),
  };
}

function yamlValue(value) {
  return /^[\w\u00C0-\uFFFF][^:#\n]*$/.test(value) && value.trim() === value
    ? value
    : JSON.stringify(value);
}
export function serializeSkillMd(skill) {
  return `---\nname: ${yamlValue(skill.name)}\ndescription: ${yamlValue(skill.description)}\n---\n\n${skill.instructions.trim()}\n`;
}

export function cleanSkillName(name) {
  return String(name || "")
    .trim()
    .replace(/^\/+/, "");
}
// Returns an i18n message key describing the first problem, or null.
export function validateSkill(skill, others = []) {
  const name = cleanSkillName(skill.name);
  if (!name || /\s/.test(name) || name.length > SKILL_LIMITS.name)
    return "skillNameInvalid";
  if (
    others.some(
      (s) => s.id !== skill.id && s.name.toLowerCase() === name.toLowerCase(),
    )
  )
    return "skillNameTaken";
  const description = String(skill.description || "").trim();
  if (!description || description.length > SKILL_LIMITS.description)
    return "skillDescriptionInvalid";
  const instructions = String(skill.instructions || "").trim();
  if (!instructions || instructions.length > SKILL_LIMITS.instructions)
    return "skillInstructionsInvalid";
  return null;
}
export function uniqueSkillName(name, others) {
  const taken = new Set(others.map((s) => s.name.toLowerCase()));
  const base =
    cleanSkillName(name).replace(/\s+/g, "-").slice(0, 36) || "skill";
  let out = base;
  for (let n = 2; taken.has(out.toLowerCase()); n++) out = `${base}-${n}`;
  return out;
}

export function matchSkills(skills, query) {
  const q = query.toLowerCase();
  return skills
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q),
    )
    .sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(q)) -
        Number(!b.name.toLowerCase().startsWith(q)),
    );
}

export function skillBlock(skill) {
  return `[Skill: ${skill.name}]\nThe user chose this skill for this request. Follow its instructions.\n${skill.instructions}\n[End of skill]`;
}
export function skillCatalog(skills) {
  const auto = skills.filter((s) => s.auto);
  if (!auto.length) return "";
  return [
    `The user has saved these skills. When one clearly fits a request and the user did not already choose it, call ${SKILL_TOOL} with its name and follow the instructions it returns:`,
    ...auto.map((s) => `- ${s.name}: ${s.description}`),
  ].join("\n");
}
export function skillTool(skills) {
  const names = skills.filter((s) => s.auto).map((s) => s.name);
  if (!names.length) return null;
  return {
    alias: SKILL_TOOL,
    name: SKILL_TOOL,
    local: true,
    description:
      "Load the full instructions of one of the user's saved skills. Call it when a skill in the list fits the request.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", enum: names } },
      required: ["name"],
    },
    annotations: { readOnlyHint: true },
  };
}
