const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function main() {
  console.log('1) Checking API health...');
  await request('/health');

  console.log('2) Logging in as driver...');
  const login = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ phone: '700000004', password: '123456' }),
  });

  const token = login.data?.token || login.token;
  if (!token) throw new Error('Login response did not include token');

  console.log('3) Loading stations...');
  const stations = await request('/stations', {
    headers: { Authorization: `Bearer ${token}` },
  });

  const list = stations.data?.stations || stations.data || stations.stations || [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('No stations returned from API');
  }

  console.log('✅ Smoke test passed. API is ready.');
}

main().catch((error) => {
  console.error('❌ Smoke test failed:', error.message);
  process.exit(1);
});
