const { CpuMonitor } = require('../../src/monitor/cpuMonitor');

describe('CpuMonitor', () => {
  let cpuUsageSpy;
  let hrtimeSpy;
  let fakeCpuUsage;
  let fakeHrtime; // bigint nanoseconds

  beforeEach(() => {
    fakeCpuUsage = { user: 0, system: 0 };
    fakeHrtime = 0n;
    cpuUsageSpy = jest.spyOn(process, 'cpuUsage').mockImplementation(() => ({ ...fakeCpuUsage }));
    hrtimeSpy = jest.spyOn(process.hrtime, 'bigint').mockImplementation(() => fakeHrtime);
  });

  afterEach(() => {
    cpuUsageSpy.mockRestore();
    hrtimeSpy.mockRestore();
  });

  test('computes ~100% when process CPU time matches elapsed wall time', () => {
    const monitor = new CpuMonitor({ thresholdPercent: 70, consecutiveSamplesRequired: 1 });

    // Advance 1 second of wall time, with 1 second (1,000,000us) of CPU used.
    fakeHrtime = 1_000_000_000n; // +1s in ns
    fakeCpuUsage = { user: 1_000_000, system: 0 }; // +1s in us

    monitor._sample();
    expect(monitor.getLastPercent()).toBeCloseTo(100, 0);
  });

  test('triggers onThresholdExceeded after N consecutive high samples, not before', () => {
    const onThresholdExceeded = jest.fn();
    const monitor = new CpuMonitor({ thresholdPercent: 70, consecutiveSamplesRequired: 3, onThresholdExceeded });

    for (let i = 1; i <= 2; i += 1) {
      fakeHrtime = BigInt(i) * 1_000_000_000n;
      fakeCpuUsage = { user: i * 1_000_000, system: 0 }; // 100% each interval
      monitor._sample();
    }
    expect(onThresholdExceeded).not.toHaveBeenCalled();

    fakeHrtime = 3_000_000_000n;
    fakeCpuUsage = { user: 3_000_000, system: 0 };
    monitor._sample();
    expect(onThresholdExceeded).toHaveBeenCalledTimes(1);
  });

  test('resets the consecutive-high counter after a low sample', () => {
    const onThresholdExceeded = jest.fn();
    const monitor = new CpuMonitor({ thresholdPercent: 70, consecutiveSamplesRequired: 2, onThresholdExceeded });

    // High sample
    fakeHrtime = 1_000_000_000n;
    fakeCpuUsage = { user: 1_000_000, system: 0 };
    monitor._sample();

    // Low sample (10% usage) resets the streak
    fakeHrtime = 2_000_000_000n;
    fakeCpuUsage = { user: 1_100_000, system: 0 }; // only +0.1s CPU over +1s wall
    monitor._sample();

    // High sample again - streak restarts at 1, not 2, so should not trigger yet
    fakeHrtime = 3_000_000_000n;
    fakeCpuUsage = { user: 2_100_000, system: 0 };
    monitor._sample();

    expect(onThresholdExceeded).not.toHaveBeenCalled();
  });

  test('only fires once even if high samples continue past the threshold count', () => {
    const onThresholdExceeded = jest.fn();
    const monitor = new CpuMonitor({ thresholdPercent: 70, consecutiveSamplesRequired: 2, onThresholdExceeded });

    for (let i = 1; i <= 5; i += 1) {
      fakeHrtime = BigInt(i) * 1_000_000_000n;
      fakeCpuUsage = { user: i * 1_000_000, system: 0 };
      monitor._sample();
    }
    expect(onThresholdExceeded).toHaveBeenCalledTimes(1);
  });
});
