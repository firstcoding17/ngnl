import http from './http';
export async function verifyKey() {
  // 서버의 /auth/verify 호출 → 200이면 유효
  const { data } = await http.get('/auth/verify');
  return data?.ok === true;
}
