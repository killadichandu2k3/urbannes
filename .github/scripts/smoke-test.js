async function gql(query, variables, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['authorization'] = 'Bearer ' + token;
  const res = await fetch('http://localhost:8080/graphql', {
    method: 'POST', headers,
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

(async () => {
  const email = 'ci-smoke-' + Date.now() + '@example.com';

  console.log('1) Register', email);
  const reg = await gql(
    'mutation R($i: RegisterInput!) { register(input: $i) { email message } }',
    { i: { email, password: 'SmokeTest123', displayName: 'CI' } }
  );
  console.log('   →', reg.register.message);

  console.log('2) Verify email (test code 000000)');
  const ver = await gql(
    'mutation V($e: String!, $c: String!) { verifyEmail(email: $e, code: $c) { token user { id email } } }',
    { e: email, c: '000000' }
  );
  const token = ver.verifyEmail.token;
  console.log('   → token received for', ver.verifyEmail.user.email);

  console.log('3) Authenticated query: myBookings');
  const book = await gql('{ myBookings { id } }', {}, token);
  console.log('   → myBookings:', JSON.stringify(book.myBookings));

  console.log('✅  Smoke test passed!');
})().catch(err => { console.error('❌', err); process.exit(1); });
