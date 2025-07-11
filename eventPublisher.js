import axios from "axios";

// Reaproveita o mesmo método para Success e Failed
export async function publishPlatformEvent(callback, result) {
  await axios.post(
    callback.url,
    {
      ConsultaId__e: result.consultaId,
      Status__e: result.status,
      DataEmissao__e: result.dataEmissao || null,
      ValorTotal__e: result.valorTotal || null,
      Error__e: result.error || null,
    },
    { headers: { Authorization: `Bearer ${callback.jwt}` } }
  );
}
