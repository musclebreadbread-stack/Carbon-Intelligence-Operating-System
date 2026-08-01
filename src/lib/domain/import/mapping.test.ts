/**
 * CSV import mapping.
 *
 * These are the functions the preview and the server action share, so the properties
 * worth pinning are the ones that would let the two disagree: how a blank cell is
 * treated, what an unmapped or unrecognised column does, and whether a short row
 * shifts its columns.
 */

import { describe, expect, it } from "vitest";

import {
  IMPORT_TARGET_FIELDS,
  MAX_IMPORT_ROWS,
  REQUIRED_IMPORT_TARGETS,
  guessTargetField,
  isImportTargetField,
  missingRequiredTargets,
  parseCsv,
  parseCsvLine,
  projectImportRow,
} from "./mapping";

describe("IMPORT_TARGET_FIELDS", () => {
  it("declares exactly the four fields an entry cannot be built without", () => {
    expect([...REQUIRED_IMPORT_TARGETS]).toEqual([
      "quantity",
      "unit",
      "startDate",
      "endDate",
    ]);
  });

  it("has no duplicate targets", () => {
    const values = IMPORT_TARGET_FIELDS.map((field) => field.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("recognises its own targets and nothing else", () => {
    for (const field of IMPORT_TARGET_FIELDS) {
      expect(isImportTargetField(field.value)).toBe(true);
    }
    expect(isImportTargetField("")).toBe(false);
    expect(isImportTargetField("organizationId")).toBe(false);
    // A field an attacker might hope to set through the mapping.
    expect(isImportTargetField("activityDataId")).toBe(false);
  });
});

describe("guessTargetField", () => {
  it("matches common header spellings regardless of case and punctuation", () => {
    expect(guessTargetField("Quantity")).toBe("quantity");
    expect(guessTargetField("start_date")).toBe("startDate");
    expect(guessTargetField("Period End")).toBe("endDate");
    expect(guessTargetField("UoM")).toBe("unit");
    expect(guessTargetField("Emission Source")).toBe("emissionSourceId");
  });

  it("guesses nothing for an unrecognised header", () => {
    // A wrong guess the user does not notice is worse than no guess.
    expect(guessTargetField("cost centre")).toBe("");
    expect(guessTargetField("")).toBe("");
  });
});

describe("missingRequiredTargets", () => {
  const complete = [
    { sourceColumn: "a", targetField: "quantity" },
    { sourceColumn: "b", targetField: "unit" },
    { sourceColumn: "c", targetField: "startDate" },
    { sourceColumn: "d", targetField: "endDate" },
  ];

  it("reports nothing when every required target is covered", () => {
    expect(missingRequiredTargets(complete)).toEqual([]);
  });

  it("lists the uncovered targets", () => {
    expect(missingRequiredTargets(complete.slice(0, 2))).toEqual(["startDate", "endDate"]);
  });

  it("ignores columns mapped to nothing", () => {
    expect(
      missingRequiredTargets([...complete, { sourceColumn: "e", targetField: "" }]),
    ).toEqual([]);
  });

  it("ignores a target that is not a recognised field", () => {
    expect(
      missingRequiredTargets([
        ...complete.slice(0, 3),
        { sourceColumn: "d", targetField: "endDateish" },
      ]),
    ).toEqual(["endDate"]);
  });

  it("counts a target mapped twice as covered once", () => {
    expect(
      missingRequiredTargets([...complete, { sourceColumn: "e", targetField: "quantity" }]),
    ).toEqual([]);
  });
});

describe("projectImportRow", () => {
  const mappings = [
    { sourceColumn: "Amount", targetField: "quantity" },
    { sourceColumn: "UoM", targetField: "unit" },
    { sourceColumn: "Cost centre", targetField: "" },
  ];

  it("renames source columns onto their target fields", () => {
    expect(projectImportRow(mappings, { Amount: "120", UoM: "kWh", "Cost centre": "CC1" })).toEqual(
      { quantity: "120", unit: "kWh" },
    );
  });

  it("trims cell whitespace", () => {
    expect(projectImportRow(mappings, { Amount: "  120  ", UoM: "kWh" })).toEqual({
      quantity: "120",
      unit: "kWh",
    });
  });

  it("omits a blank cell rather than passing an empty string", () => {
    // An omitted optional field is valid; `""` usually is not, and would turn a
    // clean row into a confusing validation failure.
    expect(projectImportRow(mappings, { Amount: "", UoM: "kWh" })).toEqual({ unit: "kWh" });
  });

  it("omits a column the row does not have at all", () => {
    expect(projectImportRow(mappings, { UoM: "kWh" })).toEqual({ unit: "kWh" });
  });

  it("falls back to the mapping's defaultValue for a blank cell", () => {
    expect(
      projectImportRow(
        [{ sourceColumn: "UoM", targetField: "unit", defaultValue: "kWh" }],
        { UoM: "" },
      ),
    ).toEqual({ unit: "kWh" });
  });

  it("prefers a present cell over the defaultValue", () => {
    expect(
      projectImportRow(
        [{ sourceColumn: "UoM", targetField: "unit", defaultValue: "kWh" }],
        { UoM: "MWh" },
      ),
    ).toEqual({ unit: "MWh" });
  });

  it("drops a target that is not a recognised field", () => {
    // This is the boundary that stops a crafted mapping writing arbitrary columns.
    expect(
      projectImportRow([{ sourceColumn: "X", targetField: "activityDataId" }], { X: "other-set" }),
    ).toEqual({});
  });
});

describe("parseCsvLine", () => {
  it("splits on commas and trims", () => {
    expect(parseCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("honours quoted fields containing commas", () => {
    expect(parseCsvLine('a,"b,c",d')).toEqual(["a", "b,c", "d"]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsvLine('a,"say ""hi""",c')).toEqual(["a", 'say "hi"', "c"]);
  });

  it("returns one empty cell for an empty line", () => {
    expect(parseCsvLine("")).toEqual([""]);
  });
});

describe("parseCsv", () => {
  it("keys each data row by its header", () => {
    const { headers, rows } = parseCsv("quantity,unit\n120,kWh\n240,kWh");

    expect([...headers]).toEqual(["quantity", "unit"]);
    expect(rows).toEqual([
      { quantity: "120", unit: "kWh" },
      { quantity: "240", unit: "kWh" },
    ]);
  });

  it("drops blank lines, including a trailing newline", () => {
    const { rows } = parseCsv("quantity,unit\n120,kWh\n\n\n");

    expect(rows).toHaveLength(1);
  });

  it("pads a short row instead of shifting its columns", () => {
    // Shifting would make every later column silently wrong; padding makes the row
    // fail validation, which is visible.
    const { rows } = parseCsv("quantity,unit,startDate\n120,kWh");

    expect(rows[0]).toEqual({ quantity: "120", unit: "kWh", startDate: "" });
  });

  it("handles a header-only document", () => {
    const { headers, rows } = parseCsv("quantity,unit");

    expect(headers).toHaveLength(2);
    expect(rows).toEqual([]);
  });

  it("handles an empty document", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });

  it("accepts CRLF line endings", () => {
    const { rows } = parseCsv("quantity,unit\r\n120,kWh\r\n");

    expect(rows).toEqual([{ quantity: "120", unit: "kWh" }]);
  });
});

describe("MAX_IMPORT_ROWS", () => {
  it("is a positive integer the UI and the schema can both quote", () => {
    expect(Number.isInteger(MAX_IMPORT_ROWS)).toBe(true);
    expect(MAX_IMPORT_ROWS).toBeGreaterThan(0);
  });
});
