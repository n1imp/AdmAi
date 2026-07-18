import { beforeEach, describe, expect, it, vi } from 'vitest';

const { driverMock } = vi.hoisted(() => ({
  driverMock: vi.fn(() => ({ drive: vi.fn() })),
}));

vi.mock('driver.js', () => ({ driver: driverMock }));

describe('movimento reduzido no tour', () => {
  beforeEach(() => {
    vi.resetModules();
    driverMock.mockClear();
    localStorage.clear();
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
  });

  it('desliga smooth scroll quando o sistema solicita redução', async () => {
    vi.useFakeTimers();
    const { startTour } = await import('../../TourGuide.jsx');
    startTour({ force: true });

    expect(driverMock).toHaveBeenCalledWith(
      expect.objectContaining({ animate: false, smoothScroll: false })
    );
    vi.clearAllTimers();
    vi.useRealTimers();
  });
});
