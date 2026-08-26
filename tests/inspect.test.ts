import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { countImports, inferReproCommand } from '../src/runner/inspect.js';

describe('Static Inspection Helpers', () => {
  test('counts imports in TypeScript / JavaScript', () => {
    const code = `
import { foo } from './foo';
import * as bar from 'bar';
const baz = require('baz');
export * from './types';

function run() {
  return foo + bar;
}
`;
    const count = countImports(code, '.ts');
    assert.equal(count, 4);
  });

  test('counts imports in Python', () => {
    const code = `
import os
import sys
from datetime import datetime
from pathlib import Path

def main():
    pass
`;
    const count = countImports(code, '.py');
    assert.equal(count, 4);
  });

  test('infers reproduction commands by language and test path', () => {
    assert.equal(
      inferReproCommand('TypeScript', 'tests/auth.test.ts', 'src/auth.ts'),
      'pnpm test tests/auth.test.ts'
    );

    assert.equal(
      inferReproCommand('Python', 'tests/test_parser.py', 'src/parser.py'),
      'pytest tests/test_parser.py'
    );

    assert.equal(
      inferReproCommand('Rust', 'tests/integration.rs', 'src/lib.rs'),
      'cargo test --test integration'
    );
  });
});
