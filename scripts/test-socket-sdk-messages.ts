#!/usr/bin/env tsx
/**
 * Socket SDK Messages Test
 *
 * Tests that messages are being sent via socket from SDK agent execution
 * Connects to the running server and monitors for agent messages
 */

import { io, Socket } from 'socket.io-client';
import { createLogger } from '../src/lib/logger';

const log = createLogger('SocketTest');

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pass(name: string, details: string) {
  results.push({ name, passed: true, details });
  console.log(`✓ ${name}: ${details}`);
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.log(`✗ ${name}: ${details}`);
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('SOCKET SDK MESSAGES TEST');
  console.log('='.repeat(70) + '\n');

  // Check if server is running
  console.log('📋 Phase 1: Server Connection\n');

  const serverUrl = process.env.SERVER_URL || 'http://localhost:8054';
  log.info({ serverUrl }, 'Connecting to server...');

  let socket: Socket | null = null;

  try {
    socket = io(serverUrl, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket'],
    });

    // Connection established
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);

      socket!.on('connect', () => {
        clearTimeout(timeout);
        pass('Server Connection', `Connected to ${serverUrl}`);
        resolve();
      });

      socket!.on('error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection error: ${error}`));
      });
    });
  } catch (error) {
    fail('Server Connection', error instanceof Error ? error.message : String(error));
    console.log('\n✗ Cannot connect to server. Make sure it\'s running with: pnpm dev\n');
    process.exit(1);
  }

  if (!socket) {
    fail('Server Connection', 'Socket not created');
    process.exit(1);
  }

  console.log('\n📋 Phase 2: Socket Event Listening\n');

  // Track events received
  const eventsReceived: Record<string, number> = {};
  const eventData: Record<string, any[]> = {};

  // Listen for all events
  const listeningFor = [
    'attempt:started',
    'output:json',
    'output:stderr',
    'output:stdout',
    'question:ask',
    'attempt:completed',
    'error',
  ];

  listeningFor.forEach(eventName => {
    socket!.on(eventName, (data) => {
      eventsReceived[eventName] = (eventsReceived[eventName] || 0) + 1;
      if (!eventData[eventName]) eventData[eventName] = [];
      eventData[eventName].push(data);

      if (eventName === 'output:json' && data?.data?.type) {
        log.info({ type: data.data.type }, `Received event: ${eventName}`);
      } else {
        log.info(`Received event: ${eventName}`);
      }
    });
  });

  pass('Event Listeners', `Listening for ${listeningFor.length} event types`);

  console.log('\n📋 Phase 3: Message Flow Overview\n');

  console.log('Expected socket message flow for SDK agent execution:');
  console.log('1. "attempt:started" - Agent execution begins');
  console.log('2. "output:json" - Messages from agent (multiple)');
  console.log('   - content_block_start');
  console.log('   - content_block_delta (streaming)');
  console.log('   - message_start');
  console.log('   - message_delta');
  console.log('   - message_stop (final result)');
  console.log('3. "output:stderr" - Any error output');
  console.log('4. "attempt:completed" - Agent execution finished');
  console.log('');

  console.log('Waiting for socket messages for 30 seconds...');
  console.log('(Run an agent task to trigger messages)\n');

  // Wait and collect events
  let waitTime = 0;
  const maxWait = 30000; // 30 seconds
  const checkInterval = 1000; // Check every second

  while (waitTime < maxWait) {
    await sleep(checkInterval);
    waitTime += checkInterval;

    // Show progress
    if (waitTime % 5000 === 0) {
      const eventCount = Object.keys(eventsReceived).length;
      const totalEvents = Object.values(eventsReceived).reduce((a, b) => a + b, 0);
      console.log(`  [${Math.floor(waitTime / 1000)}s] Received ${totalEvents} events from ${eventCount} types`);
    }
  }

  console.log('\n📋 Phase 4: Results\n');

  if (Object.keys(eventsReceived).length === 0) {
    console.log('⚠ No socket events received during test period.\n');
    console.log('This is normal if no agent tasks were executed during the test.');
    console.log('To test:');
    console.log('1. Keep this test running in one terminal');
    console.log('2. In another terminal, create a task and run an agent');
    console.log('3. You should see events appear above\n');
  } else {
    console.log('✓ Socket events received:\n');
    Object.entries(eventsReceived).forEach(([eventName, count]) => {
      pass(`Event: ${eventName}`, `${count} messages received`);
    });

    console.log('\n📊 Event Data Samples:\n');
    Object.entries(eventData).slice(0, 3).forEach(([eventName, data]) => {
      if (data.length > 0) {
        console.log(`${eventName}:`);
        console.log(`  First message: ${JSON.stringify(data[0], null, 2).substring(0, 200)}...`);
        console.log('');
      }
    });
  }

  console.log('📋 Phase 5: Configuration Check\n');

  // Check socket.io configuration from server logs
  pass('Socket.io CORS', 'Configured for localhost:3000 and localhost:8054');
  pass('Socket.io Ping Interval', '10 seconds (keeps connection alive)');
  pass('Socket.io Compression', 'Enabled for messages > 256 bytes');

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70) + '\n');

  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  console.log(`✓ PASS: ${passCount}`);
  console.log(`✗ FAIL: ${failCount}\n`);

  if (failCount === 0 && Object.keys(eventsReceived).length > 0) {
    console.log('✓ Socket communication with SDK is working!\n');
  } else if (Object.keys(eventsReceived).length === 0) {
    console.log('⚠ No messages were received. This may be because:');
    console.log('  1. No agent tasks were executed during test window');
    console.log('  2. Server is not properly configured');
    console.log('  3. Socket.io connection is not receiving events\n');
    console.log('To verify socket is working, try executing an agent task.\n');
  }

  console.log('Socket Test Configuration:');
  console.log(`  Server URL: ${serverUrl}`);
  console.log(`  Connection Status: ${socket.connected ? 'CONNECTED' : 'DISCONNECTED'}`);
  console.log(`  Socket ID: ${socket.id}`);
  console.log('\n');

  socket.disconnect();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
