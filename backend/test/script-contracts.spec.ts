import * as fs from 'fs';
import * as path from 'path';

describe('Production Deployment & Script Contracts Gate (P0-04)', () => {
  const backendPackageJsonPath = path.resolve(__dirname, '../package.json');
  const deployScriptPath = path.resolve(
    __dirname,
    '../../scripts/deploy-with-rollback.ps1',
  );

  it('should ensure backend/package.json exists and defines required deployment scripts', () => {
    expect(fs.existsSync(backendPackageJsonPath)).toBe(true);
    const pkg = JSON.parse(fs.readFileSync(backendPackageJsonPath, 'utf8'));

    expect(pkg.scripts).toBeDefined();
    expect(pkg.scripts['test:drift']).toBeDefined();
    expect(pkg.scripts['test:drift']).toContain('db:verify:checksums');
    expect(pkg.scripts['db:drift:check']).toBeDefined();
    expect(pkg.scripts['db:drift:check']).toContain('prisma migrate diff');
    expect(pkg.scripts['db:verify:checksums']).toBeDefined();
    expect(pkg.scripts['db:backup:pre-deploy']).toBeDefined();
    expect(pkg.scripts['prisma:preflight']).toBeDefined();
  });

  it('should verify all npm run commands in deploy-with-rollback.ps1 exist in package.json', () => {
    if (fs.existsSync(deployScriptPath)) {
      const deployScriptContent = fs.readFileSync(deployScriptPath, 'utf8');
      const pkg = JSON.parse(fs.readFileSync(backendPackageJsonPath, 'utf8'));
      const declaredScripts = Object.keys(pkg.scripts || {});

      // Extract all `npm run <script-name>` from deploy script
      const npmRunRegex = /npm\s+run\s+([a-zA-Z0-9_:-]+)/g;
      let match;
      const referencedScripts: string[] = [];

      while ((match = npmRunRegex.exec(deployScriptContent)) !== null) {
        referencedScripts.push(match[1]);
      }

      expect(referencedScripts.length).toBeGreaterThan(0);

      for (const scriptName of referencedScripts) {
        expect(declaredScripts).toContain(scriptName);
      }
    }
  });

  it('should ensure bat scripts invoke migrator service instead of backend container for npx/npm commands', () => {
    const rebuildBatPath = path.resolve(__dirname, '../../rebuild-run-gms.bat');
    const provisionBatPath = path.resolve(__dirname, '../../provision-gms.bat');

    if (fs.existsSync(rebuildBatPath)) {
      const rebuildContent = fs.readFileSync(rebuildBatPath, 'utf8');
      expect(rebuildContent).not.toMatch(/run\s+--rm\s+backend\s+(npx|npm)/i);
      expect(rebuildContent).toMatch(/run\s+--rm\s+migrator\s+npx\s+prisma\s+migrate/i);
    }

    if (fs.existsSync(provisionBatPath)) {
      const provisionContent = fs.readFileSync(provisionBatPath, 'utf8');
      expect(provisionContent).not.toMatch(/run\s+--rm\s+backend\s+(npx|npm)/i);
      expect(provisionContent).toMatch(/run\s+--rm\s+migrator\s+npx/i);
    }
  });
});

