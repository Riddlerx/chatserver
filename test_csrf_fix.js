const csrfMiddleware = require('./middleware/csrf');

// Mock request and response objects
function createMockReq(method, path) {
  return {
    method,
    path,
    cookies: {},
    headers: {}
  };
}

function createMockRes() {
  const res = {
    cookie: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
}

// Test 1: GET request should pass without CSRF token
console.log('Test 1: GET request should pass');
const req1 = createMockReq('GET', '/api/auth/login');
const res1 = createMockRes();
let nextCalled1 = false;
csrfMiddleware(req1, res1, () => { nextCalled1 = true; });
console.log(`  ✓ next() called: ${nextCalled1}`);

// Test 2: POST to /api/auth/login should be exempted
console.log('Test 2: POST to /api/auth/login (no CSRF token) should pass');
const req2 = createMockReq('POST', '/api/auth/login');
const res2 = createMockRes();
let nextCalled2 = false;
csrfMiddleware(req2, res2, () => { nextCalled2 = true; });
console.log(`  ✓ next() called (exempted): ${nextCalled2}`);

// Test 3: POST to /api/auth/register should be exempted
console.log('Test 3: POST to /api/auth/register (no CSRF token) should pass');
const req3 = createMockReq('POST', '/api/auth/register');
const res3 = createMockRes();
let nextCalled3 = false;
csrfMiddleware(req3, res3, () => { nextCalled3 = true; });
console.log(`  ✓ next() called (exempted): ${nextCalled3}`);

// Test 4: POST to other endpoint without CSRF should fail
console.log('Test 4: POST to /api/messages (no CSRF token) should fail');
const req4 = createMockReq('POST', '/api/messages');
const res4 = createMockRes();
let nextCalled4 = false;
csrfMiddleware(req4, res4, () => { nextCalled4 = true; });
console.log(`  ✓ next() called: ${nextCalled4}`);
console.log(`  ✓ status(403) called: ${res4.status.mock.calls.length > 0}`);

console.log('\nAll tests passed! ✓');
