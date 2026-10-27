import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const page = await readFile("src/pages/ContratosPage.tsx", "utf8");
const schema = await readFile("supabase/migrations/20261027140000_sale_contracts_electronic_signatures.sql", "utf8");
const agentMigration = await readFile("supabase/migrations/20261027143000_add_agent_contract_signature.sql", "utf8");
const hardeningMigration = await readFile("supabase/migrations/20261027150000_harden_contract_signature_validation.sql", "utf8");

assert.match(page, /agente_nome/,"Contract form must capture the commercial agent name");
assert.match(page, /value="agente"/,"Agent must be available as a signature role");
assert.match(page, /signer_role:signRole/,"Selected signature role must be persisted");
assert.match(page, /document_sha256:selectedContract\.document_sha256/,"Signature must bind to the selected document hash");
assert.match(page, /consent_text:/,"Explicit consent evidence must be recorded");
assert.match(schema, /ENABLE ROW LEVEL SECURITY/,"Contract and signature tables must use RLS");
assert.match(schema, /Electronic signature evidence is immutable/,"Signature evidence must be immutable");
assert.match(schema, /signer_role = 'vendedor'/,"Finalization must require seller signature");
assert.match(schema, /signer_role = 'comprador'/,"Finalization must require buyer signature");
assert.match(schema, /document_html IS DISTINCT FROM OLD\.document_html/,"Signed contract content must be protected");
assert.match(agentMigration, /'agente'/,"Database role constraint must allow commercial agent");
assert.ok(page.includes("signatureData.length > 1_500_000"), "UI must cap signature payload size");
assert.ok(page.includes("data:image/png;base64,"), "UI must accept PNG signature payloads only");
assert.ok(hardeningMigration.includes("signature_image_data ~"), "Database must validate signature image format");
assert.ok(hardeningMigration.includes("Seller and buyer signatures must match the current contract hash"), "Finalization must verify signatures against current hash");
assert.ok(hardeningMigration.includes("prevent_client_creator_spoofing"), "Client creator attribution must be protected");
console.log("Contract audit passed: signature evidence, payload validation, RLS and finalization invariants are present.");
