import { render, screen } from '@testing-library/react';
import App from './App';

/**
 * This file previously contained Create React App's untouched boilerplate — it
 * asserted the presence of a "learn react" link that has never existed in this
 * application. It could only ever fail, and nobody noticed because the suite
 * did not run at all: react-router-dom v7 declares `main: ./dist/main.js`, a
 * file it does not ship, so CRA's Jest resolver threw before reaching any test.
 * The moduleNameMapper in package.json points at the file that does exist.
 *
 * What is worth asserting here is the routing contract: which screens require a
 * session and which are deliberately reachable without one.
 */

const renderAt = (path) => {
  window.history.pushState({}, '', path);
  return render(<App />);
};

beforeEach(() => {
  localStorage.clear();
});

describe('routing for a signed-out visitor', () => {
  test('the landing route redirects to login rather than rendering the feed', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  test.each([
    ['/coach'],
    ['/leaderboard'],
    ['/ai-usage'],
    ['/knowledge-graph'],
  ])('%s is gated — it calls authenticated endpoints', (path) => {
    renderAt(path);
    // Reaching these while signed out used to render the dashboard, fire
    // requests that 401'd, and bounce to /login via the axios interceptor.
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  test('an unknown path falls back to the landing route', () => {
    renderAt('/no-such-page');
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  test('register is reachable without a session', () => {
    renderAt('/register');
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
  });
});
