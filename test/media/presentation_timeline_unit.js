/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.test.ManifestParser');

describe('PresentationTimeline', () => {
  const originalDateNow = Date.now;
  const makeSegmentReference = (startTime, endTime) => {
    return shaka.test.ManifestParser.makeReference(
        'foo.mp4', startTime, endTime);
  };

  /** @type {!Date} */
  let baseTime;

  beforeEach(() => {
    baseTime = new Date(2015, 11, 30);
    Date.now = () => baseTime.getTime();
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  function setElapsed(secondsSinceBaseTime) {
    Date.now = () => baseTime.getTime() + (secondsSinceBaseTime * 1000);
  }

  /**
   * Creates a PresentationTimeline.
   *
   * @param {boolean} isStatic
   * @param {number} duration
   * @param {?number} presentationStartTime
   * @param {number} segmentAvailabilityDuration
   * @param {number} maxSegmentDuration
   * @param {number} clockOffset
   * @param {number} presentationDelay
   * @param {boolean=} autoCorrectDrift
   *
   * @return {shaka.media.PresentationTimeline}
   */
  function makePresentationTimeline(
      isStatic,
      duration,
      presentationStartTime,
      segmentAvailabilityDuration,
      maxSegmentDuration,
      clockOffset,
      presentationDelay,
      autoCorrectDrift = true) {
    const timeline = new shaka.media.PresentationTimeline(
        presentationStartTime, presentationDelay, autoCorrectDrift);
    timeline.setStatic(isStatic);
    timeline.setDuration(duration || Infinity);
    timeline.setSegmentAvailabilityDuration(segmentAvailabilityDuration);
    timeline.notifyMaxSegmentDuration(maxSegmentDuration);
    timeline.setClockOffset(clockOffset);
    timeline.assertIsValid();
    return timeline;
  }

  /**
   * Creates a VOD PresentationTimeline.
   *
   * @param {number} duration
   * @return {shaka.media.PresentationTimeline}
   */
  function makeVodTimeline(duration) {
    const timeline = makePresentationTimeline(
        /* static= */ true, duration, /* start= */ null,
        /* availability= */ Infinity, /* max= */ 10,
        /* clock= */ 0, /* presentation= */ 0);
    expect(timeline.isLive()).toBe(false);
    expect(timeline.isInProgress()).toBe(false);
    return timeline;
  }

  /**
   * Creates a IPR PresentationTimeline.
   *
   * @param {number} duration
   * @param {number=} delay
   * @return {shaka.media.PresentationTimeline}
   */
  function makeIprTimeline(duration, delay) {
    const now = Date.now() / 1000;
    const timeline = makePresentationTimeline(
        /* static= */ false, duration, /* start= */ now,
        /* availability= */ Infinity, /* max= */ 10,
        /* clock= */ 0, delay || 0);
    expect(timeline.isLive()).toBe(false);
    expect(timeline.isInProgress()).toBe(true);
    return timeline;
  }

  /**
   * Creates a live PresentationTimeline.
   *
   * @param {number} availability
   * @param {number=} delay
   * @param {boolean=} autoCorrectDrift
   * @return {shaka.media.PresentationTimeline}
   */
  function makeLiveTimeline(availability, delay, autoCorrectDrift = true) {
    const now = Date.now() / 1000;
    const timeline = makePresentationTimeline(
        /* static= */ false, /* duration= */ Infinity, /* start= */ now,
        availability, /* max= */ 10,
        /* clock= */ 0, delay || 0, autoCorrectDrift);
    expect(timeline.isLive()).toBe(true);
    expect(timeline.isInProgress()).toBe(false);
    return timeline;
  }

  describe('getSegmentAvailabilityStart', () => {
    it('returns 0 for VOD and IPR', () => {
      const timeline1 = makeVodTimeline(/* duration= */ 60);
      const timeline2 = makeIprTimeline(/* duration= */ 60);

      setElapsed(0);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(100);
      expect(timeline1.getSegmentAvailabilityStart()).toBe(0);
      expect(timeline2.getSegmentAvailabilityStart()).toBe(0);
    });

    it('calculates time for live with finite availability', () => {
      const timeline = makeLiveTimeline(/* availability= */ 20);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(29);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(30);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(31);
      expect(timeline.getSegmentAvailabilityStart()).toBe(1);

      setElapsed(69);
      expect(timeline.getSegmentAvailabilityStart()).toBe(39);

      setElapsed(70);
      expect(timeline.getSegmentAvailabilityStart()).toBe(40);

      setElapsed(71);
      expect(timeline.getSegmentAvailabilityStart()).toBe(41);
    });

    it('calculates time for live with infinite availability', () => {
      const timeline = makeLiveTimeline(/* availability= */ Infinity);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(59);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(60);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);

      setElapsed(61);
      expect(timeline.getSegmentAvailabilityStart()).toBe(0);
    });

    it('calculates time based on segment times when available', () => {
      const timeline = makeLiveTimeline(/* availability= */ 20);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      // In spite of the current time, the explicit segment times will decide
      // the availability window.
      // See https://github.com/google/shaka-player/issues/999
      setElapsed(1000);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5]);

      // last segment time (50) - availability (20)
      expect(timeline.getSegmentAvailabilityStart()).toBe(30);
    });

    it('ignores segment times when configured to', () => {
      const timeline = makeLiveTimeline(
          /* availability= */ 20, /* drift= */ 0,
          /* autoCorrectDrift= */ false);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      setElapsed(100);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5]);

      // now (100) - max segment duration (10) - availability start time (0)
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });
  });

  describe('getSegmentAvailabilityEnd', () => {
    it('returns duration for VOD', () => {
      const timeline = makeVodTimeline(/* duration= */ 60);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });

    it('calculates time for IPR', () => {
      const timeline = makeIprTimeline(/* duration= */ 60);

      setElapsed(0);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(10);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(69);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(70);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(100);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);
    });

    it('calculates time for live', () => {
      const timeline1 = makeLiveTimeline(/* availability= */ 20);
      const timeline2 = makeLiveTimeline(/* availability= */ Infinity);

      setElapsed(0);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(0);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(10);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(0);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(0);

      setElapsed(11);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(1);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(1);

      setElapsed(69);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(59);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(59);

      setElapsed(70);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(60);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(60);

      setElapsed(71);
      expect(timeline1.getSegmentAvailabilityEnd()).toBe(61);
      expect(timeline2.getSegmentAvailabilityEnd()).toBe(61);
    });

    it('calculates time based on segment times when available', () => {
      const timeline = makeLiveTimeline(/* availability= */ 20);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      // In spite of the current time, the explicit segment times will decide
      // the availability window.
      // See https://github.com/google/shaka-player/issues/999
      setElapsed(1000);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5]);

      // last segment time (50)
      expect(timeline.getSegmentAvailabilityEnd()).toBe(50);
    });

    it('calculates time when there a transition of live to static', () => {
      const timeline = makeLiveTimeline(/* availability= */ 20);

      const ref1 = makeSegmentReference(0, 10);
      const ref2 = makeSegmentReference(10, 20);
      const ref3 = makeSegmentReference(20, 30);
      const ref4 = makeSegmentReference(30, 40);
      const ref5 = makeSegmentReference(40, 50);

      setElapsed(50);
      timeline.notifySegments([ref1, ref2, ref3, ref4, ref5]);

      expect(timeline.getSegmentAvailabilityEnd()).toBe(50);

      timeline.setStatic(true);

      expect(timeline.getSegmentAvailabilityEnd()).toBe(50);
    });
  });

  describe('getDuration', () => {
    it('returns the timeline duration', () => {
      setElapsed(0);
      const timeline1 = makeVodTimeline(/* duration= */ 60);
      const timeline2 = makeIprTimeline(/* duration= */ 60);
      const timeline3 = makeLiveTimeline(/* availability= */ 20);
      const timeline4 = makeLiveTimeline(/* availability= */ Infinity);
      expect(timeline1.getDuration()).toBe(60);
      expect(timeline2.getDuration()).toBe(60);
      expect(timeline3.getDuration()).toBe(Infinity);
      expect(timeline4.getDuration()).toBe(Infinity);
    });
  });

  describe('setDuration', () => {
    it('affects availability end for VOD', () => {
      setElapsed(0);
      const timeline = makeVodTimeline(/* duration= */ 60);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(90);
    });

    it('affects availability end for IPR', () => {
      const timeline = makeIprTimeline(/* duration= */ 60);

      setElapsed(85);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(60);

      timeline.setDuration(90);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(75);
    });
  });

  describe('clockOffset', () => {
    it('offsets availability calculations', () => {
      const timeline = makeLiveTimeline(/* availability= */ 10);
      setElapsed(11);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(1);

      timeline.setClockOffset(/* ms= */ 5000);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(6);
    });
  });

  describe('getSafeSeekRangeStart', () => {
    it('ignores offset for VOD', () => {
      const timeline = makeVodTimeline(/* duration= */ 60);
      expect(timeline.getSafeSeekRangeStart(0)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(10)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(0);
    });

    it('offsets from live edge', () => {
      const timeline = makeLiveTimeline(/* availability= */ 60, /* delay= */ 0);

      setElapsed(120);
      // now (120) - availability (60) - segment size (10) = 50
      expect(timeline.getSeekRangeStart()).toBe(50);

      expect(timeline.getSafeSeekRangeStart(10)).toBe(60);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(75);
    });

    it('clamps to end', () => {
      const timeline = makeLiveTimeline(/* availability= */ 60, /* delay= */ 0);

      setElapsed(120);
      expect(timeline.getSegmentAvailabilityEnd()).toBe(110);
      expect(timeline.getSafeSeekRangeStart(70)).toBe(110);
      expect(timeline.getSafeSeekRangeStart(85)).toBe(110);
      expect(timeline.getSafeSeekRangeStart(200)).toBe(110);
    });

    it('will return 0 if safe', () => {
      const timeline = makeLiveTimeline(/* availability= */ 60, /* delay= */ 0);

      setElapsed(50);
      // now (50) - availability (60) - segment size (10) = -20
      expect(timeline.getSeekRangeStart()).toBe(0);
      expect(timeline.getSafeSeekRangeStart(0)).toBe(0);
      expect(timeline.getSafeSeekRangeStart(25)).toBe(5);
    });

    // Regression test for https://github.com/google/shaka-player/issues/2831
    it('will round up to the nearest ms', () => {
      const timeline = makeVodTimeline(/* duration= */ 60);
      // Seeking to this exact number may result in seeking to slightly less
      // than that, due to rounding.
      timeline.setUserSeekStart(1.458666666666666);
      // So the safe range start should be slightly higher, with fewer digits.
      expect(timeline.getSafeSeekRangeStart(0)).toBe(1.459);
    });
  });

  describe('getSeekRangeEnd', () => {
    it('accounts for delay for live and IPR', () => {
      const timeline1 = makeIprTimeline(/* duration= */ 60, /* delay= */ 7);
      const timeline2 = makeLiveTimeline(/* duration= */ 60, /* delay= */ 7);

      setElapsed(11);
      expect(timeline1.getSeekRangeEnd()).toBe(0);
      expect(timeline2.getSeekRangeEnd()).toBe(0);

      setElapsed(18);
      expect(timeline1.getSeekRangeEnd()).toBe(1);
      expect(timeline2.getSeekRangeEnd()).toBe(1);

      setElapsed(37);
      expect(timeline1.getSeekRangeEnd()).toBe(20);
      expect(timeline2.getSeekRangeEnd()).toBe(20);
    });
  });
});

