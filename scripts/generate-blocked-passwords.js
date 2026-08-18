/**
 * ==============================================================================
 * GMS Enterprise Password Blocklist Generator
 * OWASP ASVS 5.0 (Req 6.2.4) & NIST SP 800-63B-4 Password Security Compliance
 * ==============================================================================
 * Requirements:
 *   1. Minimum >= 3,000 distinct candidate passwords matching application policy (length >= 15)
 *   2. Covers top common passphrases, predictable permutations, dictionary combinations,
 *      keyboard walks, corporate defaults, and GMS context-specific passwords.
 *   3. Deterministic, normalized (lowercase, trimmed), and deduplicated.
 * ==============================================================================
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const words = [
  'password', 'administrator', 'admin', 'welcome', 'changeme', 'letmein',
  'system', 'security', 'database', 'default', 'temporary', 'company',
  'management', 'gatekeeper', 'warehouse', 'weighbridge', 'qualitycontrol',
  'production', 'supervisor', 'operator', 'employee', 'computer', 'internet',
  'network', 'service', 'secret', 'access', 'master', 'server', 'account',
  'portal', 'login', 'terminal', 'control', 'station', 'office', 'factory',
  'project', 'spring', 'summer', 'autumn', 'winter', 'january', 'february',
  'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday',
  'saturday', 'sunday', 'jakarta', 'indonesia', 'surabaya', 'bandung', 'medan',
  'semarang', 'makassar', 'palembang', 'football', 'baseball', 'basketball',
  'sunshine', 'princess', 'superman', 'batman', 'dragon', 'monkey', 'shadow',
  'matrix', 'freedom', 'starwars', 'pokemon', 'trustnoone', 'iloveyou',
  'correcthorse', 'batterystaple', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'chelsea', 'arsenal', 'liverpool', 'manchester', 'barcelona', 'realmadrid',
  'audi', 'bmw', 'mercedes', 'toyota', 'honda', 'yamaha', 'suzuki',
  'plant', 'factory', 'logistics', 'delivery', 'transport', 'shipping',
  'suratjalan', 'timbangan', 'keamanan', 'satpam', 'pabrik', 'gudang',
  'kendaraan', 'truk', 'sopir', 'driver', 'material', 'inspeksi'
];

const connectors = ['', '123', '1234', '12345', '123456', '2024', '2025', '2026', '2027', '!', '@', '#', '$', '2024!', '2025!', '2026!', '123!', '12345!'];
const suffixes = ['', '123', '1234', '12345', '123456', '1234567', '12345678', '2024', '2025', '2026', '2027', 'admin', 'root', 'user', 'pass', 'gate', 'gms', '!', '@', '#', '$', '123!', '2026!'];

const blocklist = new Set();

// 1. Context-specific whole passwords for GMS
const contextSpecific = [
  'gatemanagementsystem',
  'gatemanagementsystem2025',
  'gatemanagementsystem2026',
  'gatemanagementsystem123',
  'gatemanagementsystem!',
  'gatemanagement2025',
  'gatemanagement2026',
  'gatemanagement123',
  'gatemanagement12345',
  'gmsadministrator',
  'gmsadministrator2025',
  'gmsadministrator2026',
  'gmsadministrator123',
  'gmswarehouseoperator',
  'gmswarehouse2026',
  'gmsqualitycontrol',
  'gmsweighbridgeoperator',
  'sjagatekeeper123',
  'sjagatekeeper2026',
  'securityguardgate1',
  'weighbridgeoperator1',
  'qualitycontroladmin',
  'timbangandigital1',
  'poskeamanan2026',
  'poskeamanangate1',
  'suratjalanotomatis',
  'suratjalanonline2026',
  'gatekeeperpassword',
  'gatekeeperdefault1',
  'adminpassword12345',
  'administrator12345',
  'administrator2026',
  'superadminpassword',
  'rootadministrator1',
  'systemadministrator1',
  'mastergatekeeper1',
  'operatorgudang2026',
  'operatorsatpam2026',
  'operatortimbangan1',
  'supervisorwarehouse1'
];

for (const p of contextSpecific) {
  if (p.length >= 15 && p.length <= 128) blocklist.add(p.toLowerCase().trim());
}

// 2. Multi-word dictionary combinations & passphrases
for (const w1 of words) {
  for (const w2 of words) {
    if (w1 === w2) continue;
    for (const conn of ['', '-', '_', '.', '123', '2026']) {
      const candidate = `${w1}${conn}${w2}`;
      if (candidate.length >= 15 && candidate.length <= 128) {
        blocklist.add(candidate.toLowerCase().trim());
      }
    }
  }
}

// 3. Word + large suffixes & number sequences
for (const w of words) {
  for (const num of [
    '123456789012', '1234567890123', '12345678901234', '123456789012345',
    '0987654321098', '09876543210987',
    '202420252026', '202520262027', '112233445566',
    'password12345', 'administrator', 'secretpassword', 'superpassword1'
  ]) {
    const candidate1 = `${w}${num}`;
    const candidate2 = `${num}${w}`;
    if (candidate1.length >= 15 && candidate1.length <= 128) blocklist.add(candidate1.toLowerCase().trim());
    if (candidate2.length >= 15 && candidate2.length <= 128) blocklist.add(candidate2.toLowerCase().trim());
  }
}

// 4. Repeated words & famous passphrases
const basePhrases = [
  'correcthorsebatterystaple',
  'tr0ub4dor&3tr0ub4dor&3',
  'passwordpasswordpassword',
  'adminadminadminadmin',
  'welcomebacktohome1',
  'thisismysecretpassword',
  'ilovemybeautifulfamily',
  'neverevergiveup2026',
  'thequickbrownfoxjumpsover',
  'youcannotguessmypassword',
  'changemeimmediately1',
  'temporarypasswordfornow',
  'pleaseletmeinrightnow',
  'iamthesystemadministrator',
  'securityfirstalways2026',
  'productiondatabaseadmin',
  'dontforgetyourpassword',
  'qwertyuiopasdfghjklzxcvbnm',
  '12345678901234567890',
  'abcdefghijklmnopqrstuvwxyz',
  'zyxwvutsrqponmlkjihgfedcba'
];

for (const phrase of basePhrases) {
  for (const suff of suffixes) {
    const candidate = `${phrase}${suff}`;
    if (candidate.length >= 15 && candidate.length <= 128) {
      blocklist.add(candidate.toLowerCase().trim());
    }
  }
}

// Ensure array is sorted for deterministic generation
const sortedList = Array.from(blocklist).sort();

console.log(`Generated ${sortedList.length} unique candidate blocked passwords (all length >= 15).`);

if (sortedList.length < 3000) {
  console.error(`FATAL: Blocklist size (${sortedList.length}) is below OWASP ASVS 5.0 Req 6.2.4 minimum of 3,000!`);
  process.exit(1);
}

// Generate blocked-passwords.data.ts
const targetFile = path.join(__dirname, '..', 'backend', 'src', 'common', 'validators', 'blocked-passwords.data.ts');

const content = `// ==============================================================================
// GMS Enterprise Blocked Passwords Dataset
// OWASP ASVS 5.0 (Req 6.2.4) & NIST SP 800-63B-4 Compliant Blocklist
// ==============================================================================
// Count: ${sortedList.length} entries (strictly length >= 15 to match GMS password policy)
// Lookup Complexity: O(1) via Set<string>
// ==============================================================================

const RAW_BLOCKED_PASSWORDS: string[] = ${JSON.stringify(sortedList, null, 2)};

export const BLOCKED_PASSWORDS_SET: ReadonlySet<string> = new Set(RAW_BLOCKED_PASSWORDS);

export const BLOCKED_PASSWORDS_COUNT: number = BLOCKED_PASSWORDS_SET.size;
`;

fs.writeFileSync(targetFile, content, 'utf8');

const hash = crypto.createHash('sha256').update(content).digest('hex');
console.log(`Successfully wrote ${sortedList.length} passwords to ${targetFile}`);
console.log(`SHA-256 Checksum: ${hash}`);
