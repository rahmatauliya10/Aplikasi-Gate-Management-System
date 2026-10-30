import { isOriginAllowed } from './app.config';

describe('isOriginAllowed', () => {
  const allowed = ['http://10.13.14.36:8081', 'http://localhost:8081'];

  it('allows listed origins in production', () => {
    expect(isOriginAllowed('http://10.13.14.36:8081', allowed, true)).toBe(
      true,
    );
    expect(isOriginAllowed('http://localhost:8081', allowed, true)).toBe(true);
  });

  it.each([
    'http://10.13.14.99:8081',
    'http://192.168.1.5',
    'http://172.16.0.1:8081',
    'http://localhost:9999',
    'http://10.13.14.36:9999',
    'https://evil.com',
  ])('rejects unlisted origin %s in production', (origin) => {
    expect(isOriginAllowed(origin, allowed, true)).toBe(false);
  });

  it('allows requests without Origin header', () => {
    expect(isOriginAllowed(undefined, allowed, true)).toBe(true);
  });

  it('rejects everything in production when allowlist is empty', () => {
    expect(isOriginAllowed('http://localhost:8081', [], true)).toBe(false);
  });

  it('ignores wildcard in production', () => {
    expect(isOriginAllowed('https://evil.com', ['*'], true)).toBe(false);
  });

  it('honors wildcard outside production', () => {
    expect(isOriginAllowed('https://any.com', ['*'], false)).toBe(true);
  });
});
