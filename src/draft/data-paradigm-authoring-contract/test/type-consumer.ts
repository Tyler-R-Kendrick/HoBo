import {
  createManifest,
  data,
  importParadigmPackage,
  type DataHandle,
  type ImportedParadigmPackage,
  type LoweringDescriptor,
} from "../src/data-paradigm-authoring.mjs";

function assertDataParadigmTypes() {
  const sql: ImportedParadigmPackage = importParadigmPackage({
    packageName: "@hobo/sql",
    paradigm: "relational",
    equivalenceClass: "managed-postgres",
    port: "hobo:data",
  });

  const vector = importParadigmPackage({
    packageName: "@hobo/vector",
    paradigm: "vector",
    equivalenceClass: "search-extension",
    port: "hobo:data",
    extensionPort: "hobo:search",
    features: [{ name: "ann-index", crossParadigmEquivalent: false }],
  });

  const db: DataHandle = data("db").use(sql);
  const query: LoweringDescriptor = db.query({ by: "email" });
  query.portRef satisfies readonly ["hobo:data"];

  const embeddings = data("embeddings").use(vector);
  const vectorQuery = embeddings.query({ nearest: "ticket" });
  vectorQuery.extensionPortRef satisfies readonly "hobo:search"[];

  const manifest = createManifest([db, embeddings]);
  manifest.resources.db.paradigm satisfies "relational" | "document" | "vector" | "graph" | undefined;

  // @ts-expect-error @hobo/sql cannot be declared as document.
  importParadigmPackage({
    packageName: "@hobo/sql",
    paradigm: "document",
    equivalenceClass: "managed-document",
    port: "hobo:data",
  });

  // @ts-expect-error vector packages must surface hobo:search as the extension port.
  importParadigmPackage({
    packageName: "@hobo/vector",
    paradigm: "vector",
    equivalenceClass: "search-extension",
    port: "hobo:data",
  });

  void manifest;
}

void assertDataParadigmTypes;
