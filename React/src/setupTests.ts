import '@testing-library/jest-dom';
import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();

/* jsdom has no ResizeObserver (used by the sliding tab indicators) */
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub;
Element.prototype.scrollTo = Element.prototype.scrollTo ?? function () {};
