import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diagnose,
  lintTools,
  schemaTemplate,
  validateArgs,
} from "../extension/inspect.js";

const env = {
  secure: true,
  originAgentCluster: true,
  readyState: "complete",
  frames: 0,
  hasModelContext: true,
  hasGetTools: true,
  hasTesting: false,
};
const keys = (list) => list.map((f) => `${f.level}:${f.key}`);

test("diagnosis explains why a page has no tools", () => {
  assert.deepEqual(keys(diagnose(null)), ["error:diagPageBlocked"]);
  assert.deepEqual(
    keys(
      diagnose({
        env: {
          ...env,
          secure: false,
          hasModelContext: false,
          hasGetTools: false,
          originAgentCluster: false,
          frames: 2,
        },
        mode: "none",
        tools: [],
      }),
    ),
    [
      "ok:diagPageReadable",
      "error:diagInsecure",
      "error:diagApiMissing",
      "warn:diagIsolation",
      "info:diagFrames",
    ],
  );
  assert.deepEqual(
    keys(diagnose({ env, mode: "document.modelContext", tools: [] })),
    [
      "ok:diagPageReadable",
      "ok:diagSecure",
      "ok:diagApi",
      "warn:diagToolsNone",
    ],
  );
  const failed = diagnose({
    env,
    mode: "document.modelContext",
    tools: [],
    toolsError: "boom",
  });
  assert.deepEqual(failed.at(-1), {
    level: "error",
    key: "diagToolsError",
    args: ["boom"],
  });
});

test("lint flags naming, description, schema, and approval problems", () => {
  const [a, b, c, d] = lintTools([
    {
      name: "get ticket",
      description: "",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          s: { type: "bogus", description: "x", enum: [] },
        },
        required: ["id", "missing"],
      },
      annotations: { readOnlyHint: true },
    },
    { name: "dup", description: "ok", inputSchema: { type: "array" } },
    { name: "dup", description: "ok", schemaError: "Unexpected token" },
    {
      name: "fine",
      description: "Does a thing",
      annotations: { readOnlyHint: true },
    },
  ]);
  assert.deepEqual(keys(a), [
    "warn:lintNameRenamed",
    "warn:lintDescriptionMissing",
    "error:lintRequiredUnknown",
    "error:lintParamType",
    "error:lintEnumEmpty",
    "warn:lintParamUndocumented",
  ]);
  assert.equal(a[0].args[0], "get_ticket");
  assert.deepEqual(keys(b), [
    "error:lintNameDuplicate",
    "error:lintSchemaType",
    "info:lintNeedsApproval",
  ]);
  assert.deepEqual(keys(c), [
    "error:lintNameDuplicate",
    "error:lintSchemaUnparsable",
    "info:lintNeedsApproval",
  ]);
  assert.deepEqual(d, []);
});

test("templates fill required parameters only", () => {
  assert.deepEqual(
    schemaTemplate({
      type: "object",
      properties: { id: { type: "string" }, limit: { type: "integer" } },
      required: ["id"],
    }),
    { id: "" },
  );
  assert.deepEqual(
    schemaTemplate({ type: "object", properties: { a: {} } }),
    {},
  );
});

test("templates use defaults, enums, and type placeholders", () => {
  assert.deepEqual(
    schemaTemplate({
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["open", "closed"] },
        limit: { type: "integer", minimum: 1 },
        all: { type: "boolean", default: true },
        tags: { type: "array" },
        where: {
          type: "object",
          properties: { q: { type: "string", examples: ["net"] } },
          required: ["q"],
        },
      },
      required: ["id", "status", "limit", "all", "tags", "where"],
    }),
    {
      id: "",
      status: "open",
      limit: 1,
      all: true,
      tags: [],
      where: { q: "net" },
    },
  );
});

test("argument validation reports paths", () => {
  const schema = {
    type: "object",
    properties: {
      id: { type: "string", minLength: 3 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
      status: { enum: ["open", "closed"] },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["id"],
    additionalProperties: false,
  };
  assert.deepEqual(validateArgs(schema, { id: "INC-1", limit: 5 }), []);
  assert.deepEqual(
    keys(
      validateArgs(schema, { limit: 2.5, status: "x", tags: [1], extra: 1 }),
    ),
    [
      "error:argRequired",
      "error:argType",
      "error:argEnum",
      "error:argType",
      "error:argUnknown",
    ],
  );
  assert.deepEqual(validateArgs(schema, { id: "ab" })[0].args, ["/id", 3]);
  assert.equal(validateArgs({ type: "number" }, 3).length, 0);
});
