import express from "express";
import { consultaWithCircuit } from "./soapClient.js";
import { buildSignedXml } from "./transformSign.js";

const app = express();
app.use(express.json());

app.post("/consultar", async (req, res) => {
  const { numeroNfe, cnpj } = req.body;
  if (!numeroNfe || !cnpj)
    return res.status(400).json({ erro: "numeroNfe e cnpj obrigatórios" });

  const xmlBody = `
<PedidoConsultaNFe xmlns="http://www.prefeitura.sp.gov.br/nfe">
  <CPFCNPJRemetente>
    <CNPJ>${cnpj}</CNPJ>
  </CPFCNPJRemetente>
  <NumeroNFe>${numeroNfe}</NumeroNFe>
</PedidoConsultaNFe>`;

  // Carregar PFX do Secret Manager
  const projectId = "salesforcenfe";
  const secretId = "certificado-nfe";
  const passphrase = "_VubeKLuV7";
  const pfxBuffer = await loadPfx(secretId, projectId);

  // Assinar XML
  const signedXml = buildSignedXml(xmlBody, pfxBuffer, passphrase);

  // Montar Envelope SOAP
  const envelope = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Body>
    <ConsultaNFe xmlns="http://www.prefeitura.sp.gov.br/nfe">
      <VersaoSchema>1</VersaoSchema>
      <MensagemXML><![CDATA[${signedXml}]]></MensagemXML>
    </ConsultaNFe>
  </soapenv:Body>
</soapenv:Envelope>`;

  const result = await consultaWithCircuit(envelope);
  res.json({ status: "ok", numeroNfe, dados: result });
});

app.get("/health", (_req, res) => res.send("OK"));

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Listening on ${port}`));
