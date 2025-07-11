import { SignedXml } from "xml-crypto";
import { DOMParser, XMLSerializer } from "xmldom";

export function buildSignedXml(xml, pfxBuffer, passphrase) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const sig = new SignedXml();
  sig.addReference("/*", [
    "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
  ]);
  sig.signingKey = { key: pfxBuffer, passphrase };
  sig.computeSignature(xml);
  const signed = sig.getSignedXml();
  return signed;
}
