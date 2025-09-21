#!/usr/bin/env node

/**
 * Test script for COMA consensus evaluation logic
 */

// Test consensus logic independently without importing the full validator
class TestableComaValidator {
  constructor() {
    // Skip the normal constructor that requires environment variables
    this.configDir = '/tmp/test';
    this.repoPath = process.cwd();
    this.provider = 'claude-code';
  }

  // Copy the evaluateConsensus method for testing
  evaluateConsensus(results) {
    const approvals = results.filter(r => r.decision === 'APPROVE');
    const rejections = results.filter(r => r.decision === 'REJECT');
    const needsContext = results.filter(r => r.decision === 'NEEDS_CONTEXT');
    const errors = results.filter(r => r.decision === 'ERROR');
    const unknown = results.filter(r => !['APPROVE', 'REJECT', 'NEEDS_CONTEXT', 'ERROR'].includes(r.decision));

    // Any rejection blocks the operation
    if (rejections.length > 0) {
      return {
        approved: false,
        reasoning: `Operation blocked by ${rejections.length} acolyte(s):\n\n` +
          rejections.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Need context blocks the operation
    if (needsContext.length > 0) {
      return {
        approved: false,
        reasoning: `Operation requires more context from ${needsContext.length} acolyte(s):\n\n` +
          needsContext.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Errors block the operation
    if (errors.length > 0) {
      return {
        approved: false,
        reasoning: `Acolyte consultation errors (${errors.length}):\n\n` +
          errors.map(r => `* ${r.file}: ${r.reasoning}`).join('\n\n')
      };
    }

    // Unknown decision types block the operation
    if (unknown.length > 0) {
      return {
        approved: false,
        reasoning: `Unknown decision types from ${unknown.length} acolyte(s):\n\n` +
          unknown.map(r => `* ${r.file}: ${r.decision} - ${r.reasoning}`).join('\n\n')
      };
    }

    // All approvals
    return {
      approved: true,
      reasoning: `Unanimous approval from ${approvals.length} acolyte(s)`
    };
  }
}

async function testConsensusLogic() {
  console.log('Testing COMA consensus evaluation logic...\n');

  const validator = new TestableComaValidator();

  const testScenarios = [
    {
      name: 'Unanimous Approval',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Looks good' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'APPROVE', reasoning: 'Safe change' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: true
    },
    {
      name: 'Single Rejection',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Looks good' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'REJECT', reasoning: 'Breaking change detected' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Multiple Rejections',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'REJECT', reasoning: 'Violates patterns' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'REJECT', reasoning: 'Breaking change' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Needs Context',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Looks good' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'NEEDS_CONTEXT', reasoning: 'Need more information' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Mixed Rejections and Context Needs',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'REJECT', reasoning: 'Bad pattern' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'NEEDS_CONTEXT', reasoning: 'Unclear intent' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Error Responses',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Looks good' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'ERROR', reasoning: 'Timeout occurred' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Unknown Decision Types',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Looks good' },
        { acolyteId: 'test2', file: 'file2.js', decision: 'UNCLEAR', reasoning: 'Ambiguous response' },
        { acolyteId: 'test3', file: 'file3.js', decision: 'APPROVE', reasoning: 'No issues' }
      ],
      expectedApproval: false
    },
    {
      name: 'Empty Results',
      results: [],
      expectedApproval: true // No objections means approval
    },
    {
      name: 'Single Acolyte Approval',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'APPROVE', reasoning: 'Safe change' }
      ],
      expectedApproval: true
    },
    {
      name: 'Single Acolyte Rejection',
      results: [
        { acolyteId: 'test1', file: 'file1.js', decision: 'REJECT', reasoning: 'Dangerous change' }
      ],
      expectedApproval: false
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const scenario of testScenarios) {
    console.log(`Testing: ${scenario.name}`);

    try {
      const decision = validator.evaluateConsensus(scenario.results);
      const actualApproval = decision.approved;

      if (actualApproval === scenario.expectedApproval) {
        console.log(`✅ PASS - Expected: ${scenario.expectedApproval}, Got: ${actualApproval}`);
        if (!actualApproval) {
          console.log(`   Reasoning: ${decision.reasoning.split('\n')[0]}`);
        }
        passed++;
      } else {
        console.log(`❌ FAIL - Expected: ${scenario.expectedApproval}, Got: ${actualApproval}`);
        console.log(`   Reasoning: ${decision.reasoning}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ERROR - ${error.message}`);
      failed++;
    }

    console.log('');
  }

  console.log(`\n=== Results ===`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${testScenarios.length}`);

  if (failed === 0) {
    console.log('\n🎉 All consensus logic tests passed!');
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed`);
    process.exit(1);
  }
}

testConsensusLogic().catch(error => {
  console.error('Test runner failed:', error.message);
  process.exit(1);
});