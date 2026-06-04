// API client.
//
// All notes endpoints accept the auth_key in the `Authorization: Bearer <hex32>`
// header — never in the URL path. Keeps the 16-byte authentication material
// out of nginx access logs, browser history, and Referer-on-outbound-links.

function toHex(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i++) s += u8[i].toString(16).padStart(2, '0');
  return s;
}

function headers(authKey, extra) {
  return {
    'Authorization': 'Bearer ' + toHex(authKey),
    ...(extra || {}),
  };
}

class Api {

  // Returns the raw JSON-envelope string from the server. Empty string if no note.
  async get(authKey) {
    const res = await fetch('/api/notes', {
      method: 'GET',
      headers: headers(authKey),
    });
    if (!res.ok) throw new Error('GET /api/notes failed: ' + res.status);
    return res.text();
  }

  async save(authKey, body) {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: headers(authKey, { 'Content-Type': 'text/plain' }),
      body,
    });
    if (!res.ok) throw new Error('POST /api/notes failed: ' + res.status);
  }

  async delete(authKey) {
    const res = await fetch('/api/notes', {
      method: 'DELETE',
      headers: headers(authKey),
    });
    if (!res.ok) throw new Error('DELETE /api/notes failed: ' + res.status);
  }
}

export default new Api();
