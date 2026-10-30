import { reportTestDatabaseUrl } from './helpers/report-test-database';

describe('report PostgreSQL test connection guard', () => {
  it('does not fall back when DATABASE_URL_TEST is absent', () => {
    expect(reportTestDatabaseUrl(undefined)).toBeNull();
  });

  it.each([
    '',
    'not-a-url',
    'mysql://localhost/gms_test_db',
    'postgresql://localhost/gms_production',
    'postgresql://production.example/gms_test_db',
    'postgresql://localhost/postgres',
    'postgresql://localhost/template1',
  ])('rejects a missing, malformed or non-allowlisted target: %s', (url) => {
    expect(() => reportTestDatabaseUrl(url)).toThrow(
      'DATABASE_URL_TEST must name an allowlisted PostgreSQL test host and database.',
    );
  });

  it('never includes credentials in validation errors', () => {
    expect(() =>
      reportTestDatabaseUrl('postgresql://user:secret@remote/gms_test_db'),
    ).toThrow(
      /^DATABASE_URL_TEST must name an allowlisted PostgreSQL test host and database\.$/,
    );
  });

  it.each(['localhost', '127.0.0.1', '[::1]', 'postgres'])(
    'accepts an explicitly supplied test URL on %s',
    (host) => {
      const url = `postgresql://${host}/gms_test_db`;
      expect(reportTestDatabaseUrl(url)).toBe(url);
    },
  );
});
