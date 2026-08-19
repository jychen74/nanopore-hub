const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const pricePath = path.join(root, "data", "ont_pricelist.csv");
const annotationPath = path.join(root, "data", "ont_product_annotations.csv");
const outputPath = path.join(root, "data", "ont_selector_data.js");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  return rows;
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  const headers = rows.shift().map((header) => header.trim());
  return rows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (row[index] || "").trim();
    });
    return record;
  });
}

const priceRows = csvToObjects(fs.readFileSync(pricePath, "utf8"))
  .filter((row) => row.SKU)
  .map((row) => ({
    sku: row.SKU,
    ProductName: row["Product name"],
    Description: row.Description,
    ListPrice: row["List price"],
  }));

const priceBySku = new Map(priceRows.map((row) => [row.sku, row]));
const annotations = csvToObjects(fs.readFileSync(annotationPath, "utf8"));
const selectorRoles = new Set(["sequencing_kit", "flow_cell"]);
const records = annotations
  .filter((row) => selectorRoles.has(row.role))
  .map((row) => ({ ...row, ...(priceBySku.get(row.sku) || {}) }))
  .filter((row) => row.sku && row.ProductName);

const missing = annotations
  .filter((row) => selectorRoles.has(row.role))
  .filter((row) => row.sku && !priceBySku.has(row.sku))
  .map((row) => row.sku);

if (missing.length > 0) {
  throw new Error(`Annotated SKUs missing from price list: ${missing.join(", ")}`);
}

const payload = {
  generatedAt: new Date().toISOString(),
  priceSource: "https://store.nanoporetech.com/priceList.html",
  recordCount: records.length,
  records,
};

const js = `window.ONT_SELECTOR_DATA = ${JSON.stringify(payload, null, 2)};\n`;
fs.writeFileSync(outputPath, js, "utf8");

console.log(`Wrote ${path.relative(root, outputPath)} with ${records.length} records.`);
