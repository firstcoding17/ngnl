import http from './http';
export async function verifyKey() {
  // Call /auth/verify; a 200 response means the key is valid.
  const { data } = await http.get('/auth/verify');
  return data?.ok === true;
}
