const request = require('supertest');
const app = require('../../app');
const db = require('../../db/pg_index');

describe('Auth API', () => {
  let testUser = {
    username: 'testuser_test',
    password: 'testpassword123',
    displayName: 'Test User'
  };

  beforeAll(async () => {
    try {
      await db.query("DELETE FROM users WHERE username = $1", [testUser.username]);
    } catch (err) {
      // Ignore errors during cleanup
    }
  });

  afterAll(async () => {
    try {
      await db.query("DELETE FROM users WHERE username = $1", [testUser.username]);
      await db.end();
    } catch (err) {
      // Ignore errors during cleanup
    }
  });

  test('POST /api/auth/register should register a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('username', testUser.username);
  });

  test('POST /api/auth/login should login an existing user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUser.username,
        password: testUser.password
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('token');
    expect(response.body).toHaveProperty('username', testUser.username);
  });

  test('POST /api/auth/login should fail with wrong password', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        username: testUser.username,
        password: 'wrongpassword'
      });

    expect(response.status).toBe(401);
    expect(response.body).toHaveProperty('error');
  });

  test('POST /api/auth/register should fail if username is taken', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send(testUser);

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
  });
});
