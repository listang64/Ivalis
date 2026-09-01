const CLE = "AIzaSyCSHF4isennPJEqBRNlrthOu8OaS_7cur4";
const BASE = "https://firestore.googleapis.com/v1/projects/ivalis-b8373/databases/(default)/documents";

function valeur(champ) {
  if (!champ) return null;
  if ("stringValue"  in champ) return champ.stringValue;
  if ("integerValue" in champ) return Number(champ.integerValue);
  if ("doubleValue"  in champ) return champ.doubleValue;
  if ("booleanValue" in champ) return champ.booleanValue;
  if ("nullValue"    in champ) return null;
  if ("arrayValue"   in champ) return (champ.arrayValue.values || []).map(valeur);
  if ("mapValue"     in champ) {
    const o = {}; Object.entries(champ.mapValue.fields || {}).forEach(([k,v]) => o[k] = valeur(v)); return o;
  }
  return null;
}

export async function lireCollection(nom) {
  let docs = {}, token = null;
  do {
    const url = `${BASE}/${nom}?pageSize=300${token ? "&pageToken=" + token : ""}&key=${CLE}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${nom} : HTTP ${r.status}`);
    const j = await r.json();
    (j.documents || []).forEach(d => {
      const id = d.name.split("/").pop();
      const o = {}; Object.entries(d.fields || {}).forEach(([k,v]) => o[k] = valeur(v));
      docs[id] = o;
    });
    token = j.nextPageToken;
  } while (token);
  return docs;
}

if (process.argv[2]) {
  const docs = await lireCollection(process.argv[2]);
  const fs = await import('fs');
  fs.writeFileSync(process.argv[3] || 'sortie.json', JSON.stringify(docs, null, 1));
  console.log(`${process.argv[2]} : ${Object.keys(docs).length} documents`);
}
