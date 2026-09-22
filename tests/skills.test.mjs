import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSkillMd,
  serializeSkillMd,
  validateSkill,
  uniqueSkillName,
  matchSkills,
  skillCatalog,
  skillTool,
  SKILL_TOOL,
} from "../extension/skills.js";
import { prepareTools } from "../extension/core.js";

test("parses Claude-style SKILL.md frontmatter", () => {
  const s = parseSkillMd(
    "---\nname: pdf-helper\ndescription: >\n  Fill PDF forms\n  and merge files.\nlicense: MIT\n---\n\n# PDF\nDo the thing.\n",
  );
  assert.deepEqual(s, {
    name: "pdf-helper",
    description: "Fill PDF forms and merge files.",
    instructions: "# PDF\nDo the thing.",
  });
  assert.equal(
    parseSkillMd(
      "\uFEFF---\r\nname: \"x\"\r\ndescription: 'y: z'\r\n---\r\nbody",
    ).description,
    "y: z",
  );
  assert.deepEqual(parseSkillMd("just text"), {
    name: "",
    description: "",
    instructions: "just text",
  });
});

test("SKILL.md export round-trips", () => {
  const skill = {
    name: "翻译",
    description: "Translate: page or text",
    instructions: "Step 1\nStep 2",
  };
  const back = parseSkillMd(serializeSkillMd(skill));
  assert.deepEqual(back, skill);
  assert.match(
    serializeSkillMd(skill),
    /^---\nname: 翻译\ndescription: "Translate: page or text"\n---\n/,
  );
});

test("validates names, uniqueness, and limits", () => {
  const others = [{ id: "a", name: "Summarize" }];
  const ok = {
    id: "b",
    name: "translate",
    description: "d",
    instructions: "i",
  };
  assert.equal(validateSkill(ok, others), null);
  assert.equal(
    validateSkill({ ...ok, name: "two words" }, others),
    "skillNameInvalid",
  );
  assert.equal(
    validateSkill({ ...ok, name: "summarize" }, others),
    "skillNameTaken",
  );
  assert.equal(
    validateSkill({ ...ok, id: "a", name: "summarize" }, others),
    null,
  );
  assert.equal(
    validateSkill({ ...ok, description: "x".repeat(201) }),
    "skillDescriptionInvalid",
  );
  assert.equal(
    validateSkill({ ...ok, instructions: "" }),
    "skillInstructionsInvalid",
  );
  assert.equal(uniqueSkillName("summarize", others), "summarize-2");
  assert.equal(uniqueSkillName("/my skill", others), "my-skill");
});

test("slash matching prefers name prefixes", () => {
  const skills = [
    { name: "extract-table", description: "Pull data into a table" },
    { name: "table-fix", description: "Fix tables" },
  ];
  assert.deepEqual(
    matchSkills(skills, "tab").map((s) => s.name),
    ["table-fix", "extract-table"],
  );
  assert.equal(matchSkills(skills, "").length, 2);
});

test("only auto skills reach the model, and page tools can't take load_skill", () => {
  const skills = [
    { name: "a", description: "da", auto: true },
    { name: "b", description: "db", auto: false },
  ];
  assert.match(skillCatalog(skills), /- a: da/);
  assert.doesNotMatch(skillCatalog(skills), /- b/);
  assert.deepEqual(skillTool(skills).inputSchema.properties.name.enum, ["a"]);
  assert.equal(skillTool([skills[1]]), null);
  assert.equal(skillCatalog([]), "");
  const [page] = prepareTools(
    [{ name: SKILL_TOOL, inputSchema: {} }],
    [SKILL_TOOL],
  );
  assert.notEqual(page.alias, SKILL_TOOL);
});
