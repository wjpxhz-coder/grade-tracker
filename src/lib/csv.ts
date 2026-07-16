export type CsvCell = string | number | boolean | Date | null | undefined;

export interface CsvOptions {
  delimiter?: string;
  lineEnding?: "\n" | "\r\n";
  includeBom?: boolean;
  /** Prefixes dangerous string cells with an apostrophe for spreadsheet apps. */
  protectFormulas?: boolean;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvCell;
}

const FORMULA_PREFIX = /^[\t\r ]*[=+\-@]/;

function cellToString(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function escapeCsvCell(
  value: CsvCell,
  options: Pick<CsvOptions, "delimiter" | "protectFormulas"> = {},
): string {
  const delimiter = options.delimiter ?? ",";
  const isText = typeof value === "string";
  let text = cellToString(value);

  if ((options.protectFormulas ?? true) && isText && FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }

  if (
    text.includes(delimiter) ||
    text.includes('"') ||
    text.includes("\r") ||
    text.includes("\n")
  ) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

export function rowsToCsv(
  rows: readonly (readonly CsvCell[])[],
  options: CsvOptions = {},
): string {
  const delimiter = options.delimiter ?? ",";
  if (delimiter.length !== 1) {
    throw new Error("CSV delimiter must be exactly one character.");
  }

  const lineEnding = options.lineEnding ?? "\r\n";
  const body = rows
    .map((row) =>
      row
        .map((cell) =>
          escapeCsvCell(cell, {
            delimiter,
            protectFormulas: options.protectFormulas,
          }),
        )
        .join(delimiter),
    )
    .join(lineEnding);

  return `${options.includeBom ?? true ? "\uFEFF" : ""}${body}`;
}

export function objectsToCsv<T>(
  records: readonly T[],
  columns: readonly CsvColumn<T>[],
  options: CsvOptions = {},
): string {
  const rows: CsvCell[][] = [
    columns.map((column) => column.header),
    ...records.map((record) =>
      columns.map((column) => column.value(record)),
    ),
  ];
  return rowsToCsv(rows, options);
}
