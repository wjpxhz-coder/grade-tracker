import { describe, expect, it } from "vitest";

import { escapeCsvCell, objectsToCsv, rowsToCsv } from "./csv";

describe("CSV helpers", () => {
  it("quotes delimiters, line breaks and double quotes", () => {
    expect(escapeCsvCell('期中,"优秀"')).toBe('"期中,""优秀"""');
    expect(escapeCsvCell("第一行\n第二行")).toBe('"第一行\n第二行"');
  });

  it("protects spreadsheet formula injection without changing numbers", () => {
    expect(escapeCsvCell("=HYPERLINK(\"bad\")")).toBe(
      '"\'=HYPERLINK(""bad"")"',
    );
    expect(escapeCsvCell(-12)).toBe("-12");
    expect(escapeCsvCell("-12")).toBe("'-12");
  });

  it("writes Excel-friendly UTF-8 CSV with stable columns", () => {
    const csv = objectsToCsv(
      [{ name: "期中考试", score: 588, note: null }],
      [
        { header: "考试", value: (row) => row.name },
        { header: "得分", value: (row) => row.score },
        { header: "备注", value: (row) => row.note },
      ],
    );

    expect(csv).toBe("\uFEFF考试,得分,备注\r\n期中考试,588,");
  });

  it("supports opt-out of BOM and formula protection", () => {
    expect(
      rowsToCsv([["=safe-by-choice"]], {
        includeBom: false,
        protectFormulas: false,
      }),
    ).toBe("=safe-by-choice");
  });
});
