import { prepareTools, requiresConfirmation } from "./core.js";

export const DESCRIPTION_LIMIT = 1000;
const TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null",
];

// Each finding is { level: "ok" | "info" | "warn" | "error", key, args }.
// Keys are i18n message names; args fill their placeholders.
const f = (level, key, ...args) => ({ level, key, args });

// `result` is the bridge's "inspect" response, or null when Chrome refused
// to run scripts in the page.
export function diagnose(result) {
  if (!result) return [f("error", "diagPageBlocked")];
  const { env, mode, tools, toolsError } = result;
  const out = [f("ok", "diagPageReadable")];
  out.push(env.secure ? f("ok", "diagSecure") : f("error", "diagInsecure"));
  if (mode === "document.modelContext") out.push(f("ok", "diagApi"));
  else if (mode === "navigator.modelContextTesting")
    out.push(f("warn", "diagApiLegacy"));
  else if (env.hasModelContext && !env.hasGetTools)
    out.push(f("error", "diagApiPartial"));
  else out.push(f("error", "diagApiMissing"));
  if (mode === "none" && env.originAgentCluster === false)
    out.push(f("warn", "diagIsolation"));
  if (toolsError) out.push(f("error", "diagToolsError", toolsError));
  else if (mode !== "none")
    out.push(
      tools.length
        ? f("ok", "diagTools", tools.length)
        : f("warn", "diagToolsNone"),
    );
  if (env.readyState !== "complete") out.push(f("info", "diagLoading"));
  if (env.frames) out.push(f("info", "diagFrames", env.frames));
  return out;
}

export function lintTools(tools) {
  const aliases = prepareTools(tools);
  const counts = new Map();
  for (const t of tools) counts.set(t.name, (counts.get(t.name) || 0) + 1);
  return tools.map((tool, i) => {
    const out = [];
    const name = String(tool.name || "");
    if (!name) out.push(f("error", "lintNameMissing"));
    else if (!aliases[i].alias.startsWith(name))
      out.push(f("warn", "lintNameRenamed", aliases[i].alias));
    if (name && counts.get(name) > 1) out.push(f("error", "lintNameDuplicate"));
    const description = String(tool.description || "").trim();
    if (!description) out.push(f("warn", "lintDescriptionMissing"));
    else if (description.length > DESCRIPTION_LIMIT)
      out.push(f("warn", "lintDescriptionLong", description.length));
    if (tool.schemaError)
      out.push(f("error", "lintSchemaUnparsable", tool.schemaError));
    else out.push(...lintSchema(tool.inputSchema));
    if (requiresConfirmation(tool)) out.push(f("info", "lintNeedsApproval"));
    return out;
  });
}

function lintSchema(schema) {
  if (schema === undefined || schema === null) return [];
  if (typeof schema !== "object" || Array.isArray(schema))
    return [f("error", "lintSchemaNotObject")];
  if (schema.type !== undefined && schema.type !== "object")
    return [f("error", "lintSchemaType", String(schema.type))];
  const out = [];
  const props = schema.properties ?? {};
  if (typeof props !== "object" || Array.isArray(props))
    return [f("error", "lintPropertiesInvalid")];
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required))
      out.push(f("error", "lintRequiredInvalid"));
    else
      for (const key of schema.required)
        if (!(key in props)) out.push(f("error", "lintRequiredUnknown", key));
  }
  const undocumented = [];
  for (const [key, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") {
      out.push(f("error", "lintParamInvalid", key));
      continue;
    }
    if (
      prop.type !== undefined &&
      ![prop.type].flat().every((t) => TYPES.includes(t))
    )
      out.push(f("error", "lintParamType", key, String(prop.type)));
    if (Array.isArray(prop.enum) && !prop.enum.length)
      out.push(f("error", "lintEnumEmpty", key));
    if (!String(prop.description || "").trim()) undocumented.push(key);
  }
  if (undocumented.length)
    out.push(f("warn", "lintParamUndocumented", undocumented.join(", ")));
  return out;
}

export function schemaTemplate(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 6) return {};
  if (schema.default !== undefined) return schema.default;
  if (Array.isArray(schema.examples) && schema.examples.length)
    return schema.examples[0];
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  const type =
    [schema.type].flat()[0] ?? (schema.properties ? "object" : undefined);
  if (type === "object") {
    const out = {};
    const props = schema.properties || {};
    for (const key of Array.isArray(schema.required) ? schema.required : [])
      if (key in props) out[key] = schemaTemplate(props[key], depth + 1);
    return out;
  }
  if (type === "array") return [];
  if (type === "number" || type === "integer") return schema.minimum ?? 0;
  if (type === "boolean") return false;
  if (type === "null") return null;
  return "";
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number")
    return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}
function matchesType(value, type) {
  const actual = typeOf(value);
  return type === "number"
    ? actual === "number" || actual === "integer"
    : actual === type;
}
// Checks the JSON Schema subset tool authors commonly use. Returns findings
// with a JSON-pointer-like path as the first argument.
export function validateArgs(schema, value, path = "") {
  if (!schema || typeof schema !== "object") return [];
  const at = path || "/";
  const out = [];
  const types = schema.type === undefined ? [] : [schema.type].flat();
  if (types.length && !types.some((t) => matchesType(value, t)))
    return [f("error", "argType", at, types.join(" | "), typeOf(value))];
  if (
    Array.isArray(schema.enum) &&
    !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))
  )
    out.push(
      f(
        "error",
        "argEnum",
        at,
        schema.enum.map((e) => JSON.stringify(e)).join(", "),
      ),
    );
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      out.push(f("error", "argMinimum", at, schema.minimum));
    if (schema.maximum !== undefined && value > schema.maximum)
      out.push(f("error", "argMaximum", at, schema.maximum));
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      out.push(f("error", "argMinLength", at, schema.minLength));
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      out.push(f("error", "argMaxLength", at, schema.maxLength));
  }
  if (typeOf(value) === "object") {
    const props = schema.properties || {};
    for (const key of Array.isArray(schema.required) ? schema.required : [])
      if (!(key in value))
        out.push(f("error", "argRequired", `${path}/${key}`));
    for (const [key, v] of Object.entries(value)) {
      if (key in props)
        out.push(...validateArgs(props[key], v, `${path}/${key}`));
      else if (schema.additionalProperties === false)
        out.push(f("error", "argUnknown", `${path}/${key}`));
    }
  }
  if (Array.isArray(value) && schema.items && typeof schema.items === "object")
    value.forEach((v, i) =>
      out.push(...validateArgs(schema.items, v, `${path}/${i}`)),
    );
  return out;
}
