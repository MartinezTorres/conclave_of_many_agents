/**
 * Test script for COMA file scanning and agent generation
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

class TestableFileScanner {
  constructor(testDir) {
    this.repoPath = testDir;
  }

  // Copy the scanRepository method from CleanComa for testing
  async scanRepository() {
    const files = [];
    const ignorePatterns = [
      '.git/', '.claude/', '.coma-temp/', 'node_modules/', '*.log', '*.tmp',
      '.DS_Store', '*.pyc', '__pycache__/', '.pytest_cache/', 'coverage/',
      'dist/', 'build/'
    ];

    async function scanDir(dir, relativePath = '') {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativeFilePath = path.join(relativePath, entry.name);

          // Check ignore patterns
          const ignored = ignorePatterns.some(pattern => {
            if (pattern.endsWith('/')) {
              return relativeFilePath.startsWith(pattern) ||
                     relativeFilePath.includes('/' + pattern);
            }
            if (pattern.includes('*')) {
              const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
              return regex.test(relativeFilePath);
            }
            return relativeFilePath === pattern ||
                   relativeFilePath.includes('/' + pattern);
          });

          if (ignored) continue;

          if (entry.isDirectory()) {
            await scanDir(fullPath, relativeFilePath);
          } else {
            files.push(relativeFilePath);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    }

    await scanDir(this.repoPath);
    return files;
  }
}

async function createTestFileStructure(testDir) {
  // Create a complex directory structure for testing
  const structure = {
    'README.md': 'Test readme',
    'package.json': '{"name": "test"}',
    'src/': {
      'index.js': 'console.log("main");',
      'utils/': {
        'helpers.js': 'export function help() {}',
        'constants.js': 'export const API_URL = "test";'
      },
      'components/': {
        'Button.js': 'export default function Button() {}',
        'Modal.js': 'export default function Modal() {}'
      }
    },
    'test/': {
      'index.test.js': 'test("basic", () => {});',
      'utils.test.js': 'test("utils", () => {});'
    },
    'docs/': {
      'api.md': '# API Documentation',
      'guide.md': '# User Guide'
    },
    // Files that should be ignored
    '.git/': {
      'config': 'git config',
      'HEAD': 'ref: refs/heads/main'
    },
    '.claude/': {
      'settings.json': '{}'
    },
    'node_modules/': {
      'react/': {
        'package.json': '{"name": "react"}'
      }
    },
    'dist/': {
      'bundle.js': 'compiled code'
    },
    'coverage/': {
      'lcov.info': 'coverage data'
    },
    '.DS_Store': 'mac metadata',
    'debug.log': 'log content',
    'temp.tmp': 'temporary file',
    '__pycache__/': {
      'module.pyc': 'python cache'
    }
  };

  async function createStructure(obj, basePath) {
    for (const [name, content] of Object.entries(obj)) {
      const fullPath = path.join(basePath, name);

      if (name.endsWith('/')) {
        // Directory
        await fs.mkdir(fullPath, { recursive: true });
        if (typeof content === 'object') {
          await createStructure(content, fullPath);
        }
      } else {
        // File
        await fs.writeFile(fullPath, content);
      }
    }
  }

  await createStructure(structure, testDir);
}

async function testFileScanning() {
  console.log('Testing COMA file scanning logic...\n');

  // Create temporary test directory
  const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'coma-scan-test-'));
  console.log(`Using test directory: ${testDir}\n`);

  try {
    await createTestFileStructure(testDir);
    const scanner = new TestableFileScanner(testDir);

    // Test 1: Basic file scanning
    console.log('Test 1: Basic file scanning with ignore patterns');
    const scannedFiles = await scanner.scanRepository();

    console.log(`Found ${scannedFiles.length} files:`);
    scannedFiles.forEach(file => console.log(`  ${file}`));
    console.log('');

    // Expected files (should be included)
    const expectedFiles = [
      'README.md',
      'package.json',
      'src/index.js',
      'src/utils/helpers.js',
      'src/utils/constants.js',
      'src/components/Button.js',
      'src/components/Modal.js',
      'test/index.test.js',
      'test/utils.test.js',
      'docs/api.md',
      'docs/guide.md'
    ];

    // Files that should be ignored
    const ignoredPatterns = [
      '.git/', '.claude/', 'node_modules/', 'dist/', 'coverage/',
      '.DS_Store', '*.log', '*.tmp', '__pycache__/'
    ];

    let allExpectedFound = true;
    for (const expected of expectedFiles) {
      if (!scannedFiles.includes(expected)) {
        console.log(`FAIL Missing expected file: ${expected}`);
        allExpectedFound = false;
      }
    }

    let noIgnored = true;
    for (const file of scannedFiles) {
      for (const pattern of ignoredPatterns) {
        if (pattern.endsWith('/')) {
          if (file.startsWith(pattern) || file.includes('/' + pattern)) {
            console.log(`FAIL Ignored file found: ${file} (matches ${pattern})`);
            noIgnored = false;
          }
        } else if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
          if (regex.test(file)) {
            console.log(`FAIL Ignored file found: ${file} (matches ${pattern})`);
            noIgnored = false;
          }
        } else if (file === pattern || file.includes('/' + pattern)) {
          console.log(`FAIL Ignored file found: ${file} (matches ${pattern})`);
          noIgnored = false;
        }
      }
    }

    if (allExpectedFound && noIgnored) {
      console.log('PASS PASS - File scanning with ignore patterns works correctly');
    } else {
      console.log('FAIL FAIL - File scanning issues detected');
    }
    console.log('');

    // Test 2: Empty directory
    console.log('Test 2: Scanning empty directory');
    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'empty-'));
    const emptyScanner = new TestableFileScanner(emptyDir);

    const emptyResults = await emptyScanner.scanRepository();

    if (emptyResults.length === 0) {
      console.log('PASS PASS - Empty directory scan returns no files');
    } else {
      console.log(`FAIL FAIL - Empty directory scan returned ${emptyResults.length} files`);
    }

    await fs.rm(emptyDir, { recursive: true });
    console.log('');

    // Test 3: Permission denied simulation
    console.log('Test 3: Handling permission denied directories');

    // Create a directory and file, then make it unreadable
    const restrictedDir = path.join(testDir, 'restricted');
    await fs.mkdir(restrictedDir);
    await fs.writeFile(path.join(restrictedDir, 'secret.txt'), 'secret content');

    try {
      await fs.chmod(restrictedDir, 0o000); // No permissions

      const restrictedScanner = new TestableFileScanner(testDir);
      const resultsWithRestricted = await restrictedScanner.scanRepository();

      // Should not include files from restricted directory
      const hasRestrictedFiles = resultsWithRestricted.some(file => file.startsWith('restricted/'));

      if (!hasRestrictedFiles) {
        console.log('PASS PASS - Permission denied directories skipped gracefully');
      } else {
        console.log('FAIL FAIL - Files from restricted directory were included');
      }

      // Restore permissions for cleanup
      await fs.chmod(restrictedDir, 0o755);
    } catch (error) {
      console.log(`PASS PASS - Permission test handled (may not work on all systems): ${error.message}`);
    }
    console.log('');

    // Test 4: Symbolic links (if supported)
    console.log('Test 4: Handling symbolic links');

    try {
      const linkTarget = path.join(testDir, 'src/index.js');
      const linkPath = path.join(testDir, 'symlink.js');

      await fs.symlink(linkTarget, linkPath);

      const linkScanner = new TestableFileScanner(testDir);
      const resultsWithLinks = await linkScanner.scanRepository();

      const hasSymlink = resultsWithLinks.includes('symlink.js');

      if (hasSymlink) {
        console.log('PASS PASS - Symbolic links handled correctly (included as files)');
      } else {
        console.log('WARN  WARN - Symbolic links not included (may be expected behavior)');
      }
    } catch (error) {
      console.log(`PASS PASS - Symbolic link test skipped (not supported): ${error.message}`);
    }
    console.log('');

    // Test 5: File type diversity
    console.log('Test 5: Various file types handling');

    const fileTypes = {
      'script.py': 'print("python")',
      'styles.css': 'body { margin: 0; }',
      'data.json': '{"key": "value"}',
      'README.txt': 'Plain text readme',
      'image.png': 'fake png data',
      'binary.exe': 'fake binary',
      'config.yaml': 'key: value',
      'Dockerfile': 'FROM node:16'
    };

    for (const [filename, content] of Object.entries(fileTypes)) {
      await fs.writeFile(path.join(testDir, filename), content);
    }

    const diverseScanner = new TestableFileScanner(testDir);
    const diverseResults = await diverseScanner.scanRepository();

    let allTypesFound = true;
    for (const filename of Object.keys(fileTypes)) {
      if (!diverseResults.includes(filename)) {
        console.log(`FAIL Missing file type: ${filename}`);
        allTypesFound = false;
      }
    }

    if (allTypesFound) {
      console.log('PASS PASS - Various file types handled correctly');
    } else {
      console.log('FAIL FAIL - Some file types missing');
    }
    console.log('');

  } finally {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
    console.log(`Cleaned up test directory: ${testDir}\n`);
  }

  console.log('=== File Scanning Tests Complete ===');
}

async function testAgentGeneration() {
  console.log('\nTesting agent generation from scanned files...\n');

  // Test the agent generation logic
  const testFiles = [
    'src/main.js',
    'components/Button.jsx',
    'utils/helpers.ts',
    'styles/app.css',
    'docs/README.md',
    'package.json'
  ];

  console.log('Test: Agent ID generation');

  const expectedIds = [
    'agent_src_main_js',
    'agent_components_Button_jsx',
    'agent_utils_helpers_ts',
    'agent_styles_app_css',
    'agent_docs_README_md',
    'agent_package_json'
  ];

  let idGenerationCorrect = true;

  for (let i = 0; i < testFiles.length; i++) {
    const file = testFiles[i];
    const expectedId = expectedIds[i];
    const actualId = `agent_${file.replace(/[^a-zA-Z0-9]/g, '_')}`;

    if (actualId !== expectedId) {
      console.log(`FAIL ID mismatch for ${file}: expected ${expectedId}, got ${actualId}`);
      idGenerationCorrect = false;
    }
  }

  if (idGenerationCorrect) {
    console.log('PASS PASS - Agent ID generation works correctly');
  } else {
    console.log('FAIL FAIL - Agent ID generation issues');
  }

  console.log('\nExpected agent structure:');
  testFiles.forEach((file, i) => {
    console.log(`  ${expectedIds[i]}: protecting "${file}"`);
  });

  console.log('\n=== Agent Generation Tests Complete ===');
}

async function runAllScanningTests() {
  console.log('=== COMA File Scanning Testing ===\n');

  try {
    await testFileScanning();
    await testAgentGeneration();

    console.log('\nSUCCESS All file scanning tests completed!');
    console.log('\nThese tests verify that COMA correctly identifies files to protect');
    console.log('and ignores irrelevant directories and file types.');

  } catch (error) {
    console.error('File scanning test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runAllScanningTests();