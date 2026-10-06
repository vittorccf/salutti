// Validação de XML TISS contra os XSD oficiais 4.03.00 (tests/fixtures/tiss-4.03.00).
import fs from "node:fs";
import path from "node:path";
import { validateXML } from "xmllint-wasm";

const DIR = path.resolve(__dirname, "../fixtures/tiss-4.03.00");
const xsd = (f: string) => ({ fileName: f, contents: fs.readFileSync(path.join(DIR, f)) });

export function validateTiss(xmlBytes: Uint8Array) {
  return validateXML({
    xml: [{ fileName: "lote.xml", contents: xmlBytes }],
    schema: [xsd("tissV4_03_00.xsd")],
    preload: [
      xsd("tissSimpleTypesV4_03_00.xsd"),
      xsd("tissComplexTypesV4_03_00.xsd"),
      xsd("tissGuiasV4_03_00.xsd"),
      xsd("tissAssinaturaDigital_v1.01.xsd"),
      xsd("xmldsig-core-schema.xsd"),
    ],
  });
}
