// Which read of the questions counts. Knows nothing about Herdr, so the tests run it under
// Node.js.
//
// One read runs at a time. A read asked for while one runs is done right after it, so no
// change is missed. A read that must start now (as after sending) starts anyway, and the
// older one is then dropped when it ends, since its lists may be from before the send.
export class Reads {
  constructor() {
    this.count = 0; // reads started, so one that ends after a newer one is dropped
    this.busy = false; // a read runs
    this.asked = false; // a read was asked for while one ran
  }

  // A new read's number, or null when one runs and this one waits (now: start anyway).
  /** @returns {number | null} */
  start(now = false) {
    if (this.busy && !now) {
      this.asked = true;
      return null;
    }
    this.busy = true;
    return ++this.count;
  }

  // Whether read is still the newest, so its lists count.
  /** @param {number} read */
  current(read) {
    return read === this.count;
  }

  // read ended; only the newest one frees the way for the next.
  /** @param {number} read */
  end(read) {
    if (read === this.count) this.busy = false;
  }

  // Whether a read was asked for while one ran; asking clears it.
  again() {
    const asked = this.asked;
    this.asked = false;
    return asked;
  }
}
