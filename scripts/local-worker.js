import { loadAutomationConfig } from '../src/automationConfig.js';
import { runLocalWorkerOnce } from '../src/localWorker.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const once = process.argv.includes('--once');
const config = await loadAutomationConfig();

do {
  const result = await runLocalWorkerOnce({ config });
  console.log(JSON.stringify(result));

  if (once) {
    break;
  }

  await sleep(config.localPr.pollIntervalSeconds * 1000);
} while (true);
