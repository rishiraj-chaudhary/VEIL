// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

/**
 * Browser globals that react-scripts 5's jsdom predates.
 *
 * react-router v7 reaches for TextEncoder at import time, so without these the
 * suite cannot even load App.js — which is part of why the frontend tests had
 * never run. Node has provided all three for years; jsdom simply does not
 * install them into the test global.
 */
import { TextDecoder, TextEncoder } from 'util';

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder;
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder;

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = value => JSON.parse(JSON.stringify(value));
}

// jsdom implements neither, and components that observe layout or media queries
// throw on mount without them.
if (typeof global.ResizeObserver === 'undefined') {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}
