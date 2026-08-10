const { initializeData } = require('../src/migration');

try {
  const result = initializeData();
  console.log(`job_for_PHD data ready: ${result.readiness.state}`);
} catch (error) {
  console.error(`Initialization failed: ${error.message}`);
  process.exitCode = 1;
}
