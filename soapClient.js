import axios from "axios";

const WSDL_URL = "https://nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx";
const SOAP_ACTION =
  "http://www.prefeitura.sp.gov.br/nfe/ws/lotenfe/ConsultaNFe";

export async function consultaWithCircuit(envelope) {
  const { data } = await axios.post(WSDL_URL, envelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: SOAP_ACTION,
    },
    timeout: 30000,
  });
  return data;
}
