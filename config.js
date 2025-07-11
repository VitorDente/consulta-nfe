import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

const secretClient = new SecretManagerServiceClient();
export async function getCert() {
  const [version] = await secretClient.accessSecretVersion({
    name: "projects/salesforcenfe/secrets/cert-a1/versions/latest",
  });
  const payload = version.payload.data.toString("utf8");
  const [p12Base64, password] = payload.split("||");
  return {
    cert: Buffer.from(p12Base64, "base64"),
    pass: password,
  };
}

// Versão da API Salesforce para callbacks
export const SALESFORCE_API_VERSION = "v64.0";
